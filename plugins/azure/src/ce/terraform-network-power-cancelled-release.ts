import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import {
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkPowerSelections,
  observeAzureTerraformNetworkPower,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from './terraform-network-power';
import { validateAzureTerraformPowerCancellationPacket } from './terraform-network-power-cancellation-packet';
import { withAzureTerraformPowerLifecycle } from './terraform-network-power-lifecycle';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkRetirementGraph } from './terraform-network-retirement-graph';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const address = 'azapi_resource_action.ce_network';
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform cancelled power release: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed release packet');
  return value as Record<string, unknown>;
}
/** State-only release of an already authenticated, unsubmitted cancellation. The original
 * VM action is never applied. Selected state absence does not qualify whole-state cleanup,
 * artifact retirement, serial operational acceptance or parent retirement.
 */
type CancelledPowerStageArguments = [
  request: AzureCePlan,
  node: number,
  operation: 'deallocate' | 'start',
  rawTerraform: CeTerraformService,
  rawStore: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  rawApi: AzExecApi | undefined,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
];
export async function releaseAzureTerraformNetworkCancelledPowerStage(
  ...args: CancelledPowerStageArguments & { 8: AzExecApi }
) {
  const result = await runCancelledPowerStage(args, false);
  require(result.scope !== 'selected-cancelled-network-power-retirement-history', 'unexpected inspection result');
  return result;
}
/** Retire only the selected cancelled power runner. Parent/external cleanup remains separate. */
export async function retireAzureTerraformNetworkCancelledPowerStage(
  ...args: CancelledPowerStageArguments & { 8: AzExecApi }
) {
  const result = await runCancelledPowerStage(args, true);
  require(result.scope !== 'selected-cancelled-network-power-retirement-history', 'unexpected inspection result');
  return result;
}
/** Read historical cleanup custody without cloud observation, execution, publication or lock files.
 * Missing/partial/unpublished evidence cannot qualify retirement. Operational acceptance is separate.
 */
export async function readAzureTerraformNetworkCancelledPowerRetirement(
  request: AzureCePlan,
  node: number,
  operation: 'deallocate' | 'start',
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const result = await runCancelledPowerStage(
    [request, node, operation, terraform, store, loaders, site, verifier, undefined, {}, signal, replacementVerifier],
    true,
    true,
  );
  require(result.scope === 'selected-cancelled-network-power-retirement-history', 'unexpected mutation result');
  return result;
}
async function runCancelledPowerStage(args: CancelledPowerStageArguments, retire: boolean, readOnly = false) {
  const [
    request,
    node,
    operation,
    rawTerraform,
    rawStore,
    loaders,
    siteRequest,
    verifier,
    rawApi,
    environment,
    signal,
    replacementVerifier,
  ] = args;
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(rawStore.owner),
    directory = rawStore.directory,
    env = { ...environment };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings: Array<{ object: object; key: PropertyKey; value: unknown }> = [];
  const bind = (target: object, keys: string[]) => {
    for (const key of keys) bindings.push({ object: target, key, value: Reflect.get(target, key) });
  };
  bind(rawTerraform, ['open']);
  bind(rawStore, ['read', 'write', 'verify']);
  bind(loaders, ['loadSource', 'loadOutcome']);
  if (rawApi) bind(rawApi, ['exec']);
  require(readOnly || rawApi, 'cloud observer required for release or retirement');
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, plan) &&
      same(siteRequest, site) &&
      same(rawStore.owner, owner) &&
      same(environment, env) &&
      rawStore.directory === directory &&
      bindings.every(
        ({ object: target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependency changed');
  };
  seal();
  require(Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    (operation === 'deallocate' || operation === 'start'), 'selected node or operation differs');
  // Inspection deliberately does not acquire lifecycle locks: those publish claim files.
  const execute = readOnly
    ? async <T>(
        _directory: string,
        _deadline: AbortSignal,
        _seal: () => void,
        action: (step: <V>(action: () => Promise<V>, mutation?: boolean) => Promise<V>) => Promise<T>,
      ) =>
        action(async (work, mutation) => {
          seal();
          require(!mutation, 'inspection cannot execute a mutation');
          const aborted = Promise.withResolvers<never>(),
            onAbort = () => aborted.reject(deadline.reason);
          deadline.addEventListener('abort', onAbort, { once: true });
          try {
            const value = await Promise.race([work(), aborted.promise]);
            seal();
            return value;
          } finally {
            deadline.removeEventListener('abort', onAbort);
          }
        })
    : withAzureTerraformPowerLifecycle;
  return execute(
    directory,
    deadline,
    seal,
    async (step) => {
      const guard = <T extends object>(target: T, keys: string[], mutations: string[] = []): T => {
        bind(target, keys);
        const methods = new Map<PropertyKey, unknown>();
        for (const key of keys) {
          const method = Reflect.get(target, key);
          if (typeof method === 'function')
            methods.set(key, (...args: unknown[]) =>
              step(async () => await Reflect.apply(method, target, args), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (target, key) => (methods.has(key) ? methods.get(key) : Reflect.get(target, key)),
        });
      };
      const store = guard(rawStore, ['read', 'write', 'verify'], ['write']),
        terraform = guard(rawTerraform, ['open'], readOnly ? [] : ['open']),
        api = rawApi ? guard(rawApi, ['exec']) : undefined;
      const graphRead = () =>
        step(() =>
          readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
        );
      const graph = await graphRead(),
        graphSha256 = canonicalSha256(graph),
        row = graph.checkpoint.snapshot?.checkpoint.nodes.find((value) => value.node === node),
        historyNode = graph.nodes.find((value) => value.node === node);
      require(row && historyNode?.preflightPresent, 'original selected preflight unavailable');
      const before = row.before,
        history = operation === 'deallocate' ? historyNode.deallocate : historyNode.start;
      require(!history.receipts.release &&
        !history.receipts.current &&
        !history.packetSha256ByName[
          `${plan.planId}-terraform-network-node-${node}-${operation}-mutation-complete.json`
        ], 'completed mutation requires its owning release lifecycle');
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation)),
        release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      require(mutation.stage &&
        graph.powerDeployments.some((value) => same(value, mutation)), 'original runner identity differs');
      const root = join(directory, 'terraform-stages'),
        stageDirectory = join(root, mutation.stage),
        runnerDirectory = join(stageDirectory, mutation.deploymentId);
      const inventory = (path: string) =>
        step(async () => {
          const stat = await lstat(path);
          require(stat.isDirectory() &&
            !stat.isSymbolicLink() &&
            stat.uid === process.getuid?.() &&
            (stat.mode & 0o077) === 0 &&
            (await realpath(path)) === path, 'stage ownership differs');
          return (await readdir(path)).sort();
        });
      const names = await inventory(root),
        stages = await inventory(stageDirectory);
      require(names
        .filter((name) => name.startsWith(`network-${plan.planSha256.slice(0, 24)}-`))
        .every((stage) => graph.powerDeployments.some((value) => value.stage === stage)) &&
        same(stages, [mutation.deploymentId]), 'foreign or orphan selected runner');
      const runnerNames = await inventory(runnerDirectory);
      const barrierPresent = runnerNames.includes('artifact-retirement.json');
      require(!runnerNames.includes('configuration-transition.json') &&
        (!barrierPresent || retire), 'pending revision or artifact retirement requires owner recovery');
      const identity = canonicalSha256({
          planSha256: plan.planSha256,
          selectedNode: node,
          selectedOperation: operation,
        }).slice(0, 24),
        cancellationName = `azure-power-cancel-${identity}.json`,
        prefix = `azure-power-state-release-${identity}`;
      const optional = async (name: string): Promise<unknown | undefined> => {
        try {
          return await store.read(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      const saved = await store.read(cancellationName),
        cancellationPacketSha256 = canonicalSha256(saved);
      const cancellationBound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        mutationDeploymentSha256: canonicalSha256(mutation),
        releaseDeploymentSha256: canonicalSha256(release),
      };
      const original = await step(() =>
        validateAzureTerraformPowerCancellationPacket(
          plan,
          before,
          node,
          operation,
          cancellationBound,
          saved,
          history.receipts.mutation,
        ),
      );
      require(original.packet.status === 'cancelled', 'completed original cancellation required');
      const originalProvenance = object(original.packet.provenance);
      require(same(
        Object.keys(originalProvenance).sort(),
        [
          'schemaVersion',
          'scope',
          'status',
          'manifestSha256',
          'cancellationRecordSha256',
          'originalReceiptSha256',
          'originalArchiveSha256s',
          'currentConfigurationSha256',
          'cancellationQualified',
          'applicationOutcomeQualified',
          'runnerRetirementQualified',
          'retirementQualified',
        ].sort(),
      ) &&
        originalProvenance.schemaVersion === 1 &&
        originalProvenance.scope === 'exact-unsubmitted-plan-cancellation-provenance' &&
        originalProvenance.status === 'cancelled' &&
        originalProvenance.cancellationQualified === true &&
        originalProvenance.applicationOutcomeQualified === false &&
        originalProvenance.runnerRetirementQualified === false &&
        originalProvenance.retirementQualified === false &&
        originalProvenance.currentConfigurationSha256 === hash(release.configuration) &&
        originalProvenance.originalReceiptSha256 ===
          canonicalSha256(original.receipt), 'original cancellation provenance schema or qualification differs');

      const session = guard(
        await terraform.open(owner, mutation, 'current'),
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readUnsubmittedPlanCancellation',
          'readCancelledPlanContinuation',
          'readPlannedResourceFields',
          'readProposedResourceFields',
          'readAppliedResourceFields',
          'plan',
          'apply',
          'reconcileApplyFromEvidence',
          'readArtifactRetirement',
          'retireArtifacts',
        ],
        ['plan', 'apply', 'reconcileApplyFromEvidence', 'retireArtifacts'],
      );
      require(session.readConfigurationSha256 &&
        session.readCurrentPlanJournal &&
        session.readPlanApplicationHistory &&
        session.readUnsubmittedPlanCancellation &&
        session.readCancelledPlanContinuation, 'owning continuation contract unavailable');
      const readCurrent = session.readCurrentPlanJournal,
        readHistory = session.readPlanApplicationHistory,
        readCancellation = session.readUnsubmittedPlanCancellation,
        readContinuation = session.readCancelledPlanContinuation;
      const configuration = async () =>
        require((await session.readConfigurationSha256?.()) ===
          hash(release.configuration), 'exact derived release configuration required');
      const { configuration: source, providerLock, ...deploymentIdentity } = release;
      const manifestSha256 = canonicalSha256({
        ...deploymentIdentity,
        configurationSha256: hash(source),
        providerLockSha256: hash(providerLock),
      });
      require(originalProvenance.manifestSha256 === manifestSha256, 'original cancellation manifest differs');
      const journal = async () => {
        await configuration();
        const value = await readCurrent.call(session, hash(release.configuration), deadline);
        require(value.schemaVersion === 1 &&
          value.scope === 'current-saved-plan-byte-and-journal-binding' &&
          value.planSemanticsQualified === false &&
          value.manifestSha256 === manifestSha256, 'current journal identity differs');
        return value;
      };
      const originalCustody = async (receipt?: PlanReceipt) => {
        const value = receipt
          ? await readContinuation.call(
              session,
              original.receipt,
              hash(mutation.configuration),
              hash(release.configuration),
              original.evidenceSha256,
              receipt,
              deadline,
            )
          : await readCancellation.call(
              session,
              original.receipt,
              hash(mutation.configuration),
              hash(release.configuration),
              original.evidenceSha256,
              deadline,
            );
        require(value.schemaVersion === 1 &&
          value.scope ===
            (receipt
              ? 'exact-cancelled-plan-current-continuation-provenance'
              : 'exact-unsubmitted-plan-cancellation-provenance') &&
          (receipt || ('status' in value && value.status === 'cancelled')) &&
          (!receipt || ('planSemanticsQualified' in value && value.planSemanticsQualified === false)) &&
          value.cancellationQualified === true &&
          value.cancellationRecordSha256 === originalProvenance.cancellationRecordSha256 &&
          same(value.originalArchiveSha256s, originalProvenance.originalArchiveSha256s) &&
          value.originalReceiptSha256 === canonicalSha256(original.receipt) &&
          value.currentConfigurationSha256 === hash(release.configuration) &&
          value.manifestSha256 === manifestSha256 &&
          value.applicationOutcomeQualified === false &&
          value.runnerRetirementQualified === false &&
          value.retirementQualified === false, 'original cancellation record or archive custody differs');
        const archived = await readHistory.call(session, original.receipt, deadline);
        require(archived.schemaVersion === 1 &&
          archived.scope === 'exact-saved-plan-journal-history' &&
          archived.receiptSha256 === canonicalSha256(original.receipt) &&
          archived.incompleteArchives === 0 &&
          archived.applicationOutcomeQualified === false &&
          archived.retirementQualified === false &&
          archived.matches.every((entry) => entry.state === 'planned') &&
          archived.matches.some(
            (entry) =>
              entry.location !== 'current' &&
              entry.journalSha256 === original.packet.originalJournalSha256 &&
              entry.savedPlanSha256 === original.receipt.planSha256,
          ) &&
          same(
            archived.matches.map((entry) => entry.archiveSha256).toSorted(),
            originalProvenance.originalArchiveSha256s,
          ), 'original unsubmitted archive history differs');
        require(canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
          canonicalSha256(await graphRead()) === graphSha256 &&
          same(await inventory(root), names) &&
          same(await inventory(stageDirectory), stages), 'original source or stage inventory changed');
        return value;
      };
      const appliedNics = Array.from({ length: node - 1 }, (_, index) =>
        plan.nics.map((nic) => `${index + 1}:${nic.index}`),
      ).flat();
      if (operation === 'start') appliedNics.push(...plan.nics.map((nic) => `${node}:${nic.index}`));
      const observe = () =>
        step(async () => {
          require(api && !readOnly, 'inspection cannot collect current cloud evidence');
          const value = await observeAzureTerraformNetworkPower(
            plan,
            before,
            node,
            operation,
            appliedNics,
            api,
            deadline,
          );
          require(['running', 'deallocated', 'stopped'].includes(
            value.powerState,
          ), 'stable selected power observation required');
          const { observedAt: _observedAt, inventory: inventoryValue, ...power } = value;
          const { collectedAt: _collectedAt, ...network } = inventoryValue;
          return { ...power, inventory: network };
        });
      const bound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        cancellationPacketSha256,
        originalReceiptSha256: canonicalSha256(original.receipt),
        originalEvidenceSha256: original.evidenceSha256,
        releaseDeploymentSha256: canonicalSha256(release),
        manifestSha256,
      };
      const packet = (input: unknown, fields: string[]) => {
        const value = object(input);
        require(same(Object.keys(value).sort(), [...Object.keys(bound), ...fields].sort()) &&
          Object.entries(bound).every(([key, expected]) =>
            same(value[key], expected),
          ), 'release packet source or schema differs');
        return value;
      };
      const persist = async (name: string, value: unknown) => {
        const saved = await optional(name);
        require(saved === undefined || same(saved, value), 'immutable release publication differs');
        if (saved === undefined) await store.write(name, value);
        require(same(await store.read(name), value), 'release publication changed');
      };
      const retiredPrefix = `azure-power-runner-retirement-${identity}`;
      const retirement = async (proof?: {
        final: PlanReceipt;
        baseline: unknown;
        releaseReceiptSha256: string;
        finalJournalSha256: string;
        finalExecutionSha256: string;
      }) => {
        require(session.readArtifactRetirement &&
          (readOnly || session.retireArtifacts), 'owning artifact retirement contract unavailable');
        const phaseNames = ['authorization', 'plan', 'submission', 'outcome', 'complete', 'finalizing', 'final'].map(
          (phase) => `${prefix}-${phase}.json`,
        );
        const preparingName = `${retiredPrefix}-preparing.json`,
          retiringName = `${retiredPrefix}-retiring.json`,
          retiredName = `${retiredPrefix}-retired.json`;
        const snapshots: Record<string, string | null> = {};
        for (const name of phaseNames) {
          const value = await optional(name);
          snapshots[name] = value === undefined ? null : canonicalSha256(value);
        }
        const inspection = (
          status: 'absent' | 'preparing' | 'retiring' | 'retired-unpublished' | 'retired',
          proof?: unknown,
        ) => ({
          schemaVersion: 1 as const,
          scope: 'selected-cancelled-network-power-retirement-history' as const,
          sourcePlanSha256: plan.planSha256,
          graphSha256,
          node,
          operation,
          stage: mutation.stage,
          status,
          proof,
          runnerRetirementQualified: status === 'retired',
          currentOperationalAcceptanceQualified: false as const,
          parentRetirementQualified: false as const,
          retirementQualified: false as const,
        });
        let preparing = await optional(preparingName);
        if (readOnly && preparing === undefined) {
          require(!barrierPresent &&
            (await optional(retiringName)) === undefined &&
            (await optional(retiredName)) === undefined, 'retirement evidence lacks original preparing authorization');
          require(canonicalSha256(await graphRead()) === graphSha256 &&
            canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
            same(await inventory(root), names) &&
            same(await inventory(stageDirectory), stages) &&
            same(await inventory(runnerDirectory), runnerNames) &&
            (await optional(preparingName)) === undefined, 'absent preparation changed during inspection');
          return inspection('absent');
        }
        if (proof) {
          require(!barrierPresent, 'new preparing authorization cannot follow a barrier');
          require(phaseNames.every(
            (name) => name.endsWith('-submission.json') || snapshots[name] !== null,
          ), 'original release packet unavailable before retirement');
          const expected = {
            ...bound,
            status: 'preparing',
            packetSha256ByName: snapshots,
            finalReceipt: proof.final,
            baseline: proof.baseline,
            releaseReceiptSha256: proof.releaseReceiptSha256,
            finalJournalSha256: proof.finalJournalSha256,
            finalExecutionSha256: proof.finalExecutionSha256,
          };
          if (preparing === undefined) {
            require((await optional(retiringName)) === undefined &&
              (await optional(retiredName)) ===
                undefined, 'retirement publication lacks original preparing authorization');
          }
          await persist(preparingName, expected);
          preparing = expected;
        }
        require(preparing !== undefined, 'permanent barrier lacks original preparing authorization');
        const prepared = packet(preparing, [
          'status',
          'packetSha256ByName',
          'finalReceipt',
          'baseline',
          'releaseReceiptSha256',
          'finalJournalSha256',
          'finalExecutionSha256',
        ]);
        require(prepared.status === 'preparing' &&
          same(prepared.packetSha256ByName, snapshots) &&
          phaseNames.every((name) => name.endsWith('-submission.json') || snapshots[name] !== null) &&
          [prepared.releaseReceiptSha256, prepared.finalJournalSha256, prepared.finalExecutionSha256].every(
            (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
          ), 'original retirement preparation or packet custody differs');
        const final = await step(() =>
          validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, prepared.finalReceipt, 'final'),
        );
        const savedFinal = packet(await store.read(`${prefix}-final.json`), [
          'status',
          'planPacketSha256',
          'completionSha256',
          'finalizingSha256',
          'receipt',
          'journalSha256',
          'executionSha256',
        ]);
        require(savedFinal.status === 'final' &&
          same(savedFinal.receipt, final) &&
          savedFinal.journalSha256 === prepared.finalJournalSha256 &&
          savedFinal.executionSha256 === prepared.finalExecutionSha256, 'original final retirement receipt differs');
        const preparingSha256 = canonicalSha256(prepared),
          retiring = { ...bound, status: 'retiring', preparingSha256, finalReceiptSha256: canonicalSha256(final) };
        const unchanged = async () => {
          require(canonicalSha256(await graphRead()) === graphSha256 &&
            canonicalSha256(await store.read(cancellationName)) === cancellationPacketSha256 &&
            same(await inventory(root), names) &&
            same(await inventory(stageDirectory), stages) &&
            same(await store.read(preparingName), prepared), 'retirement source changed');
          for (const name of phaseNames) {
            const value = await optional(name);
            require((value === undefined ? null : canonicalSha256(value)) ===
              snapshots[name], 'retirement original release packet changed');
          }
          if (!readOnly)
            require(same(await observe(), prepared.baseline), 'selected cloud identity changed during retirement');
          else
            require(same(
              await inventory(runnerDirectory),
              runnerNames,
            ), 'retained runner inventory changed during inspection');
        };
        await unchanged();
        let observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        if (readOnly) {
          require(['absent', 'retiring', 'runner-artifacts-retired'].includes(
            observed.status,
          ), 'retirement reader status differs');
          const savedRetiring = await optional(retiringName),
            savedRetired = await optional(retiredName);
          if (savedRetiring !== undefined)
            require(same(savedRetiring, retiring), 'original retiring authorization differs');
          require(observed.status === 'absent' ||
            savedRetiring !== undefined, 'barrier lacks original retiring authorization');
          require(observed.status === 'runner-artifacts-retired' ||
            savedRetired === undefined, 'incomplete barrier has completed retirement publication');
          let status: 'preparing' | 'retiring' | 'retired-unpublished' | 'retired' =
            observed.status === 'absent' ? 'preparing' : 'retiring';
          if (observed.status === 'runner-artifacts-retired') {
            require(observed.receipt.manifestSha256 === manifestSha256 &&
              observed.receipt.evidenceSha256 === preparingSha256 &&
              observed.receipt.finalPlanSha256 === final.planSha256 &&
              typeof observed.markerSha256 === 'string' &&
              /^[a-f0-9]{64}$/.test(observed.markerSha256), 'original retained retirement receipt binding differs');
            const expected = {
              ...bound,
              status: 'retired',
              preparingSha256,
              retiringSha256: canonicalSha256(retiring),
              finalReceiptSha256: canonicalSha256(final),
              markerSha256: observed.markerSha256,
              receipt: observed.receipt,
            };
            require(savedRetired === undefined ||
              same(savedRetired, expected), 'retired publication differs from retained receipt');
            status = savedRetired === undefined ? 'retired-unpublished' : 'retired';
          }
          await unchanged();
          require(same({ value: await optional(retiringName) }, { value: savedRetiring }) &&
            same({ value: await optional(retiredName) }, { value: savedRetired }) &&
            same(
              await session.readArtifactRetirement(final, preparingSha256, deadline),
              observed,
            ), 'retirement proof changed across inspection');
          await unchanged();
          require(same({ value: await optional(retiringName) }, { value: savedRetiring }) &&
            same(
              { value: await optional(retiredName) },
              { value: savedRetired },
            ), 'retirement publication changed at final inspection boundary');
          return inspection(status, {
            preparingSha256,
            finalReceiptSha256: canonicalSha256(final),
            publicationSha256: savedRetired === undefined ? null : canonicalSha256(savedRetired),
            observed,
          });
        }
        require(session.retireArtifacts, 'owning retirement mutation contract unavailable');
        if (observed.status === 'absent') {
          require(proof &&
            !barrierPresent &&
            (await optional(retiredName)) === undefined, 'absent barrier cannot recover completed retirement');
          const current = await journal();
          require(current.state === 'planned' &&
            same(current.receipt, final) &&
            current.journalSha256 === prepared.finalJournalSha256 &&
            current.executionSha256 === prepared.finalExecutionSha256 &&
            current.ordinaryRefreshEnabled === true, 'original final journal changed before retirement');
          await persist(retiringName, retiring);
          await unchanged();
          await session.retireArtifacts(final, preparingSha256, env, deadline);
          observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        } else {
          require(same(await optional(retiringName), retiring), 'barrier lacks original retiring authorization');
          if (observed.status === 'retiring') {
            require((await optional(retiredName)) ===
              undefined, 'partial barrier has completed retirement publication');
            await unchanged();
            await session.retireArtifacts(final, preparingSha256, env, deadline);
            observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
          }
        }
        require(observed.status === 'runner-artifacts-retired', 'selected runner retirement remains incomplete');
        require(observed.receipt.manifestSha256 === manifestSha256 &&
          observed.receipt.evidenceSha256 === preparingSha256 &&
          observed.receipt.finalPlanSha256 === final.planSha256 &&
          typeof observed.markerSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(observed.markerSha256), 'original retained retirement receipt binding differs');
        const retired = {
          ...bound,
          status: 'retired',
          preparingSha256,
          retiringSha256: canonicalSha256(retiring),
          finalReceiptSha256: canonicalSha256(final),
          markerSha256: observed.markerSha256,
          receipt: observed.receipt,
        };
        await unchanged();
        require(same(await optional(retiringName), retiring), 'retiring authorization changed');
        await persist(retiredName, retired);
        require(same(
          await session.readArtifactRetirement(final, preparingSha256, deadline),
          observed,
        ), 'retained retirement proof changed before final boundary');
        await unchanged();
        seal();
        return {
          schemaVersion: 1 as const,
          scope: 'selected-cancelled-network-power-runner-retirement' as const,
          sourcePlanSha256: plan.planSha256,
          node,
          operation,
          stage: mutation.stage,
          cancellationPacketSha256,
          releaseReceiptSha256: prepared.releaseReceiptSha256 as string,
          finalReceiptSha256: canonicalSha256(final),
          preparingSha256,
          markerSha256: observed.markerSha256,
          artifactRetirementReceiptSha256: canonicalSha256(observed.receipt),
          selectedReleaseOutcomeQualified: true as const,
          finalOrdinarySelectedAbsenceQualified: true as const,
          wholeAppliedStateEmptyQualified: true as const,
          independentCleanupQualified: true as const,
          runnerRetirementQualified: true as const,
          parentRetirementQualified: false as const,
          retirementQualified: false as const,
        };
      };
      if (readOnly || barrierPresent) return retirement();
      let authorization = await optional(`${prefix}-authorization.json`);
      if (authorization === undefined) {
        await originalCustody();
        const current = await journal();
        require(current.state === 'absent' &&
          current.receipt === undefined &&
          current.savedPlanSha256 === null &&
          current.journalSha256 === null, 'saved release lacks original planning authorization');
        require((await optional(`${prefix}-plan.json`)) === undefined &&
          (await optional(`${prefix}-submission.json`)) === undefined &&
          (await optional(`${prefix}-outcome.json`)) === undefined &&
          (await optional(`${prefix}-complete.json`)) === undefined &&
          (await optional(`${prefix}-finalizing.json`)) === undefined &&
          (await optional(`${prefix}-final.json`)) === undefined, 'release packets lack original authorization');
        authorization = { ...bound, status: 'authorized', prior: original.packet.prior, baseline: await observe() };
        await persist(`${prefix}-authorization.json`, authorization);
      }
      const authorized = packet(authorization, ['status', 'prior', 'baseline']);
      require(authorized.status === 'authorized' &&
        same(authorized.prior, original.packet.prior) &&
        same(authorized.baseline, await observe()), 'original selected prior or stable cloud baseline differs');
      const authorizationSha256 = canonicalSha256(authorized);
      const stable = async () =>
        require(same(await observe(), authorized.baseline), 'selected VM or network changed during state-only release');
      const sealAuthorization = async () =>
        require(same(
          await store.read(`${prefix}-authorization.json`),
          authorized,
        ), 'original release authorization changed');
      let planPacket = await optional(`${prefix}-plan.json`);
      if (planPacket === undefined) {
        await sealAuthorization();
        const current = await journal();
        let receipt: PlanReceipt;
        if (current.state === 'absent') {
          await originalCustody();
          await stable();
          receipt = await session.plan(env, deadline);
        } else {
          require(current.state === 'planned' &&
            current.receipt, 'unpublished submitted release requires original plan and submission');
          receipt = current.receipt;
        }
        await step(() => validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, receipt, 'release'));
        const prior = await session.readPlannedResourceFields(
            receipt,
            azureTerraformNetworkPowerSelections,
            env,
            deadline,
          ),
          proposed = await session.readProposedResourceFields(
            receipt,
            azureTerraformNetworkPowerSelections,
            env,
            deadline,
          );
        await step(() =>
          validateAzureTerraformNetworkPowerProjection(
            plan,
            before,
            node,
            operation,
            receipt,
            'release',
            prior,
            proposed,
          ),
        );
        require(same(prior, original.packet.prior), 'release prior differs from original cancelled prior');
        const custody = await originalCustody(receipt);
        require('continuation' in custody &&
          custody.continuation &&
          custody.continuation.state === 'planned' &&
          custody.continuation.ordinaryRefreshEnabled ===
            true, 'release lacks original ordinary unsubmitted execution');
        planPacket = {
          ...bound,
          status: 'planned',
          authorizationSha256,
          receipt,
          prior,
          proposed,
          originalExecutionSha256: custody.continuation.executionSha256,
          originalReleaseJournalSha256: custody.continuation.journalSha256,
        };
        await stable();
        await sealAuthorization();
        await persist(`${prefix}-plan.json`, planPacket);
      }
      const planned = packet(planPacket, [
        'status',
        'authorizationSha256',
        'receipt',
        'prior',
        'proposed',
        'originalExecutionSha256',
        'originalReleaseJournalSha256',
      ]);
      require(planned.status === 'planned' &&
        planned.authorizationSha256 === authorizationSha256 &&
        same(planned.prior, original.packet.prior) &&
        typeof planned.originalExecutionSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(planned.originalExecutionSha256) &&
        typeof planned.originalReleaseJournalSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(planned.originalReleaseJournalSha256), 'original release plan binding differs');
      const released = await step(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, planned.receipt, 'release'),
      );
      await step(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          released,
          'release',
          planned.prior,
          planned.proposed,
        ),
      );
      const planPacketSha256 = canonicalSha256(planned);
      const expectedSubmission = {
        ...bound,
        status: 'submitted',
        planPacketSha256,
        authorizationSha256,
        receiptSha256: canonicalSha256(released),
        originalReleaseJournalSha256: planned.originalReleaseJournalSha256,
      };
      const validateSubmission = async () =>
        require(released.noChanges
          ? (await optional(`${prefix}-submission.json`)) === undefined
          : same(
              await optional(`${prefix}-submission.json`),
              expectedSubmission,
            ), 'original submission authorization differs');
      const active = async (receipt: PlanReceipt) => {
        const value = await originalCustody(receipt);
        require('continuation' in value &&
          value.continuation &&
          value.continuation.ordinaryRefreshEnabled === true &&
          value.continuation.executionSha256 === planned.originalExecutionSha256, 'original release execution changed');
        return value.continuation;
      };
      const outcomeName = `${prefix}-outcome.json`,
        completionName = `${prefix}-complete.json`;
      let complete = await optional(completionName);
      if (complete === undefined) {
        let current = await active(released);
        const submission = {
          ...bound,
          status: 'submitted',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          originalReleaseJournalSha256: planned.originalReleaseJournalSha256,
        };
        if (!released.noChanges) {
          const submitted = await optional(`${prefix}-submission.json`);
          if (current.state === 'planned') {
            require(current.journalSha256 ===
              planned.originalReleaseJournalSha256, 'original planned journal changed before submission');
            require(submitted === undefined || same(submitted, submission), 'planned submission authorization differs');
            await stable();
            await sealAuthorization();
            await persist(`${prefix}-submission.json`, submission);
            await session.apply(released, env, deadline);
            current = await active(released);
          } else
            require(same(submitted, submission) &&
              (current.state === 'applying' ||
                current.state === 'applied'), 'submitted release lacks exact original submission authorization');
        } else
          require(current.state === 'planned' &&
            current.journalSha256 === planned.originalReleaseJournalSha256 &&
            (await optional(`${prefix}-submission.json`)) === undefined, 'empty release has an unexpected submission');
        const fields = await session.readAppliedResourceFields(
          released,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        );
        require(same(fields, { [address]: null }), 'selected release outcome unavailable: original control remains');
        await stable();
        await sealAuthorization();
        const outcome = {
          ...bound,
          status: 'observed',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          originalExecutionSha256: planned.originalExecutionSha256,
          state: fields,
          cloud: authorized.baseline,
        };
        await persist(outcomeName, outcome);
        require(same(
          await session.readAppliedResourceFields(released, azureTerraformNetworkPowerSelections, env, deadline),
          fields,
        ), 'selected applied outcome changed before reconciliation');
        await stable();
        if (current.state === 'applying') await session.reconcileApplyFromEvidence(released, canonicalSha256(outcome));
        current = await active(released);
        require(current.state === (released.noChanges ? 'planned' : 'applied'), 'selected release journal not settled');
        complete = {
          ...bound,
          status: 'complete',
          planPacketSha256,
          authorizationSha256,
          receiptSha256: canonicalSha256(released),
          outcomeSha256: canonicalSha256(outcome),
          releasedJournalSha256: current.journalSha256,
          releasedState: current.state,
        };
        await persist(completionName, complete);
      }
      await validateSubmission();
      const completed = packet(complete, [
        'status',
        'planPacketSha256',
        'authorizationSha256',
        'receiptSha256',
        'outcomeSha256',
        'releasedJournalSha256',
        'releasedState',
      ]);
      require(completed.status === 'complete' &&
        completed.planPacketSha256 === planPacketSha256 &&
        completed.authorizationSha256 === authorizationSha256 &&
        completed.receiptSha256 === canonicalSha256(released) &&
        completed.releasedState === (released.noChanges ? 'planned' : 'applied') &&
        typeof completed.releasedJournalSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(completed.releasedJournalSha256), 'release completion binding differs');
      const outcome = packet(await store.read(outcomeName), [
        'status',
        'planPacketSha256',
        'authorizationSha256',
        'receiptSha256',
        'originalExecutionSha256',
        'state',
        'cloud',
      ]);
      require(outcome.status === 'observed' &&
        outcome.planPacketSha256 === planPacketSha256 &&
        outcome.authorizationSha256 === authorizationSha256 &&
        outcome.receiptSha256 === canonicalSha256(released) &&
        outcome.originalExecutionSha256 === planned.originalExecutionSha256 &&
        same(outcome.state, { [address]: null }) &&
        same(outcome.cloud, authorized.baseline) &&
        canonicalSha256(outcome) === completed.outcomeSha256, 'original selected outcome differs');
      await stable();
      await sealAuthorization();
      const originalReleaseHistory = async () => {
        const value = await readHistory.call(session, released, deadline);
        require(value.schemaVersion === 1 &&
          value.scope === 'exact-saved-plan-journal-history' &&
          value.receiptSha256 === canonicalSha256(released) &&
          value.incompleteArchives === 0 &&
          value.applicationOutcomeQualified === false &&
          value.retirementQualified === false &&
          value.matches.some(
            (entry) =>
              entry.journalSha256 === completed.releasedJournalSha256 &&
              entry.state === completed.releasedState &&
              entry.manifestSha256 === manifestSha256 &&
              entry.savedPlanSha256 === released.planSha256,
          ), 'original completed release journal unavailable');
      };
      await originalReleaseHistory();
      const finalizing = {
        ...bound,
        status: 'finalizing',
        planPacketSha256,
        completionSha256: canonicalSha256(completed),
        originalReleaseJournalSha256: completed.releasedJournalSha256,
        originalReleaseState: completed.releasedState,
      };
      const current = await journal(),
        savedFinalizing = await optional(`${prefix}-finalizing.json`);
      if (savedFinalizing === undefined) {
        require(current.receipt &&
          same(current.receipt, released) &&
          current.journalSha256 === completed.releasedJournalSha256 &&
          current.state === completed.releasedState &&
          (await optional(`${prefix}-final.json`)) ===
            undefined, 'final refresh lacks original completed release authorization');
        await persist(`${prefix}-finalizing.json`, finalizing);
      } else require(same(savedFinalizing, finalizing), 'finalizing source differs');
      let final: PlanReceipt;
      if (current.receipt && same(current.receipt, released)) {
        require(current.journalSha256 === completed.releasedJournalSha256 &&
          current.state === completed.releasedState, 'original release changed before final refresh');
        if (released.noChanges && released.changes.length === 0) final = released;
        else {
          require((await optional(`${prefix}-final.json`)) ===
            undefined, 'published final differs from original current release');
          await stable();
          await sealAuthorization();
          final = await session.plan(env, deadline);
        }
      } else {
        require(current.state === 'planned' && current.receipt, 'current final receipt unavailable');
        final = current.receipt;
      }
      await step(() => validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, final, 'final'));
      const finalPrior = await session.readPlannedResourceFields(
          final,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        ),
        finalProposed = await session.readProposedResourceFields(
          final,
          azureTerraformNetworkPowerSelections,
          env,
          deadline,
        );
      await step(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          final,
          'final',
          finalPrior,
          finalProposed,
        ),
      );
      const finalJournal = await journal();
      require(finalJournal.state === 'planned' &&
        same(finalJournal.receipt, final) &&
        finalJournal.ordinaryRefreshEnabled === true &&
        typeof finalJournal.executionSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(finalJournal.executionSha256), 'ordinary current final execution unavailable');
      await originalCustody(final);
      await originalReleaseHistory();
      require(same(
        await session.readAppliedResourceFields(final, azureTerraformNetworkPowerSelections, env, deadline),
        { [address]: null },
      ), 'final applied selected control remains');
      await stable();
      await sealAuthorization();
      const finalPacket = {
        ...bound,
        status: 'final',
        planPacketSha256,
        completionSha256: canonicalSha256(completed),
        finalizingSha256: canonicalSha256(finalizing),
        receipt: final,
        journalSha256: finalJournal.journalSha256,
        executionSha256: finalJournal.executionSha256,
      };
      await persist(`${prefix}-final.json`, finalPacket);
      require(same(await journal(), finalJournal) &&
        same(await store.read(`${prefix}-plan.json`), planned) &&
        same(await store.read(completionName), completed) &&
        same(await store.read(outcomeName), outcome) &&
        same(
          await store.read(`${prefix}-finalizing.json`),
          finalizing,
        ), 'release evidence changed across final publication');
      await validateSubmission();
      seal();
      if (retire)
        return retirement({
          final,
          baseline: authorized.baseline,
          releaseReceiptSha256: canonicalSha256(released),
          finalJournalSha256: finalJournal.journalSha256 as string,
          finalExecutionSha256: finalJournal.executionSha256 as string,
        });
      return {
        schemaVersion: 1 as const,
        scope: 'selected-cancelled-network-power-state-release' as const,
        sourcePlanSha256: plan.planSha256,
        node,
        operation,
        stage: mutation.stage,
        cancellationPacketSha256,
        releaseReceiptSha256: canonicalSha256(released),
        finalReceiptSha256: canonicalSha256(final),
        selectedReleaseOutcomeQualified: true as const,
        finalOrdinarySelectedAbsenceQualified: true as const,
        wholeAppliedStateEmptyQualified: false as const,
        independentCleanupQualified: false as const,
        runnerRetirementQualified: false as const,
        parentRetirementQualified: false as const,
        retirementQualified: false as const,
      };
    },
    { beforeLock: (step) => step(() => rawStore.verify()) },
  );
}
