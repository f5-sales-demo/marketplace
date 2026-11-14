import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkCompletedGeneration } from './terraform-network-generation-history';
import type {
  AzureTerraformNetworkReplacementExecutionDependencies,
  AzureTerraformNetworkReplacementOperationalIdentity,
} from './terraform-network-replacement-execution';
import { readAzureTerraformNetworkReplacementExecutionBinding } from './terraform-network-replacement-execution-journal';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import {
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
  validateAzureTerraformReplacementStageHistory,
  validateAzureTerraformReplacementStageReceipt,
} from './terraform-replacement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Verification = { status: 'verified'; scope: 'node-interfaces-routing-traffic'; evidenceSha256: string };
export type AzureTerraformNetworkReplacementCompletedVerifier = (
  receipt: unknown,
  identity: AzureTerraformNetworkReplacementOperationalIdentity,
  mode: 'current' | 'historical',
  signal?: AbortSignal,
) => Promise<Verification>;
export type AzureTerraformNetworkReplacementCompletionDependencies = Pick<
  AzureTerraformNetworkReplacementExecutionDependencies,
  'loaders' | 'site' | 'journalSha256' | 'sourceBindingSha256' | 'qualifyHistorical' | 'qualifyCompletedOperational'
> & { qualifiedPrevious?: AzureTerraformNetworkCompletedGeneration };
export interface AzureTerraformNetworkReplacementCompletion {
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-completion';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  planSha256: string;
  originalPlanSha256: string;
  retainedPlanSha256: string;
  journalSha256: string;
  sourceBindingSha256: string;
  checkpointSha256: string;
  sourceConfigurationSha256: string;
  providerLockSha256: string;
  finalConfigurationSha256: string;
  selectedNode: number;
  newVmId: string;
  stageRecordSha256: Record<'quiesce' | 'launch', string>;
  stageApplications: Record<'quiesce' | 'launch', 'applied' | 'no-change'>;
  finalReceipt: PlanReceipt;
  operational: {
    identity: AzureTerraformNetworkReplacementOperationalIdentity;
    receipt: unknown;
    receiptSha256: string;
    verification: Verification;
  };
}
export class AzureTerraformNetworkReplacementCompletionUnavailable extends Error {}
export const azureTerraformNetworkReplacementCompletionName = (plan: AzureCePlan) =>
  `${plan.planId}-terraform-network-replacement-complete.json`;
const same = (a: unknown, b: unknown) =>
  a === undefined || b === undefined ? a === b : canonicalSha256(a) === canonicalSha256(b);
const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function require(v: unknown, message: string): asserts v {
  if (!v) throw Error(`Azure Terraform network replacement completion: ${message}`);
}
function object(v: unknown): Record<string, unknown> {
  require(v && typeof v === 'object' && !Array.isArray(v), 'complete private object required');
  return v as Record<string, unknown>;
}
function keys(v: unknown, fields: string[]) {
  require(same(Object.keys(object(v)).sort(), fields.toSorted()), 'private completion schema differs');
}
function verification(v: unknown): Verification {
  keys(v, ['status', 'scope', 'evidenceSha256']);
  const row = v as Verification;
  require(row.status === 'verified' &&
    row.scope === 'node-interfaces-routing-traffic' &&
    sha(row.evidenceSha256), 'complete operational provenance required');
  return row;
}

/** Internal read-only artifact context. One deadline binds source/journal, private stage packets,
 * predecessor loaders and acceptance callbacks. Never opens Terraform or observes a cloud here. */
export async function openAzureTerraformNetworkReplacementCompletionArtifacts(
  request: AzureCePlan,
  store: CeDeploymentStore,
  dependencies: AzureTerraformNetworkReplacementCompletionDependencies,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(dependencies.site),
    journalSha256 = dependencies.journalSha256,
    sourceBindingSha256 = dependencies.sourceBindingSha256,
    loaders = dependencies.loaders,
    loadSource = loaders.loadSource,
    loadOutcome = loaders.loadOutcome,
    historical = dependencies.qualifyHistorical,
    completed = dependencies.qualifyCompletedOperational,
    qualifiedPrevious = dependencies.qualifiedPrevious ? structuredClone(dependencies.qualifiedPrevious) : undefined;
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require(same(owner, azureUpgradeBinding(plan).owner) &&
    sha(journalSha256) &&
    sha(sourceBindingSha256) &&
    typeof completed === 'function', 'resolved owning completion context required');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () =>
    require(same(plan, request) &&
      same(owner, store.owner) &&
      same(site, dependencies.site) &&
      journalSha256 === dependencies.journalSha256 &&
      sourceBindingSha256 === dependencies.sourceBindingSha256 &&
      dependencies.loaders === loaders &&
      loaders.loadSource === loadSource &&
      loaders.loadOutcome === loadOutcome &&
      dependencies.qualifyHistorical === historical &&
      dependencies.qualifyCompletedOperational === completed &&
      same(qualifiedPrevious, dependencies.qualifiedPrevious), 'owning completion context changed');
  const verify = async () => {
    unchanged();
    await bounded(() => store.verify());
    unchanged();
  };
  await verify();
  const observed = new Map<string, string>(),
    sources = new Map<string, string>(),
    outcomes = new Map<string, { plan: AzureCePlan; sha256: string }>();
  const read = async (name: string) => {
    unchanged();
    const raw = await bounded(() => store.read(name)),
      digest = canonicalSha256(raw);
    require(!observed.has(name) || observed.get(name) === digest, 'private packet changed across completion reads');
    observed.set(name, digest);
    unchanged();
    return structuredClone(raw);
  };
  const readonly = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Completion history is read-only');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const fixedLoaders = {
    async loadSource(digest: string) {
      const raw = await bounded(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(raw);
      require(!sources.has(digest) || sources.get(digest) === actual, 'predecessor plan changed');
      sources.set(digest, actual);
      unchanged();
      return structuredClone(raw);
    },
    async loadOutcome(source: AzureCePlan) {
      const raw = await bounded(() => loadOutcome.call(loaders, structuredClone(source))),
        actual = canonicalSha256(raw);
      require(!outcomes.has(source.planSha256) ||
        outcomes.get(source.planSha256)?.sha256 === actual, 'predecessor outcome changed');
      outcomes.set(source.planSha256, { plan: structuredClone(source), sha256: actual });
      unchanged();
      return structuredClone(raw);
    },
  };
  const historicalVerifier: typeof historical = (receipt, identity, mode) => {
    require(mode === 'historical', 'completion ancestry requires historical provenance');
    return bounded(() => historical(structuredClone(receipt), structuredClone(identity), 'historical', deadline));
  };
  const qualified = await readAzureTerraformNetworkReplacementExecutionBinding(
    plan,
    readonly,
    fixedLoaders,
    site,
    journalSha256,
    historicalVerifier,
    deadline,
    qualifiedPrevious,
    completed,
  );
  const journal = qualified.execution;
  require(journal.journal.sourceBindingSha256 === sourceBindingSha256 &&
    qualified.source.sourceBindingSha256 === sourceBindingSha256, 'journal source differs');
  const binding = qualified.source.binding;
  require(same(await read(`${plan.planId}-terraform-replacement-plan.json`), plan), 'saved public request differs');
  const checkpoint = validateAzureTerraformReplacementCheckpoint(
    plan,
    await read(`${plan.planId}-terraform-replacement.json`),
  );
  require(['launched', 'complete'].includes(checkpoint.phase) &&
    uuid(checkpoint.newVmId) &&
    !Object.values(binding.before.nodes).some((v) => lower(v.vmId) === lower(checkpoint.newVmId)) &&
    checkpoint.networkExecutionJournalSha256 === journalSha256 &&
    checkpoint.networkSourceBindingSha256 ===
      sourceBindingSha256, 'launched owning checkpoint and distinct new UUID required');
  const snapshot = await read(`${plan.planId}-terraform-replacement-source.json`),
    material = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot);
  require(material.source === binding.source, 'frozen replacement source differs');
  const oldVmIds: Record<string, string> = {},
    ownerPlanSha256ByNode: Record<string, string> = {},
    retainedNics: typeof checkpoint.retainedNics = {};
  for (const [node, vm] of Object.entries(binding.before.nodes)) {
    oldVmIds[`${plan.deploymentName}-${node}`] = vm.vmId;
    ownerPlanSha256ByNode[`${plan.deploymentName}-${node}`] = vm.ownerPlanSha256;
    for (const [index, nic] of Object.entries(vm.nics))
      retainedNics[`${node}:${index}`] = {
        resourceId: nic.resourceId,
        subnetId: nic.subnetId,
        mac: nic.mac,
        privateIp: nic.privateIp,
        ownerPlanSha256: nic.ownerPlanSha256,
      };
  }
  require(same(
    {
      oldVmIds: checkpoint.oldVmIds,
      ownerPlanSha256ByNode: checkpoint.ownerPlanSha256ByNode,
      retainedNics: checkpoint.retainedNics,
      siteUid: checkpoint.siteUid,
      siteConfigurationSha256: checkpoint.siteConfigurationSha256,
    },
    { oldVmIds, ownerPlanSha256ByNode, retainedNics, ...site },
  ), 'checkpoint full binding projection differs');
  const records = new Map<string, unknown>();
  for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
    const name = `${plan.planId}-terraform-${suffix}.json`;
    records.set(name, await read(name));
  }
  validateAzureTerraformReplacementStageHistory(plan, checkpoint, snapshot, records, binding.providerLockSha256);
  const stageRecords = {
    quiesce: records.get(`${plan.planId}-terraform-quiesce-plan.json`) as { receipt: PlanReceipt },
    launch: records.get(`${plan.planId}-terraform-launch-plan.json`) as { receipt: PlanReceipt },
  };
  const finish = async () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const [digest, expected] of sources)
        require(canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) ===
          expected, 'predecessor plan changed during completion');
      for (const { plan: source, sha256 } of outcomes.values())
        require(canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(source)))) ===
          sha256, 'predecessor outcome changed during completion');
      await verify();
      for (const [name, expected] of observed)
        require(canonicalSha256(await bounded(() => store.read(name))) ===
          expected, 'private completion history changed');
    }
    unchanged();
    deadline.throwIfAborted();
  };
  const qualify = async (
    packet: AzureTerraformNetworkReplacementCompletion['operational'],
    mode: 'current' | 'historical',
  ) => {
    let result: unknown;
    try {
      result = await bounded(() =>
        completed(structuredClone(packet.receipt), structuredClone(packet.identity), mode, deadline),
      );
    } catch {
      deadline.throwIfAborted();
      await finish();
      unchanged();
      throw new AzureTerraformNetworkReplacementCompletionUnavailable('Completion operational provenance unavailable');
    }
    require(same(verification(result), verification(packet.verification)), 'operational provenance changed');
    unchanged();
  };
  return {
    plan,
    owner,
    site,
    binding,
    checkpoint,
    material,
    stageRecords,
    journalSha256,
    sourceBindingSha256,
    read,
    bounded,
    finish,
    qualify,
    unchanged,
    deadline,
    readonly,
    latestFinal: records.get(`${plan.planId}-terraform-replacement-final-plan.json`),
  };
}
export type AzureTerraformNetworkReplacementCompletionArtifacts = Awaited<
  ReturnType<typeof openAzureTerraformNetworkReplacementCompletionArtifacts>
>;

/** Pure private identity validation. No current health/freshness is inferred from this record. */
export function validateAzureTerraformNetworkReplacementCompletion(
  c: AzureTerraformNetworkReplacementCompletionArtifacts,
  value: unknown,
): AzureTerraformNetworkReplacementCompletion {
  keys(value, [
    'schemaVersion',
    'kind',
    'engine',
    'owner',
    'planSha256',
    'originalPlanSha256',
    'retainedPlanSha256',
    'journalSha256',
    'sourceBindingSha256',
    'checkpointSha256',
    'sourceConfigurationSha256',
    'providerLockSha256',
    'finalConfigurationSha256',
    'selectedNode',
    'newVmId',
    'stageRecordSha256',
    'stageApplications',
    'finalReceipt',
    'operational',
  ]);
  const row = value as AzureTerraformNetworkReplacementCompletion,
    { plan, binding, checkpoint, material } = c;
  require(row.schemaVersion === 1 &&
    row.kind === 'azure-terraform-network-replacement-completion' &&
    row.engine === 'terraform' &&
    same(row.owner, c.owner) &&
    row.planSha256 === plan.planSha256 &&
    row.originalPlanSha256 === binding.originalPlanSha256 &&
    row.retainedPlanSha256 === binding.retainedPlanSha256 &&
    row.journalSha256 === c.journalSha256 &&
    row.sourceBindingSha256 === c.sourceBindingSha256 &&
    row.checkpointSha256 === canonicalSha256({ ...checkpoint, phase: 'complete' }) &&
    row.sourceConfigurationSha256 === binding.sourceConfigurationSha256 &&
    row.providerLockSha256 === binding.providerLockSha256 &&
    row.finalConfigurationSha256 === material.stages.launch.configurationSha256 &&
    row.selectedNode === checkpoint.node &&
    row.newVmId === checkpoint.newVmId, 'immutable completion identity differs');
  keys(row.stageRecordSha256, ['quiesce', 'launch']);
  keys(row.stageApplications, ['quiesce', 'launch']);
  for (const phase of ['quiesce', 'launch'] as const) {
    require(row.stageRecordSha256[phase] === canonicalSha256(c.stageRecords[phase]) &&
      row.stageApplications[phase] ===
        (c.stageRecords[phase].receipt.noChanges ? 'no-change' : 'applied'), 'original consumed stage proof differs');
  }
  validateAzureTerraformReplacementStageReceipt(
    plan,
    material.stages.launch,
    row.finalReceipt,
    binding.providerLockSha256,
  );
  require(row.finalReceipt.noChanges &&
    row.finalReceipt.changes.every(
      (v) => v.actions.join(',') === 'no-op',
    ), 'original final no-change receipt required');
  keys(row.operational, ['identity', 'receipt', 'receiptSha256', 'verification']);
  require(row.operational.receipt !== undefined &&
    row.operational.receipt !== null &&
    row.operational.receiptSha256 ===
      canonicalSha256(row.operational.receipt), 'private operational receipt digest differs');
  verification(row.operational.verification);
  const identity = row.operational.identity;
  keys(identity, [
    'owner',
    'planSha256',
    'journalSha256',
    'sourceBindingSha256',
    'configurationSha256',
    'site',
    'phase',
    'nodes',
  ]);
  const { nodes: _nodes, ...identityBinding } = identity;
  require(same(identityBinding, {
    owner: c.owner,
    planSha256: plan.planSha256,
    journalSha256: c.journalSha256,
    sourceBindingSha256: c.sourceBindingSha256,
    configurationSha256: row.finalConfigurationSha256,
    site: c.site,
    phase: 'launched',
  }), 'operational identity differs');
  keys(identity.nodes, Object.keys(binding.before.nodes));
  for (const [node, vm] of Object.entries(binding.before.nodes)) {
    const current = identity.nodes[node];
    keys(current, ['resourceId', 'vmId', 'vmState', 'ownerPlanSha256', 'nics']);
    const selected = Number(node) === row.selectedNode;
    require(current.resourceId === vm.resourceId &&
      current.vmState === 'present' &&
      lower(current.vmId) === lower(selected ? row.newVmId : vm.vmId) &&
      current.ownerPlanSha256 === (selected ? plan.planSha256 : vm.ownerPlanSha256), 'complete VM generation differs');
    keys(current.nics, Object.keys(vm.nics));
    for (const [index, nic] of Object.entries(vm.nics))
      require(same(current.nics[index], {
        ...nic,
        attachment: vm.resourceId,
      }), 'full retained NIC/IP-configuration/subnet differs');
  }
  return structuredClone(row);
}

/** Actual owning executor only, under its process lock. Preserves the first accepted packet on
 * resume; refreshed final plans/current observations cannot overwrite original completion. */
export async function publishAzureTerraformNetworkReplacementCompletion(
  request: AzureCePlan,
  store: CeDeploymentStore,
  session: TerraformSession,
  dependencies: AzureTerraformNetworkReplacementCompletionDependencies,
  current: {
    identity: AzureTerraformNetworkReplacementOperationalIdentity;
    receipt: unknown;
    verification: Verification;
  },
  final: PlanReceipt,
  signal?: AbortSignal,
) {
  const c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal),
    name = azureTerraformNetworkReplacementCompletionName(c.plan);
  let existing: unknown;
  try {
    existing = await c.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const readHistory = session.readPlanApplicationHistory,
    readCurrentState = session.readPlanApplicationState,
    readConfiguration = session.readConfigurationSha256,
    readSource = session.readConfiguration;
  require(typeof readHistory === 'function' &&
    typeof readCurrentState === 'function' &&
    typeof readConfiguration === 'function' &&
    typeof readSource === 'function', 'owning native current and historical receipt readers required');
  const readersUnchanged = () => {
    require(session.readPlanApplicationHistory === readHistory &&
      session.readPlanApplicationState === readCurrentState &&
      session.readConfigurationSha256 === readConfiguration &&
      session.readConfiguration === readSource, 'owning native receipt reader changed');
    c.unchanged();
  };
  const deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const manifestOf = (configurationSha256: string) =>
    canonicalSha256({
      ...identity,
      configurationSha256,
      providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
    });
  const histories = new Map<string, string>();
  const verifySession = async () => {
    readersUnchanged();
    require((await c.bounded(() => readConfiguration.call(session))) === c.material.stages.launch.configurationSha256 &&
      (await c.bounded(() => readSource.call(session, c.material.stages.launch.configurationSha256))) ===
        c.material.stages.launch.configuration, 'owning final private configuration differs');
    readersUnchanged();
    // Stage receipts are historical after revision and final refresh. The current-only
    // application reader cannot authenticate archived quiesce/launch plan bytes.
    for (const phase of ['quiesce', 'launch'] as const) {
      const receipt = structuredClone(c.stageRecords[phase].receipt),
        expectedReceiptSha256 = canonicalSha256(receipt),
        history = await c.bounded(() => readHistory.call(session, receipt, c.deadline));
      readersUnchanged();
      keys(history, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'matches',
        'incompleteArchives',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require(history.schemaVersion === 1 &&
        history.scope === 'exact-saved-plan-journal-history' &&
        canonicalSha256(receipt) === expectedReceiptSha256 &&
        history.receiptSha256 === expectedReceiptSha256 &&
        history.manifestSha256 === manifestOf(c.material.stages.launch.configurationSha256) &&
        history.incompleteArchives === 0 &&
        history.applicationOutcomeQualified === false &&
        history.retirementQualified === false &&
        Array.isArray(history.matches) &&
        history.matches.length > 0, 'complete exact native historical stage receipt required');
      const occurrences = new Set<string>();
      for (const match of history.matches) {
        keys(match, [
          'location',
          'archiveSha256',
          'state',
          'journalSha256',
          'savedPlanSha256',
          'configurationSha256',
          'manifestSha256',
        ]);
        const occurrence = `${match.location}:${match.archiveSha256}`;
        require(['current', 'revision', 'plan-history'].includes(match.location) &&
          sha(match.archiveSha256) &&
          sha(match.journalSha256) &&
          !occurrences.has(occurrence) &&
          match.savedPlanSha256 === receipt.planSha256 &&
          match.configurationSha256 === receipt.configurationSha256 &&
          match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
          (receipt.noChanges
            ? ['planned', 'applied'].includes(match.state)
            : match.state === 'applied'), 'exact consumed historical application state required');
        occurrences.add(occurrence);
      }
      const digest = canonicalSha256(history),
        prior = histories.get(phase);
      require(prior === undefined || prior === digest, 'native historical stage changed across callbacks');
      histories.set(phase, digest);
    }
    // The final refresh is still the current saved receipt at publication.
    require(same(final, c.latestFinal) &&
      ['planned', 'applied'].includes(
        await c.bounded(() => readCurrentState.call(session, final)),
      ), 'exact current final no-change receipt required');
    readersUnchanged();
  };
  await verifySession();
  const qualify = async (
    operational: AzureTerraformNetworkReplacementCompletion['operational'],
    mode: 'current' | 'historical',
  ) => {
    try {
      await c.qualify(operational, mode);
    } catch (error) {
      await verifySession();
      await c.finish();
      throw error;
    }
  };
  let packet: AzureTerraformNetworkReplacementCompletion;
  if (existing !== undefined) {
    packet = validateAzureTerraformNetworkReplacementCompletion(c, existing);
    await qualify(packet.operational, 'historical');
  } else {
    require(c.checkpoint.phase ===
      'launched', 'ordinary complete checkpoint cannot reconstruct missing immutable completion');
    require(same(final, c.latestFinal), 'original saved final receipt differs from owning executor');
    const row: AzureTerraformNetworkReplacementCompletion = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-completion',
      engine: 'terraform',
      owner: structuredClone(c.owner),
      planSha256: c.plan.planSha256,
      originalPlanSha256: c.binding.originalPlanSha256,
      retainedPlanSha256: c.binding.retainedPlanSha256,
      journalSha256: c.journalSha256,
      sourceBindingSha256: c.sourceBindingSha256,
      checkpointSha256: canonicalSha256({ ...c.checkpoint, phase: 'complete' }),
      sourceConfigurationSha256: c.binding.sourceConfigurationSha256,
      providerLockSha256: c.binding.providerLockSha256,
      finalConfigurationSha256: c.material.stages.launch.configurationSha256,
      selectedNode: c.checkpoint.node,
      newVmId: c.checkpoint.newVmId as string,
      stageRecordSha256: {
        quiesce: canonicalSha256(c.stageRecords.quiesce),
        launch: canonicalSha256(c.stageRecords.launch),
      },
      stageApplications: {
        quiesce: c.stageRecords.quiesce.receipt.noChanges ? 'no-change' : 'applied',
        launch: c.stageRecords.launch.receipt.noChanges ? 'no-change' : 'applied',
      },
      finalReceipt: structuredClone(final),
      operational: { ...structuredClone(current), receiptSha256: canonicalSha256(current.receipt) },
    };
    packet = validateAzureTerraformNetworkReplacementCompletion(c, row);
    await qualify(packet.operational, 'current');
  }
  await verifySession();
  await c.finish();
  await verifySession();
  await c.finish();
  const expected = canonicalSha256(packet);
  if (existing === undefined) {
    try {
      const later = await c.bounded(() => store.read(name));
      require(canonicalSha256(later) === expected, 'late foreign immutable completion must be preserved');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      c.unchanged();
      await c.bounded(() => store.write(name, packet));
    }
  }
  require(canonicalSha256(await c.bounded(() => store.read(name))) ===
    expected, 'completion changed during publication');
  await c.finish();
  require(canonicalSha256(await c.bounded(() => store.read(name))) ===
    expected, 'completion changed after provenance callbacks');
  await verifySession();
  await c.finish();
  await verifySession();
  c.unchanged();
  c.deadline.throwIfAborted();
  return { completionSha256: expected, checkpointSha256: packet.checkpointSha256 };
}
