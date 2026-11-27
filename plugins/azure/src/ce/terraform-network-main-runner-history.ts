import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkAcceptanceVerifier } from './terraform-network-checkpoint';
import {
  type AzureTerraformNetworkEmptyMainAdmission,
  recheckAzureTerraformNetworkEmptyMainBinding,
} from './terraform-network-empty-main-binding';
import type { AzureTerraformNetworkHistoryLoaders } from './terraform-network-generation-history';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import { readAzureTerraformNetworkRetirementGraph } from './terraform-network-retirement-graph';
import { recheckAzureTerraformNetworkRetirementLineage } from './terraform-network-retirement-lineage';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual({ value: a }, { value: b });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network main runner history: ${message}`);
}
function keys(value: unknown, fields: string[]): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete journal object required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), fields.toSorted()), 'journal schema differs');
  return row;
}
type History = Awaited<ReturnType<NonNullable<TerraformSession['readPlanApplicationHistory']>>>;
type CustodyRow = {
  receiptSha256: string;
  configurationSha256: string;
  publishedCompletion: boolean;
  submission: 'missing' | 'partial' | 'unsubmitted' | 'unresolved' | 'applied' | 'no-change' | 'ambiguous';
  history?: History;
};
type Row = CustodyRow & {
  node: number;
  stage: 'nic' | 'routing';
  phase: 'mutation' | 'release' | 'final' | 'current';
};
type TerminalRow = CustodyRow & { publicationName: string; packetSha256: string };

/** Private read-only main-runner NIC/routing and terminal receipt custody. The graph authenticates original
 * source, serial prerequisites and packet projections; this observer joins actual archived bytes.
 * It does not establish cloud outcome, current health or runner/parent retirement. Call before
 * destructive main-runner cleanup and freeze this history through its separate retirement contract.
 */
export async function readAzureTerraformNetworkMainRunnerHistory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  terraform: CeTerraformService,
  loaders: AzureTerraformNetworkHistoryLoaders,
  siteRequest: { siteUid: string; siteConfigurationSha256: string },
  verifier: AzureTerraformNetworkAcceptanceVerifier,
  signal?: AbortSignal,
  replacementVerifier?: AzureTerraformNetworkReplacementCompletedVerifier,
  lineageWitness?: unknown,
  emptyMainAdmission?: AzureTerraformNetworkEmptyMainAdmission,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    directory = store.directory,
    readPacket = store.read;
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: terraform, key: 'open', value: terraform.open },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, plan) &&
      same(siteRequest, site) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      dependencies.every(
        ({ target, key, value }) => Reflect.get(target, key) === value,
      ), 'request or owning dependency changed');
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
  const lineageRead = () =>
    step(() =>
      recheckAzureTerraformNetworkRetirementLineage(
        lineageWitness,
        plan,
        store,
        loaders,
        site,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
  const recheckEmpty = async () => {
    if (!emptyMainAdmission) return;
    require(emptyMainAdmission.context.terraform === terraform &&
      same(emptyMainAdmission.context.site, site), 'terminal main owner context differs');
    await step(() =>
      recheckAzureTerraformNetworkEmptyMainBinding(
        emptyMainAdmission.witness,
        emptyMainAdmission.witness.originalPlanSha256,
        store,
        emptyMainAdmission.context,
        deadline,
      ),
    );
  };
  await recheckEmpty();
  const lineage = lineageWitness === undefined ? undefined : await lineageRead();
  const graphRead = () =>
    lineageWitness === undefined
      ? step(() =>
          readAzureTerraformNetworkRetirementGraph(plan, store, loaders, site, verifier, deadline, replacementVerifier),
        )
      : lineageRead().then((value) => value.graph);
  const graph = lineage?.graph ?? (await graphRead()),
    graphSha256 = canonicalSha256(graph);
  const deployment = await step(() => azureTerraformCurrentDeployment(plan));
  require(!deployment.stage &&
    deployment.deploymentId === owner.deploymentId &&
    deployment.scope.account === owner.account &&
    deployment.scope.region === owner.region &&
    deployment.scope.cloud === owner.provider, 'main runner deployment identity differs');
  const runnerDirectory = join(directory, deployment.deploymentId);
  const inventory = () =>
    step(async () => {
      try {
        const stat = await lstat(runnerDirectory);
        require(stat.isDirectory() &&
          !stat.isSymbolicLink() &&
          stat.uid === process.getuid?.() &&
          (stat.mode & 0o077) === 0 &&
          (await realpath(runnerDirectory)) === runnerDirectory, 'main runner private directory ownership differs');
        return (await readdir(runnerDirectory)).sort();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return null;
      }
    });
  const names = await inventory();
  require(!names?.includes('configuration-transition.json'), 'pending main runner revision requires owner recovery');
  const rows: Row[] = [],
    terminalRows: TerminalRow[] = [],
    receipts: PlanReceipt[] = [];
  const rechecks: Array<() => Promise<void>> = [];
  for (const node of graph.nodes) {
    for (const stage of ['nic', 'routing'] as const) {
      const history = node[stage];
      if (!history) continue;
      for (const phase of ['mutation', 'release', 'final', 'current'] as const) {
        const receipt = (history.receipts as Partial<Record<Row['phase'], PlanReceipt>>)[phase];
        if (!receipt) continue;
        const prefix = `${plan.planId}-terraform-network-node-${node.node}${stage === 'routing' ? '-routing' : ''}`;
        const publishedCompletion =
          phase === 'mutation' || phase === 'release'
            ? history.packetSha256ByName[`${prefix}-${phase}-complete.json`] !== undefined
            : false;
        rows.push({
          node: node.node,
          stage,
          phase,
          receiptSha256: canonicalSha256(receipt),
          configurationSha256: receipt.configurationSha256,
          publishedCompletion,
          submission: 'missing',
        });
        receipts.push(structuredClone(receipt));
      }
    }
  }
  // The graph authenticates terminal publication schema/provenance. Join each exact published
  // receipt to owning saved bytes as a separate row: terminal refresh is not a synthetic node,
  // and need not be the current plan once a separate teardown plan has been prepared.
  for (const [publicationName, packetSha256] of Object.entries(graph.checkpoint.completionSha256ByName)) {
    const packet = await step(() => readPacket.call(store, publicationName));
    require(canonicalSha256(packet) === packetSha256, 'terminal publication changed after graph authentication');
    require(packet && typeof packet === 'object' && !Array.isArray(packet), 'terminal publication object required');
    const receipt = (packet as { receipt?: PlanReceipt }).receipt;
    require(receipt &&
      receipt.noChanges === true &&
      Array.isArray(receipt.changes) &&
      receipt.changes.every(
        (change) => change.actions.length === 1 && change.actions[0] === 'no-op',
      ), 'terminal publication requires exact no-change receipt');
    terminalRows.push({
      publicationName,
      packetSha256,
      receiptSha256: canonicalSha256(receipt),
      configurationSha256: receipt.configurationSha256,
      publishedCompletion: true,
      submission: 'missing',
    });
    receipts.push(structuredClone(receipt));
    rechecks.push(async () => {
      require(canonicalSha256(await step(() => readPacket.call(store, publicationName))) ===
        packetSha256, 'terminal publication changed at saved-byte boundary');
    });
  }
  const custodyRows: CustodyRow[] = [...rows, ...terminalRows];
  const status = !names
    ? 'missing'
    : names.includes('artifact-retirement.json')
      ? 'retired-awaiting-original-history'
      : 'inspected';
  let current: Awaited<ReturnType<NonNullable<TerraformSession['readCurrentPlanJournal']>>> | undefined;
  if (status === 'inspected') {
    const session = await step(() => terraform.open(owner, deployment, 'current'));
    const readConfiguration = session.readConfigurationSha256,
      readCurrent = session.readCurrentPlanJournal,
      readHistory = session.readPlanApplicationHistory;
    require(readConfiguration && readCurrent && readHistory, 'authenticated main runner journal readers unavailable');
    const methods = () =>
      require(session.readConfigurationSha256 === readConfiguration &&
        session.readCurrentPlanJournal === readCurrent &&
        session.readPlanApplicationHistory === readHistory, 'main runner reader method changed');
    const configuration = await step(() => readConfiguration.call(session));
    methods();
    const configurations = new Set([
      graph.original.binding.sourceConfigurationSha256,
      ...receipts.map((receipt) => receipt.configurationSha256),
      ...(lineage?.lineage.configurationSha256s ?? []),
      ...(emptyMainAdmission ? [emptyMainAdmission.witness.configurationSha256] : []),
    ]);
    require(sha(configuration) &&
      configurations.has(configuration), 'current main runner configuration is outside original graph');
    const manifestOf = (configurationSha256: string) => {
      const { configuration: _source, providerLock, ...identity } = deployment;
      return canonicalSha256({ ...identity, configurationSha256, providerLockSha256: hash(providerLock) });
    };
    current = await step(() => readCurrent.call(session, configuration, deadline));
    methods();
    keys(current, [
      'schemaVersion',
      'scope',
      'state',
      'receipt',
      'manifestSha256',
      'journalSha256',
      'savedPlanSha256',
      'planSemanticsQualified',
      ...(current.executionSha256 !== undefined ? ['executionSha256', 'ordinaryRefreshEnabled'] : []),
    ]);
    require(current.executionSha256 === undefined ||
      (sha(current.executionSha256) &&
        typeof current.ordinaryRefreshEnabled === 'boolean'), 'current execution binding differs');
    const manifestSha256 = manifestOf(configuration);
    require(current.schemaVersion === 1 &&
      current.scope === 'current-saved-plan-byte-and-journal-binding' &&
      current.manifestSha256 === manifestSha256 &&
      current.planSemanticsQualified === false &&
      ['absent', 'planned', 'applying', 'applied'].includes(
        current.state,
      ), 'current main runner journal identity differs');
    require(current.receipt
      ? current.savedPlanSha256 === current.receipt.planSha256 &&
          sha(current.savedPlanSha256) &&
          current.receipt.schemaVersion === 1 &&
          current.receipt.engine === 'terraform' &&
          sha(current.journalSha256) &&
          current.receipt.configurationSha256 === configuration &&
          current.receipt.deploymentId === deployment.deploymentId &&
          current.receipt.backendIdentity === deployment.backendIdentity &&
          current.receipt.providerLockSha256 === hash(deployment.providerLock) &&
          current.state !== 'absent'
      : current.state === 'absent' &&
          current.savedPlanSha256 === null &&
          current.journalSha256 === null, 'current main runner saved receipt binding differs');
    for (const [index, receipt] of receipts.entries()) {
      const actual = await step(() => readHistory.call(session, receipt, deadline));
      methods();
      keys(actual, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'incompleteArchives',
        'matches',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require(actual.schemaVersion === 1 &&
        actual.scope === 'exact-saved-plan-journal-history' &&
        actual.receiptSha256 === canonicalSha256(receipt) &&
        actual.manifestSha256 === manifestSha256 &&
        Number.isSafeInteger(actual.incompleteArchives) &&
        actual.incompleteArchives >= 0 &&
        Array.isArray(actual.matches) &&
        actual.applicationOutcomeQualified === false &&
        actual.retirementQualified === false, 'original main runner history contract differs');
      const seen = new Set<string>();
      for (const match of actual.matches) {
        keys(match, [
          'location',
          'archiveSha256',
          'state',
          'journalSha256',
          'savedPlanSha256',
          'configurationSha256',
          'manifestSha256',
        ]);
        const key = `${match.location}:${match.archiveSha256}`;
        require(['current', 'revision', 'plan-history'].includes(match.location) &&
          ['planned', 'applying', 'applied'].includes(match.state) &&
          sha(match.archiveSha256) &&
          sha(match.journalSha256) &&
          match.savedPlanSha256 === receipt.planSha256 &&
          match.configurationSha256 === receipt.configurationSha256 &&
          match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
          !seen.has(key), 'original main runner journal occurrence differs or duplicates');
        seen.add(key);
      }
      const states = new Set(actual.matches.map((match) => match.state));
      custodyRows[index].submission =
        actual.incompleteArchives > 0
          ? 'partial'
          : states.has('applying') && states.has('applied')
            ? 'ambiguous'
            : states.has('applying')
              ? 'unresolved'
              : states.has('applied')
                ? 'applied'
                : states.has('planned')
                  ? receipt.noChanges
                    ? 'no-change'
                    : 'unsubmitted'
                  : 'missing';
      custodyRows[index].history = structuredClone(actual);
      rechecks.push(async () => {
        methods();
        require(same(
          await step(() => readHistory.call(session, receipt, deadline)),
          actual,
        ), 'original main runner journal changed');
        methods();
      });
    }
    const originalCurrent = structuredClone(current);
    rechecks.push(async () => {
      methods();
      require((await step(() => readConfiguration.call(session))) === configuration &&
        same(
          await step(() => readCurrent.call(session, configuration, deadline)),
          originalCurrent,
        ), 'current main runner journal changed');
      methods();
    });
  }
  require(canonicalSha256(await graphRead()) === graphSha256, 'original network graph changed');
  for (const recheck of rechecks) await recheck();
  require(same(await inventory(), names), 'main runner inventory changed');
  require(canonicalSha256(await graphRead()) === graphSha256, 'original network graph changed at final boundary');
  await recheckEmpty();
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'network-main-runner-original-journal-history' as const,
    planSha256: plan.planSha256,
    graphSha256,
    ...(lineage ? { lineageSha256: canonicalSha256(lineage.lineage) } : {}),
    status,
    rows,
    terminalRows,
    ...(current ? { current } : {}),
    originalPublishedJournalsQualified:
      status === 'inspected' &&
      rows.length > 0 &&
      rows.every((row) => row.submission === 'applied' || row.submission === 'no-change'),
    terminalPublishedJournalsQualified:
      status === 'inspected' &&
      terminalRows.length > 0 &&
      terminalRows.every((row) => row.submission === 'no-change' || row.submission === 'applied'),
    applicationOutcomeQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
    runnerRetirementQualified: false as const,
    parentRetirementQualified: false as const,
    retirementQualified: false as const,
  };
}
