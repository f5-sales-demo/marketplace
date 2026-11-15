import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open as openFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService } from '../../../terraform/src/service';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import {
  azureTerraformNetworkPowerDeployment,
  validateAzureTerraformNetworkPowerPlan,
} from './terraform-network-power';
import { readAzureTerraformNetworkCancelledPowerRetirement } from './terraform-network-power-cancelled-release';
import { readAzureTerraformNetworkCompletedPowerRetirement } from './terraform-network-power-completed-retirement';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import {
  readAzureTerraformNetworkRetirementGraph,
  recheckAzureTerraformNetworkRetirementGraph,
} from './terraform-network-retirement-graph';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power runner history: ${message}`);
}

/** Private inspection only. Join original serial authorization to actual local runner journals.
 * No Terraform command, cloud mutation, reconciliation, cancellation or retirement is admitted.
 * Source/preflight/cloud packet times remain historical collection times, not CE heartbeats.
 */
export async function readAzureTerraformNetworkPowerRunnerHistory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  terraform: CeTerraformService,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  graphWitness?: unknown,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory,
    open = terraform.open,
    read = store.read,
    verify = store.verify,
    loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome;
  const graphWitnessSha256 = graphWitness === undefined ? undefined : canonicalSha256(graphWitness);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require((graphWitness === undefined || canonicalSha256(graphWitness) === graphWitnessSha256) &&
      same(request, plan) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      terraform.open === open &&
      store.read === read &&
      store.verify === verify &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome, 'request or owning dependency changed');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const directories = new Map<string, string[] | null>(),
    markers = new Map<string, boolean>();
  const inventory = async (path: string) =>
    step(async () => {
      let names: string[] | null = null;
      try {
        const stat = await lstat(path);
        require(stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o077) === 0 &&
          (await realpath(path)) === path, 'stage directory ownership differs');
        names = (await readdir(path)).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      require(!directories.has(path) || same(directories.get(path), names), 'stage directory inventory changed');
      directories.set(path, names);
      return names;
    });
  const exists = async (path: string) =>
    step(async () => {
      let found = true;
      try {
        await lstat(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        found = false;
      }
      require(!markers.has(path) || markers.get(path) === found, 'stage marker presence changed');
      markers.set(path, found);
      return found;
    });
  // A completed inspector authenticates the retired runner once. Retain the exact authenticated
  // manifest and marker bytes through the outer graph boundary instead of replaying that entire
  // inspector for every child. No partial or cancelled proof uses this completed-only shortcut.
  const retainedFiles = new Map<string, string>();
  const retainedFile = async (path: string, expectedSha256?: string) =>
    step(async () => {
      const file = await openFile(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const before = await file.stat();
        require(before.isFile() &&
          before.uid === process.getuid?.() &&
          before.nlink === 1 &&
          (before.mode & 0o077) === 0, 'retained completed runner file ownership differs');
        const bytes = await file.readFile(),
          after = await file.stat(),
          named = await lstat(path);
        require(after.dev === before.dev &&
          after.ino === before.ino &&
          after.size === before.size &&
          after.mtimeMs === before.mtimeMs &&
          after.ctimeMs === before.ctimeMs &&
          named.isFile() &&
          !named.isSymbolicLink() &&
          named.dev === before.dev &&
          named.ino === before.ino &&
          named.uid === before.uid &&
          named.nlink === 1 &&
          (named.mode & 0o077) === 0, 'retained completed runner file changed during read');
        const digest = createHash('sha256').update(bytes).digest('hex');
        require((expectedSha256 === undefined || digest === expectedSha256) &&
          (!retainedFiles.has(path) ||
            retainedFiles.get(path) === digest), 'authenticated completed runner bytes changed');
        retainedFiles.set(path, digest);
        return bytes;
      } finally {
        await file.close();
      }
    });
  const graphRead = () =>
    step(() =>
      graphWitness === undefined
        ? readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier)
        : recheckAzureTerraformNetworkRetirementGraph(
            graphWitness,
            plan,
            store,
            loaders,
            site,
            verifier,
            deadline,
            replacementVerifier,
          ),
    );
  const graph = await graphRead(),
    graphSha256 = canonicalSha256(graph);
  const root = join(directory, 'terraform-stages'),
    names = await inventory(root),
    prefix = `network-${plan.planSha256.slice(0, 24)}-`;
  const selected = (names ?? []).filter((name) => name.startsWith(prefix));
  const deployments = graph.powerDeployments;
  require(new Set(deployments.map((deployment) => deployment.stage)).size === deployments.length &&
    selected.every((stage) =>
      deployments.some((deployment) => deployment.stage === stage),
    ), 'orphan or serially unauthorized selected power runner');
  const rows: Array<{
    stage: string;
    node: number;
    operation: 'deallocate' | 'start';
    deploymentSha256: string;
    status: 'missing' | 'retired-awaiting-receipt' | 'retired' | 'inspected';
    retirement?:
      | Awaited<ReturnType<typeof readAzureTerraformNetworkCancelledPowerRetirement>>
      | Awaited<ReturnType<typeof readAzureTerraformNetworkCompletedPowerRetirement>>;
    configurationPhase?: 'mutation' | 'release';
    current?: Awaited<
      ReturnType<NonNullable<Awaited<ReturnType<CeTerraformService['open']>>['readCurrentPlanJournal']>>
    >;
    phases?: Partial<
      Record<
        'mutation' | 'release',
        {
          receiptSha256: string;
          submission: 'applied' | 'no-change' | 'unsubmitted' | 'unresolved' | 'missing' | 'ambiguous';
          history: Awaited<
            ReturnType<NonNullable<Awaited<ReturnType<CeTerraformService['open']>>['readPlanApplicationHistory']>>
          >;
        }
      >
    >;
  }> = [];
  const rechecks: Array<() => Promise<void>> = [];
  for (const deployment of deployments) {
    require(deployment.stage, 'derived stage identity missing');
    const match = deployment.stage.match(/-node-(\d+)-(deallocate|start)$/);
    require(match, 'derived selected stage malformed');
    const node = Number(match[1]),
      operation = match[2] as 'deallocate' | 'start';
    const checkpoint = graph.checkpoint.snapshot?.checkpoint.nodes.find((row) => row.node === node),
      historyNode = graph.nodes.find((row) => row.node === node);
    require(checkpoint && historyNode, 'selected runner lacks exact original serial node');
    const history = operation === 'start' ? historyNode.start : historyNode.deallocate;
    const row = { stage: deployment.stage, node, operation, deploymentSha256: canonicalSha256(deployment) };
    if (!selected.includes(deployment.stage)) {
      require(!history.lastPacket, 'published selected power history lacks owning runner directory');
      rows.push({ ...row, status: 'missing' });
      continue;
    }
    const stageDirectory = join(root, deployment.stage),
      runnerDirectory = join(stageDirectory, deployment.deploymentId);
    const stageNames = await inventory(stageDirectory);
    require(stageNames && same(stageNames, [deployment.deploymentId]), 'stage directory has foreign or orphan runner');
    require(await inventory(runnerDirectory), 'owning runner directory missing');
    require(!(await exists(
      join(runnerDirectory, 'configuration-transition.json'),
    )), 'pending runner revision requires owner recovery');
    if (await exists(join(runnerDirectory, 'artifact-retirement.json'))) {
      const identity = canonicalSha256({
        planSha256: plan.planSha256,
        selectedNode: node,
        selectedOperation: operation,
      }).slice(0, 24);
      const readCancellation = async (): Promise<unknown | undefined> => {
        try {
          return await step(() => store.read(`azure-power-cancel-${identity}.json`));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      };
      const cancellation = await readCancellation();
      rechecks.push(async () =>
        require(same(
          { value: await readCancellation() },
          { value: cancellation },
        ), 'selected cancellation presence or custody changed'),
      );
      if (cancellation !== undefined) {
        const inspect = () =>
          step(() =>
            readAzureTerraformNetworkCancelledPowerRetirement(
              plan,
              node,
              operation,
              terraform,
              store,
              loaders,
              site,
              verifier,
              deadline,
              replacementVerifier,
            ),
          );
        const retirement = await inspect();
        rows.push({
          ...row,
          status: retirement.runnerRetirementQualified ? 'retired' : 'retired-awaiting-receipt',
          retirement,
        });
        rechecks.push(async () => require(same(await inspect(), retirement), 'retired selected runner proof changed'));
      } else {
        const completedIdentity = canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24);
        const packetNames = ['preparing', 'retiring', 'retired'].map(
          (phase) => `azure-power-completed-retirement-${completedIdentity}-${phase}.json`,
        );
        const readPackets = async () => {
          const packets: unknown[] = [];
          for (const name of packetNames) {
            try {
              packets.push(await step(() => store.read(name)));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
              packets.push(null);
            }
          }
          return packets;
        };
        const packets = await readPackets();
        rechecks.push(async () =>
          require(same(await readPackets(), packets), 'completed retirement publication custody changed'),
        );
        if (packets.some((packet) => packet !== null)) {
          const inspect = () =>
            step(() =>
              readAzureTerraformNetworkCompletedPowerRetirement(
                plan,
                node,
                operation,
                terraform,
                store,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
                // Reuse only the genuine read-only graph minted by this enclosing reader.
                // The completed child still performs its owning graph and native rechecks.
                graphWitness ?? graph,
              ),
            );
          const retirement = await inspect();
          rows.push({
            ...row,
            status: retirement.runnerRetirementQualified ? 'retired' : 'retired-awaiting-receipt',
            retirement,
          });
          if (retirement.runnerRetirementQualified) {
            const proof = retirement.proof as {
              observed?: { status?: string; markerSha256?: string; receipt?: { manifestSha256?: string } };
            };
            require(proof?.observed?.status === 'runner-artifacts-retired' &&
              typeof proof.observed.markerSha256 === 'string' &&
              /^[a-f0-9]{64}$/.test(proof.observed.markerSha256) &&
              typeof proof.observed.receipt?.manifestSha256 === 'string', 'completed retained proof missing');
            const release = await step(() =>
              azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation, true),
            );
            const { configuration, providerLock, ...identity } = release;
            const manifest = {
              ...identity,
              configurationSha256: hash(configuration),
              providerLockSha256: hash(providerLock),
            };
            require(canonicalSha256(manifest) ===
              proof.observed.receipt.manifestSha256, 'completed retained manifest differs from selected release');
            require(same(await inventory(runnerDirectory), [
              'artifact-retirement.json',
              'deployment.json',
            ]), 'completed retired runner retains unexpected artifacts');
            require(same(
              JSON.parse((await retainedFile(join(runnerDirectory, 'deployment.json'))).toString()),
              manifest,
            ), 'completed retained manifest bytes differ');
            await retainedFile(join(runnerDirectory, 'artifact-retirement.json'), proof.observed.markerSha256);
          } else {
            rechecks.push(async () =>
              require(same(await inspect(), retirement), 'completed selected retirement proof changed'),
            );
          }
        } else rows.push({ ...row, status: 'retired-awaiting-receipt' });
      }
      continue;
    }
    const session = await step(() => open.call(terraform, owner, deployment, 'current'));
    const currentConfiguration = session.readConfigurationSha256,
      currentJournal = session.readCurrentPlanJournal,
      applicationHistory = session.readPlanApplicationHistory;
    require(currentConfiguration && currentJournal && applicationHistory, 'owning journal inspection unavailable');
    const methods = () =>
      require(session.readConfigurationSha256 === currentConfiguration &&
        session.readCurrentPlanJournal === currentJournal &&
        session.readPlanApplicationHistory === applicationHistory, 'owning runner method changed');
    const release = await step(() =>
      azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation, true),
    );
    require(same(
      deployment,
      await step(() => azureTerraformNetworkPowerDeployment(plan, checkpoint.before, node, operation)),
    ), 'derived stage differs from serial inventory');
    const manifestOf = (value: typeof deployment) => {
      const { configuration, providerLock, ...identity } = value;
      return { ...identity, configurationSha256: hash(configuration), providerLockSha256: hash(providerLock) };
    };
    const configuration = await step(() => currentConfiguration.call(session));
    methods();
    require(configuration === hash(deployment.configuration) ||
      configuration === hash(release.configuration), 'current isolated power configuration differs');
    const configurationPhase =
      configuration === hash(deployment.configuration) ? ('mutation' as const) : ('release' as const);
    require(configurationPhase !== 'mutation' ||
      !history.receipts.release, 'actual runner is behind published release history');
    if (configurationPhase === 'release')
      require(history.receipts.mutation &&
        history.packetSha256ByName[
          `${plan.planId}-terraform-network-node-${node}-${operation}-mutation-complete.json`
        ], 'release configuration lacks original completed mutation history');
    const current = await step(() => currentJournal.call(session, configuration, deadline));
    methods();
    require(current.schemaVersion === 1 &&
      current.scope === 'current-saved-plan-byte-and-journal-binding' &&
      current.planSemanticsQualified === false &&
      current.manifestSha256 ===
        canonicalSha256(
          manifestOf(configurationPhase === 'mutation' ? deployment : release),
        ), 'current journal contract differs');
    if (current.receipt) {
      await step(() =>
        validateAzureTerraformNetworkPowerPlan(
          plan,
          checkpoint.before,
          node,
          operation,
          current.receipt,
          configurationPhase,
        ),
      );
      require(current.savedPlanSha256 === current.receipt.planSha256 &&
        current.journalSha256 &&
        ['planned', 'applying', 'applied'].includes(current.state), 'current journal receipt binding differs');
      const recorded =
        configurationPhase === 'mutation'
          ? [history.receipts.mutation]
          : [history.receipts.release, history.receipts.final, history.receipts.current];
      require(recorded.some((receipt) => receipt && same(receipt, current.receipt)) ||
        current.state === 'planned', 'unpublished submitted current journal');
    } else
      require(current.state === 'absent' &&
        current.savedPlanSha256 === null &&
        current.journalSha256 === null, 'unbound absent current journal');
    const phases: NonNullable<(typeof rows)[number]['phases']> = {};
    for (const phase of ['mutation', 'release'] as const) {
      const receipt = history.receipts[phase];
      if (!receipt) continue;
      const actual = await step(() => applicationHistory.call(session, receipt, deadline));
      methods();
      require(actual.schemaVersion === 1 &&
        actual.scope === 'exact-saved-plan-journal-history' &&
        actual.receiptSha256 === canonicalSha256(receipt) &&
        actual.applicationOutcomeQualified === false &&
        actual.retirementQualified === false &&
        actual.manifestSha256 === current.manifestSha256 &&
        Number.isSafeInteger(actual.incompleteArchives) &&
        actual.incompleteArchives >= 0 &&
        Array.isArray(actual.matches), 'original phase journal history contract differs');
      require(actual.matches.every(
        (entry) =>
          ['current', 'revision', 'plan-history'].includes(entry.location) &&
          ['planned', 'applying', 'applied'].includes(entry.state) &&
          /^[a-f0-9]{64}$/.test(entry.archiveSha256) &&
          /^[a-f0-9]{64}$/.test(entry.journalSha256) &&
          entry.savedPlanSha256 === receipt.planSha256 &&
          entry.configurationSha256 === receipt.configurationSha256 &&
          entry.manifestSha256 === canonicalSha256(manifestOf(phase === 'mutation' ? deployment : release)),
      ), 'original phase journal record identity differs');
      const states = new Set(actual.matches.map((entry) => entry.state));
      const submission =
        states.has('applied') && states.has('applying')
          ? 'ambiguous'
          : states.has('applied')
            ? 'applied'
            : states.has('applying')
              ? 'unresolved'
              : states.has('planned')
                ? receipt.noChanges
                  ? 'no-change'
                  : 'unsubmitted'
                : 'missing';
      phases[phase] = { receiptSha256: canonicalSha256(receipt), submission, history: actual };
      rechecks.push(async () => {
        methods();
        require(same(
          await step(() => applicationHistory.call(session, receipt, deadline)),
          actual,
        ), 'original selected runner phase journal changed');
        methods();
      });
    }
    rows.push({ ...row, status: 'inspected', configurationPhase, current, phases });
    rechecks.push(async () => {
      methods();
      require((await step(() => currentConfiguration.call(session))) === configuration &&
        same(
          await step(() => currentJournal.call(session, configuration, deadline)),
          current,
        ), 'current selected runner journal changed');
      methods();
    });
  }
  require(canonicalSha256(await graphRead()) === graphSha256, 'original serial graph changed across runner inspection');
  for (const check of rechecks) await check();
  for (const path of directories.keys()) await inventory(path);
  for (const path of markers.keys()) await exists(path);
  for (const path of retainedFiles.keys()) await retainedFile(path);
  require(canonicalSha256(await graphRead()) ===
    graphSha256, 'original serial graph changed at completed custody boundary');
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'network-power-graph-and-runner-journal-history' as const,
    planSha256: plan.planSha256,
    graphSha256,
    rows,
    currentOperationalAcceptanceQualified: false as const,
    applicationOutcomeQualified: false as const,
    runnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    retirementQualified: false as const,
  };
}
