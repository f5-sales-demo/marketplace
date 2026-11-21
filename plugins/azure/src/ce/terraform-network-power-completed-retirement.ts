import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import {
  type AzureTerraformNetworkDriverLease,
  assertAzureTerraformNetworkDriverLease,
  verifyAzureTerraformNetworkDriverLease,
} from './terraform-network-driver-lease';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import {
  azureTerraformNetworkPowerDeployment,
  observeAzureTerraformNetworkPower,
  validateAzureTerraformNetworkPowerPlan,
} from './terraform-network-power';
import { type AzureTerraformPowerStep, withAzureTerraformPowerLifecycle } from './terraform-network-power-lifecycle';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import {
  readAzureTerraformNetworkRetirementGraph,
  readAzureTerraformNetworkRetirementGraphPrefix,
  recheckAzureTerraformNetworkRetirementGraph,
} from './terraform-network-retirement-graph';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform completed power retirement: ${message}`);
}
function object(input: unknown): Record<string, unknown> {
  require(input && typeof input === 'object' && !Array.isArray(input), 'malformed retirement packet');
  return input as Record<string, unknown>;
}
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
type Arguments = [
  request: AzureCePlan,
  node: number,
  operation: 'start' | 'deallocate',
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  readOnlyGraphWitness?: unknown,
];

/** Local retirement of a completed original submitted stage. Never executes or releases a VM action.
 * The serial driver, current CE/cloud acceptance and parent/external cleanup remain separate gates.
 */
export async function retireAzureTerraformNetworkCompletedPowerStage(
  request: AzureCePlan,
  node: number,
  operation: 'start' | 'deallocate',
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  api: AzExecApi,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  const result = await run(
    [request, node, operation, terraform, store, loaders, site, verifier, signal, replacementVerifier],
    api,
    environment,
  );
  require(result.scope === 'selected-completed-network-power-runner-retirement', 'unexpected inspection result');
  return result;
}
/** Private serial entry point: only an actual active driver acquisition can authorize lock reuse. */
export async function retireAzureTerraformNetworkCompletedPowerStageInDriver(
  lease: AzureTerraformNetworkDriverLease,
  request: AzureCePlan,
  node: number,
  operation: 'start' | 'deallocate',
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  loaders: AzureTerraformNetworkHistoryLoaders,
  site: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  api: AzExecApi,
  environment: Record<string, string | undefined>,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
) {
  assertAzureTerraformNetworkDriverLease(lease, store.directory);
  const result = await run(
    [request, node, operation, terraform, store, loaders, site, verifier, signal, replacementVerifier],
    api,
    environment,
    lease,
  );
  require(result.scope === 'selected-completed-network-power-runner-retirement', 'unexpected serial inspection result');
  return result;
}
export async function readAzureTerraformNetworkCompletedPowerRetirement(...args: Arguments) {
  const result = await run(args);
  require(result.scope === 'selected-completed-network-power-retirement-history', 'unexpected mutation result');
  return result;
}
async function run(
  args: Arguments,
  rawApi?: AzExecApi,
  environment: Record<string, string | undefined> = {},
  driverLease?: AzureTerraformNetworkDriverLease,
) {
  const [
    request,
    node,
    operation,
    rawTerraform,
    rawStore,
    loaders,
    siteRequest,
    verifier,
    signal,
    replacementVerifier,
    readOnlyGraphWitness,
  ] = args;
  const readOnly = rawApi === undefined,
    plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(rawStore.owner),
    directory = rawStore.directory,
    env = { ...environment };
  require(readOnly || readOnlyGraphWitness === undefined, 'borrowed graph cannot authorize mutation');
  const graphWitnessSha256 = readOnlyGraphWitness === undefined ? undefined : canonicalSha256(readOnlyGraphWitness);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings: Array<{ target: object; key: string; value: unknown }> = [];
  const bind = (target: object, keys: string[]) => {
    for (const key of keys) bindings.push({ target, key, value: Reflect.get(target, key) });
  };
  bind(rawTerraform, ['open']);
  bind(rawStore, ['read', 'write', 'verify']);
  bind(loaders, ['loadSource', 'loadOutcome']);
  if (rawApi) bind(rawApi, ['exec']);
  // These private request snapshots are never passed to external callbacks.
  const requestSnapshotSha256 = canonicalSha256({ value: plan }),
    siteSnapshotSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    if (driverLease) assertAzureTerraformNetworkDriverLease(driverLease, directory);
    require((readOnlyGraphWitness === undefined || canonicalSha256(readOnlyGraphWitness) === graphWitnessSha256) &&
      canonicalSha256({ value: request }) === requestSnapshotSha256 &&
      canonicalSha256({ value: siteRequest }) === siteSnapshotSha256 &&
      same(rawStore.owner, owner) &&
      same(environment, env) &&
      rawStore.directory === directory &&
      bindings.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependency changed');
  };
  seal();
  require(Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    ['start', 'deallocate'].includes(operation), 'selected boundary differs');
  const execute = readOnly
    ? async <T>(
        _directory: string,
        _signal: AbortSignal,
        _seal: () => void,
        action: (step: <V>(work: () => Promise<V>, mutation?: boolean) => Promise<V>) => Promise<T>,
        _options?: Parameters<typeof withAzureTerraformPowerLifecycle>[4],
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
  const options = driverLease
    ? {
        lockDriver: false,
        beforeLock: (step: AzureTerraformPowerStep) =>
          step(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory)),
      }
    : {};
  return execute(
    directory,
    deadline,
    seal,
    async (rawStep) => {
      const step: AzureTerraformPowerStep = driverLease
        ? async (work, mutation) => {
            await rawStep(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory));
            seal();
            // Track the native mutation promise itself. Later lease/abort seals cannot relabel
            // native fulfillment or release its power lock before actual settlement.
            const value = await rawStep(work, mutation);
            await rawStep(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory));
            seal();
            return value;
          }
        : rawStep;
      const guard = <T extends object>(target: T, keys: string[], mutations: string[] = []): T => {
        bind(target, keys);
        const methods = new Map<PropertyKey, unknown>();
        for (const key of keys) {
          const method = Reflect.get(target, key);
          if (typeof method === 'function')
            methods.set(key, (...input: unknown[]) =>
              step(async () => await Reflect.apply(method, target, input), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (target, key) => (methods.has(key) ? methods.get(key) : Reflect.get(target, key)),
        });
      };
      const store = guard(rawStore, ['read', 'write', 'verify'], ['write']),
        terraform = guard(rawTerraform, ['open'], readOnly ? [] : ['open']),
        api = rawApi ? guard(rawApi, ['exec']) : undefined;
      const optional = async (name: string): Promise<unknown | undefined> => {
        try {
          return await store.read(name);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      // A genuine borrowed graph was minted against rawStore. Its original native callback,
      // source/absence/dependency seals and deadline remain authoritative. The enclosing step
      // also seals this completed inspector before and after the read; other packet/runner reads
      // retain this inspector's guarded store. No proxy identity alias is registered.
      const graphStore = readOnlyGraphWitness === undefined ? store : rawStore;
      let currentGraphWitness: unknown = readOnlyGraphWitness;
      const graphRead = () =>
        step(() =>
          currentGraphWitness === undefined
            ? readAzureTerraformNetworkRetirementGraph(
                plan,
                graphStore,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
              )
            : recheckAzureTerraformNetworkRetirementGraph(
                currentGraphWitness,
                plan,
                graphStore,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
              ),
        );
      const graph = await graphRead(),
        currentGraphSha256 = canonicalSha256(graph),
        checkpoint = graph.checkpoint.snapshot?.checkpoint.nodes.find((row) => row.node === node),
        historyNode = graph.nodes.find((row) => row.node === node);
      if (readOnly && readOnlyGraphWitness === undefined) currentGraphWitness = graph;
      require(checkpoint && historyNode?.preflightPresent, 'original selected serial preflight missing');
      const before = checkpoint.before,
        history = operation === 'start' ? historyNode.start : historyNode.deallocate;
      require(history.allPacketsPresent &&
        history.receipts.mutation &&
        history.receipts.release &&
        history.receipts.final &&
        history.receipts.current &&
        same(history.receipts.final, history.receipts.current), 'complete original submitted power history required');
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation)),
        release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      require(mutation.stage &&
        graph.powerDeployments.some((value) => same(value, mutation)), 'original selected stage differs');
      const final = await step(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, history.receipts.final, 'final'),
      );
      const manifest = (deployment: typeof release) => {
        const { configuration, providerLock, ...identity } = deployment;
        return canonicalSha256({
          ...identity,
          configurationSha256: hash(configuration),
          providerLockSha256: hash(providerLock),
        });
      };
      const manifestSha256 = manifest(release),
        identity = canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24),
        finalizingName = `azure-power-finalize-${identity}.json`,
        retirementPrefix = `azure-power-completed-retirement-${identity}`,
        cancellationName = `azure-power-cancel-${canonicalSha256({ planSha256: plan.planSha256, selectedNode: node, selectedOperation: operation }).slice(0, 24)}.json`;
      const preparingName = `${retirementPrefix}-preparing.json`,
        retiringName = `${retirementPrefix}-retiring.json`,
        retiredName = `${retirementPrefix}-retired.json`;
      let preparing = await optional(preparingName);
      // Bind cleanup to its authenticated original graph, while independently sealing the complete
      // current graph. Genuine later serial publications cannot rewrite original cleanup provenance.
      const originalGraph =
          preparing === undefined
            ? graph
            : await step(() =>
                readAzureTerraformNetworkRetirementGraphPrefix(
                  object(preparing).originalGraph,
                  plan,
                  graphStore,
                  loaders,
                  site,
                  verifier,
                  deadline,
                  replacementVerifier,
                  currentGraphWitness,
                ),
              ),
        graphSha256 = canonicalSha256(originalGraph);
      require((await optional(cancellationName)) ===
        undefined, 'cancelled stage requires its separate retirement contract');
      const finalized = object(await store.read(finalizingName));
      const finalizingBound = {
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownerSha256: canonicalSha256(owner),
        beforeSha256: canonicalSha256(before),
        node,
        operation,
        deploymentSha256: canonicalSha256(release),
        mutationReceiptSha256: canonicalSha256(history.receipts.mutation),
        releaseReceiptSha256: canonicalSha256(history.receipts.release),
      };
      require(same(
        Object.keys(finalized).sort(),
        [...Object.keys(finalizingBound), 'status', 'originalJournalSha256', 'originalState'].sort(),
      ) &&
        Object.entries(finalizingBound).every(([key, value]) => same(finalized[key], value)) &&
        finalized.status === 'finalizing' &&
        sha(finalized.originalJournalSha256) &&
        finalized.originalState ===
          (history.receipts.release.noChanges ? 'planned' : 'applied'), 'original finalizing authorization differs');
      const packetSha256ByName = { ...history.packetSha256ByName, [finalizingName]: canonicalSha256(finalized) };
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
            (await realpath(path)) === path, 'stage directory ownership differs');
          return (await readdir(path)).sort();
        });
      const names = await inventory(root),
        stageNames = await inventory(stageDirectory),
        runnerNames = await inventory(runnerDirectory);
      require(names
        .filter((name) => name.startsWith(`network-${plan.planSha256.slice(0, 24)}-`))
        .every((stage) => graph.powerDeployments.some((value) => value.stage === stage)) &&
        same(stageNames, [mutation.deploymentId]) &&
        !runnerNames.includes('configuration-transition.json'), 'foreign/orphan stage or pending revision');
      const barrierPresent = runnerNames.includes('artifact-retirement.json');
      const session = guard(
        await terraform.open(owner, mutation, 'current'),
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readArtifactRetirement',
          'retireArtifacts',
        ],
        ['retireArtifacts'],
      );
      require(session.readArtifactRetirement, 'authenticated retirement reader unavailable');
      const bound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        mutationDeploymentSha256: canonicalSha256(mutation),
        releaseDeploymentSha256: canonicalSha256(release),
        manifestSha256,
        finalReceiptSha256: canonicalSha256(final),
        finalizingSha256: canonicalSha256(finalized),
      };
      const packet = (input: unknown, fields: string[]) => {
        const value = object(input);
        require(same(Object.keys(value).sort(), [...Object.keys(bound), ...fields].sort()) &&
          Object.entries(bound).every(([key, expected]) =>
            same(value[key], expected),
          ), 'retirement packet source or schema differs');
        return value;
      };
      const persist = async (name: string, value: unknown) => {
        const prior = await optional(name);
        require(prior === undefined || same(prior, value), 'immutable retirement publication differs');
        if (prior === undefined) await store.write(name, value);
        require(same(await store.read(name), value), 'retirement publication changed');
      };
      const unchanged = async () => {
        require(canonicalSha256(await graphRead()) === currentGraphSha256 &&
          same(await inventory(root), names) &&
          same(await inventory(stageDirectory), stageNames) &&
          (await optional(cancellationName)) === undefined, 'source graph, selected inventory or cancellation changed');
        for (const [name, digest] of Object.entries(packetSha256ByName))
          require(canonicalSha256(await store.read(name)) === digest, 'original submitted packet changed');
      };
      const appliedNics = Array.from({ length: operation === 'start' ? node : node - 1 }, (_, index) =>
        plan.nics.map((nic) => `${index + 1}:${nic.index}`),
      ).flat();
      const observe = async () => {
        require(api && !readOnly, 'inspection cannot request current cloud acceptance');
        const observed = await step(() =>
          observeAzureTerraformNetworkPower(plan, before, node, operation, appliedNics, api, deadline),
        );
        require(['running', 'deallocated', 'stopped'].includes(
          observed.powerState,
        ), 'stable selected cloud identity required');
        const { observedAt: _observedAt, inventory, ...power } = observed,
          { collectedAt: _collectedAt, ...network } = inventory;
        return { ...power, inventory: network };
      };
      const validateOriginal = (input: unknown) => {
        const value = object(input);
        require(same(Object.keys(value).sort(), ['current', 'phases']), 'frozen original schema differs');
        const current = object(value.current);
        require(same(
          Object.keys(current).sort(),
          [
            'schemaVersion',
            'scope',
            'state',
            'receipt',
            'manifestSha256',
            'journalSha256',
            'savedPlanSha256',
            'planSemanticsQualified',
            'executionSha256',
            'ordinaryRefreshEnabled',
          ].sort(),
        ) &&
          current.schemaVersion === 1 &&
          current.scope === 'current-saved-plan-byte-and-journal-binding' &&
          current.state === 'planned' &&
          same(current.receipt, final) &&
          current.manifestSha256 === manifestSha256 &&
          current.savedPlanSha256 === final.planSha256 &&
          sha(current.journalSha256) &&
          sha(current.executionSha256) &&
          current.planSemanticsQualified === false &&
          current.ordinaryRefreshEnabled === true, 'frozen ordinary final journal differs');
        require(Array.isArray(value.phases) && value.phases.length === 2, 'frozen original phases differ');
        for (const [index, phase] of (['mutation', 'release'] as const).entries()) {
          const row = object(value.phases[index]),
            actual = object(row.history),
            receipt = history.receipts[phase];
          require(receipt &&
            same(Object.keys(row).sort(), ['history', 'phase']) &&
            row.phase === phase &&
            same(
              Object.keys(actual).sort(),
              [
                'schemaVersion',
                'scope',
                'receiptSha256',
                'manifestSha256',
                'incompleteArchives',
                'applicationOutcomeQualified',
                'retirementQualified',
                'matches',
              ].sort(),
            ) &&
            actual.schemaVersion === 1 &&
            actual.scope === 'exact-saved-plan-journal-history' &&
            actual.receiptSha256 === canonicalSha256(receipt) &&
            actual.manifestSha256 === manifestSha256 &&
            actual.incompleteArchives === 0 &&
            actual.applicationOutcomeQualified === false &&
            actual.retirementQualified === false &&
            Array.isArray(actual.matches) &&
            actual.matches.length > 0, 'frozen original phase contract differs');
          require(new Set(actual.matches.map((entry) => canonicalSha256(entry))).size === actual.matches.length &&
            actual.matches.every((input) => {
              const entry = object(input);
              return (
                same(
                  Object.keys(entry).sort(),
                  [
                    'location',
                    'archiveSha256',
                    'state',
                    'journalSha256',
                    'savedPlanSha256',
                    'configurationSha256',
                    'manifestSha256',
                  ].sort(),
                ) &&
                typeof entry.location === 'string' &&
                ['current', 'revision', 'plan-history'].includes(entry.location) &&
                entry.state === (receipt.noChanges ? 'planned' : 'applied') &&
                entry.savedPlanSha256 === receipt.planSha256 &&
                entry.configurationSha256 === receipt.configurationSha256 &&
                entry.manifestSha256 === manifest(phase === 'mutation' ? mutation : release) &&
                sha(entry.archiveSha256) &&
                sha(entry.journalSha256)
              );
            }) &&
            (phase !== 'release' ||
              actual.matches.some(
                (input) => object(input).journalSha256 === finalized.originalJournalSha256,
              )), 'frozen original submitted journal custody differs');
        }
      };
      const readOriginal = async () => {
        require(session.readConfigurationSha256 &&
          session.readCurrentPlanJournal &&
          session.readPlanApplicationHistory, 'original journal inspection unavailable');
        require((await session.readConfigurationSha256()) ===
          hash(release.configuration), 'original release configuration differs');
        const current = await session.readCurrentPlanJournal(hash(release.configuration), deadline);
        require(current.schemaVersion === 1 &&
          current.scope === 'current-saved-plan-byte-and-journal-binding' &&
          current.planSemanticsQualified === false &&
          current.state === 'planned' &&
          current.manifestSha256 === manifestSha256 &&
          same(current.receipt, final) &&
          current.savedPlanSha256 === final.planSha256 &&
          sha(current.journalSha256) &&
          sha(current.executionSha256) &&
          current.ordinaryRefreshEnabled === true, 'exact original ordinary final journal required');
        const phases = [];
        for (const phase of ['mutation', 'release'] as const) {
          const receipt = history.receipts[phase];
          require(receipt, 'original phase receipt missing');
          const actual = await session.readPlanApplicationHistory(receipt, deadline);
          const expectedState = receipt.noChanges ? 'planned' : 'applied';
          require(actual.schemaVersion === 1 &&
            actual.scope === 'exact-saved-plan-journal-history' &&
            actual.receiptSha256 === canonicalSha256(receipt) &&
            actual.manifestSha256 === manifestSha256 &&
            actual.incompleteArchives === 0 &&
            actual.applicationOutcomeQualified === false &&
            actual.retirementQualified === false &&
            actual.matches.length > 0 &&
            actual.matches.every(
              (entry) =>
                entry.state === expectedState &&
                entry.savedPlanSha256 === receipt.planSha256 &&
                entry.configurationSha256 === receipt.configurationSha256 &&
                entry.manifestSha256 === manifest(phase === 'mutation' ? mutation : release) &&
                sha(entry.archiveSha256) &&
                sha(entry.journalSha256),
            ) &&
            (phase !== 'release' ||
              actual.matches.some(
                (entry) => entry.journalSha256 === finalized.originalJournalSha256,
              )), 'original submitted phase journal or finalizing custody differs');
          phases.push({ phase, history: actual });
        }
        const original = { current, phases };
        validateOriginal(original);
        return original;
      };
      const inspection = (
        status: 'absent' | 'preparing' | 'retiring' | 'retired-unpublished' | 'retired',
        proof?: unknown,
      ) => ({
        schemaVersion: 1 as const,
        scope: 'selected-completed-network-power-retirement-history' as const,
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
      if (preparing === undefined) {
        require(!barrierPresent &&
          (await optional(retiringName)) === undefined &&
          (await optional(retiredName)) === undefined, 'missing original preparing authorization');
        if (readOnly) {
          await unchanged();
          require(same(await inventory(runnerDirectory), runnerNames) &&
            (await optional(preparingName)) === undefined &&
            (await optional(retiringName)) === undefined &&
            (await optional(retiredName)) === undefined, 'absent retirement changed across inspection');
          return inspection('absent');
        }
        const original = await readOriginal(),
          baseline = await observe();
        await unchanged();
        require(same(await readOriginal(), original) &&
          same(await observe(), baseline), 'original selected evidence changed before preparation');
        preparing = { ...bound, status: 'preparing', packetSha256ByName, originalGraph, original, baseline };
        await persist(preparingName, preparing);
      }
      const prepared = packet(preparing, ['status', 'packetSha256ByName', 'originalGraph', 'original', 'baseline']);
      require(prepared.status === 'preparing' &&
        same(prepared.originalGraph, originalGraph) &&
        same(prepared.packetSha256ByName, packetSha256ByName), 'original packet custody differs');
      validateOriginal(prepared.original);
      const preparingSha256 = canonicalSha256(prepared),
        retiring = { ...bound, status: 'retiring', preparingSha256 };
      const stable = async () => {
        await unchanged();
        require(same(await store.read(preparingName), prepared), 'preparation changed');
        if (!readOnly) require(same(await observe(), prepared.baseline), 'selected current cloud identity changed');
        else require(same(await inventory(runnerDirectory), runnerNames), 'retained runner inventory changed');
      };
      await stable();
      let observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
      require(['absent', 'retiring', 'runner-artifacts-retired'].includes(
        observed.status,
      ), 'retirement reader status differs');
      const savedRetiring = await optional(retiringName),
        savedRetired = await optional(retiredName);
      if (savedRetiring !== undefined) require(same(savedRetiring, retiring), 'retiring authorization differs');
      require(observed.status === 'absent' ||
        savedRetiring !== undefined, 'barrier lacks original retiring authorization');
      require(observed.status === 'runner-artifacts-retired' ||
        savedRetired === undefined, 'incomplete cleanup has retired publication');
      if (!readOnly && observed.status !== 'runner-artifacts-retired') {
        require(session.retireArtifacts, 'owning retirement mutation unavailable');
        if (observed.status === 'absent')
          require(!barrierPresent &&
            same(await readOriginal(), prepared.original), 'original journals changed before first barrier');
        await persist(retiringName, retiring);
        await stable();
        await session.retireArtifacts(final, preparingSha256, env, deadline);
        observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        require(observed.status === 'runner-artifacts-retired', 'selected runner retirement remains incomplete');
      }
      let retired: unknown;
      if (observed.status === 'runner-artifacts-retired') {
        require(observed.receipt.manifestSha256 === manifestSha256 &&
          observed.receipt.evidenceSha256 === preparingSha256 &&
          observed.receipt.finalPlanSha256 === final.planSha256 &&
          sha(observed.markerSha256), 'original retained retirement receipt differs');
        retired = {
          ...bound,
          status: 'retired',
          preparingSha256,
          retiringSha256: canonicalSha256(retiring),
          markerSha256: observed.markerSha256,
          receipt: observed.receipt,
        };
        require(savedRetired === undefined || same(savedRetired, retired), 'retired publication differs');
      }
      await stable();
      if (readOnly) {
        require(same(await optional(retiringName), savedRetiring) &&
          same(await optional(retiredName), savedRetired) &&
          same(
            await session.readArtifactRetirement(final, preparingSha256, deadline),
            observed,
          ), 'retained cleanup changed across inspection');
        await stable();
        require(same(await optional(retiringName), savedRetiring) &&
          same(await optional(retiredName), savedRetired), 'publication changed at final boundary');
        return inspection(
          observed.status === 'absent'
            ? 'preparing'
            : observed.status === 'retiring'
              ? 'retiring'
              : savedRetired === undefined
                ? 'retired-unpublished'
                : 'retired',
          { preparingSha256, finalReceiptSha256: canonicalSha256(final), observed },
        );
      }
      require(retired &&
        observed.status === 'runner-artifacts-retired' &&
        same(await optional(retiringName), retiring), 'complete selected cleanup required');
      await persist(retiredName, retired);
      require(same(
        await session.readArtifactRetirement(final, preparingSha256, deadline),
        observed,
      ), 'retained cleanup changed before final publication boundary');
      await stable();
      require(same(await optional(retiredName), retired) &&
        same(
          await optional(retiringName),
          retiring,
        ), 'retired publication or retiring authorization changed at final boundary');
      return {
        schemaVersion: 1 as const,
        scope: 'selected-completed-network-power-runner-retirement' as const,
        sourcePlanSha256: plan.planSha256,
        node,
        operation,
        stage: mutation.stage,
        graphSha256,
        preparingSha256,
        finalReceiptSha256: canonicalSha256(final),
        markerSha256: observed.markerSha256,
        artifactRetirementReceiptSha256: canonicalSha256(observed.receipt),
        wholeAppliedStateEmptyQualified: true as const,
        independentCleanupQualified: true as const,
        runnerRetirementQualified: true as const,
        currentOperationalAcceptanceQualified: false as const,
        parentRetirementQualified: false as const,
        retirementQualified: false as const,
      };
    },
    options,
  );
}
