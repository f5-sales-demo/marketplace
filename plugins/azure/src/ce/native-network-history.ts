import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNativeNetworkCheckpointHistory,
  azureNativeNetworkCheckpointHistoryName,
  isAzureNativeNetworkCheckpointHistory,
  validateAzureNativeNetworkCheckpointHistory,
} from './native-network-checkpoint-history';
import { qualifyAzureNativeNetworkGenerationBoundary } from './native-network-generation';
import { azureNativeNetworkScope, verifyAzureNativeNetworkProfile } from './native-network-plan';
import { readAzureNativeFinalConfiguration } from './native-registered-configuration';
import { type AzureNativeNetworkUpdateCheckpoint, validateAzureNativeNetworkUpdateCheckpoint } from './network-update';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

export interface AzureNativeNetworkHistory {
  schemaVersion: 1;
  kind: 'azure-native-network-history';
  engine: 'native';
  owner: CeDeploymentStore['owner'];
  sourcePlanSha256: string;
  networkUpdate: AzureNativeNetworkUpdateCheckpoint;
  finalConfigurationSha256: string;
}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure native network history: ${message}`);
}
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed history record');
  return value as Record<string, unknown>;
};
const same = canonicalEqual;
export const azureNativeNetworkHistoryName = (plan: AzureCePlan) => `native-network-history-${plan.planSha256}.json`;
export const isAzureNativeNetworkHistory = (name: string) => /^native-network-history-[a-f0-9]{64}\.json$/.test(name);

/** Validate historical completion. Receipt collection timestamps are not original CE heartbeats. */
export function validateAzureNativeNetworkHistory(plan: AzureCePlan, value: unknown): AzureNativeNetworkHistory {
  verifyAzureCePlan(plan);
  const profile = verifyAzureNativeNetworkProfile(plan),
    row = object(value);
  require(Object.keys(row).sort().join(',') ===
    'engine,finalConfigurationSha256,kind,networkUpdate,owner,schemaVersion,sourcePlanSha256' &&
    row.schemaVersion === 1 &&
    row.kind === 'azure-native-network-history' &&
    row.engine === 'native' &&
    row.sourcePlanSha256 === plan.planSha256 &&
    same(row.owner, azureUpgradeBinding(plan).owner) &&
    typeof row.finalConfigurationSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(row.finalConfigurationSha256), 'owned source or receipt schema differs');
  const network = validateAzureNativeNetworkUpdateCheckpoint(
    plan,
    row.networkUpdate,
    plan.actions.map((a) => a.id),
  );
  require(network.source &&
    network.source.originalPlanSha256 === profile.originalPlanSha256 &&
    (profile.retainedPlanSha256 === profile.originalPlanSha256
      ? network.source.networkHistoryPlanSha256s.length === 0
      : network.source.networkHistoryPlanSha256s.at(-1) ===
        profile.retainedPlanSha256), 'completed network predecessor differs');
  return value as AzureNativeNetworkHistory;
}

/** Require the exact completed public checkpoint and bound final CE configuration before immutable persistence. */
export async function persistAzureNativeNetworkHistory(
  plan: AzureCePlan,
  checkpoint: AzureCeCheckpoint,
  store: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
): Promise<void> {
  await store.verify();
  verifyAzureNativeNetworkProfile(plan);
  require(checkpoint.engine === 'native' &&
    checkpoint.planId === plan.planId &&
    checkpoint.planSha256 === plan.planSha256 &&
    checkpoint.state === 'complete' &&
    !checkpoint.pendingAction &&
    same(
      checkpoint.completedActionIds,
      plan.actions.map((a) => a.id),
    ) &&
    checkpoint.networkUpdate?.source, 'complete owning public execution required');
  const network = validateAzureNativeNetworkUpdateCheckpoint(
    plan,
    checkpoint.networkUpdate,
    checkpoint.completedActionIds,
  );
  const configuration = await readAzureNativeFinalConfiguration(plan, network.current, store);
  require(configuration.siteUid === network.source?.siteUid &&
    configuration.siteConfigurationSha256 === network.source?.siteConfigurationSha256 &&
    Object.entries(configuration.instances).every(
      ([node, id]) =>
        id.toLowerCase() ===
        network.current.nodes[String(azureUpgradeBinding(plan).nodes.indexOf(node) + 1)].vmId.toLowerCase(),
    ), 'final site or registered UUID binding differs');
  const row: AzureNativeNetworkHistory = {
    schemaVersion: 1,
    kind: 'azure-native-network-history',
    engine: 'native',
    owner: azureUpgradeBinding(plan).owner,
    sourcePlanSha256: plan.planSha256,
    networkUpdate: structuredClone(network),
    finalConfigurationSha256: configuration.receiptSha256,
  };
  validateAzureNativeNetworkHistory(plan, row);
  let saved: unknown;
  try {
    saved = await store.read(azureNativeNetworkHistoryName(plan));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  require(saved === undefined || same(saved, row), 'immutable completed history changed');
  if (saved === undefined) await store.write(azureNativeNetworkHistoryName(plan), row);
}

/** Join neighboring historical/current boundaries without relying on query timestamps or dynamic-address equality. */
export function verifyAzureNativeNetworkHistoryBoundary(
  previous: AzureNativeNetworkUpdateCheckpoint['current'],
  next: AzureNativeNetworkUpdateCheckpoint['before'],
): void {
  require(same(
    Object.keys(previous.nodes).sort(),
    Object.keys(next.nodes).sort(),
  ), 'complete predecessor node boundary required');
  for (const [node, state] of Object.entries(previous.nodes)) {
    const current = next.nodes[node];
    require(same(
      { id: state.resourceId, uuid: state.vmId.toLowerCase(), owner: state.ownerPlanSha256 },
      { id: current.resourceId, uuid: current.vmId.toLowerCase(), owner: current.ownerPlanSha256 },
    ) &&
      same(
        Object.keys(state.nics).sort(),
        Object.keys(current.nics).sort(),
      ), 'predecessor VM generation boundary differs');
    for (const [index, nic] of Object.entries(state.nics)) {
      const observed = current.nics[index];
      require([
        'resourceId',
        'ownerPlanSha256',
        'mac',
        'ipConfigurationId',
        'ipConfigurationName',
        'allocation',
        'subnetId',
        'subnetCidr',
      ].every(
        (key) =>
          String(nic[key as keyof typeof nic]).toLowerCase() ===
          String(observed[key as keyof typeof observed]).toLowerCase(),
      ) &&
        (nic.allocation !== 'Static' ||
          nic.privateIp === observed.privateIp), 'predecessor NIC/configuration/subnet boundary differs');
    }
  }
}

/** Follow only explicit predecessor identities. Branches, cycles, pending execution and rewritten receipts cannot substitute. */
export async function qualifyAzureNativeNetworkHistories(
  plan: AzureCePlan,
  before: AzureNativeNetworkUpdateCheckpoint['before'],
  original: AzureCePlan,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  load: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
  originalSite: { siteUid: string; siteConfigurationSha256: string },
) {
  await store.verify();
  const profile = verifyAzureNativeNetworkProfile(plan);
  require(profile.originalPlanSha256 === original.planSha256, 'original creation identity differs');
  const chain: Array<{ source: AzureCePlan; history: AzureNativeNetworkHistory }> = [],
    visited = new Set([plan.planSha256]);
  let digest = profile.retainedPlanSha256;
  while (digest !== original.planSha256) {
    require(!visited.has(digest), 'cyclic network history');
    visited.add(digest);
    const source = (await store.read(`native-source-${digest}.json`)) as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planSha256 === digest &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
      same(
        azureNativeNetworkScope(source, true),
        azureNativeNetworkScope(original, true),
      ), 'network source scope differs');
    const preceding = verifyAzureNativeNetworkProfile(source);
    require(preceding.originalPlanSha256 === original.planSha256, 'network source has a foreign original');
    const history = validateAzureNativeNetworkHistory(source, await store.read(azureNativeNetworkHistoryName(source)));
    require(history.networkUpdate.source?.siteUid === originalSite.siteUid &&
      history.networkUpdate.source?.siteConfigurationSha256 ===
        originalSite.siteConfigurationSha256, 'original logical-site binding differs across network histories');
    const publicCheckpoint = await load(source);
    require(publicCheckpoint?.state === 'complete' &&
      !publicCheckpoint.pendingAction &&
      same(
        publicCheckpoint.completedActionIds,
        source.actions.map((a) => a.id),
      ) &&
      same(
        publicCheckpoint.networkUpdate,
        history.networkUpdate,
      ), 'prior network public execution is incomplete or differs');
    const final = await readAzureNativeFinalConfiguration(source, history.networkUpdate.current, store);
    require(final.receiptSha256 === history.finalConfigurationSha256 &&
      final.siteUid === history.networkUpdate.source?.siteUid &&
      final.siteConfigurationSha256 ===
        history.networkUpdate.source?.siteConfigurationSha256, 'prior network final configuration receipt changed');
    chain.unshift({ source, history });
    digest = preceding.retainedPlanSha256;
  }
  const digests: string[] = [];
  for (const [index, entry] of chain.entries()) {
    require(same(
      entry.history.networkUpdate.source?.networkHistoryPlanSha256s,
      digests,
    ), 'ordered predecessor lineage differs');
    if (index > 0) {
      const preceding = chain[index - 1],
        binding = verifyAzureNativeNetworkProfile(entry.source);
      const expected =
        binding.schemaVersion === 2
          ? (
              await qualifyAzureNativeNetworkGenerationBoundary(
                preceding.source,
                preceding.history.networkUpdate.current,
                binding.retainedReplacementPlanSha256,
                store,
                load,
              )
            ).inventory
          : preceding.history.networkUpdate.current;
      verifyAzureNativeNetworkHistoryBoundary(expected, entry.history.networkUpdate.before);
    }
    digests.push(entry.source.planSha256);
  }
  const latest = chain.at(-1);
  if (latest) {
    const expected =
      profile.schemaVersion === 2
        ? (
            await qualifyAzureNativeNetworkGenerationBoundary(
              latest.source,
              latest.history.networkUpdate.current,
              profile.retainedReplacementPlanSha256,
              store,
              load,
            )
          ).inventory
        : latest.history.networkUpdate.current;
    verifyAzureNativeNetworkHistoryBoundary(expected, before);
  }
  return { planSha256s: digests, originalBoundary: chain[0]?.history.networkUpdate.before ?? before };
}

async function verifyAzureNativeNetworkHistoricalBefore(
  base: AzureCePlan,
  plan: AzureCePlan,
  siteUid: string,
  network: AzureNativeNetworkUpdateCheckpoint,
  sources: Map<string, AzureCePlan>,
  store: Pick<CeDeploymentStore, 'read'>,
): Promise<void> {
  const profile = verifyAzureNativeNetworkProfile(plan),
    origin = network.source;
  require(profile.originalPlanSha256 === base.planSha256 &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(base)) &&
    same(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(base, true)), 'network source scope differs');
  require(origin && origin.siteUid === siteUid, 'historical original source or logical site is missing');
  const birth = await readAzureNativeFinalConfiguration(base, network.before, store),
    reservation = object(await store.read('native-site.json'));
  require(birth.siteUid === siteUid &&
    birth.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
    reservation.uid === siteUid &&
    reservation.siteName === base.siteName &&
    same(reservation.owner, azureUpgradeBinding(base).owner) &&
    reservation.contractFingerprint === birth.contractFingerprint, 'original configuration or reservation differs');
  const generations = new Set<string>();
  const visit = async (digest: string, node: string, uuid: string, path: Set<string>): Promise<void> => {
    require(!path.has(digest), 'cyclic historical VM generation');
    generations.add(digest);
    if (digest === base.planSha256) {
      require(birth.instances[node]?.toLowerCase() === uuid.toLowerCase(), 'original VM UUID differs');
      return;
    }
    const generation = sources.get(digest);
    require(generation?.intent.operation === 'replace-node' &&
      generation.intent.replacementNode ===
        azureUpgradeBinding(base).nodes.indexOf(node) + 1, 'retained VM generation source is unresolved');
    const record = object(await store.read(`native-replacement-history-${digest}.json`));
    const replacement = object(record.replacement);
    require(replacement.status === 'registered' &&
      replacement.siteUid === siteUid &&
      replacement.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
      same(replacement.originalSourcePlan, base) &&
      String(replacement.newVmId).toLowerCase() === uuid.toLowerCase(), 'retained VM generation was not registered');
    const health = await readAzureNativeFinalConfiguration(generation as AzureCePlan, network.before, store);
    require(health.siteUid === siteUid &&
      health.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
      health.instances[node]?.toLowerCase() === uuid.toLowerCase(), 'registered generation configuration differs');
    const owners = object(replacement.ownerPlanSha256ByNode),
      old = object(replacement.oldVmIds);
    for (const survivor of azureUpgradeBinding(base).nodes) {
      if (survivor !== node)
        require(health.instances[survivor]?.toLowerCase() ===
          String(old[survivor]).toLowerCase(), 'historical generation survivor UUID differs');
      await visit(String(owners[survivor]), survivor, String(old[survivor]), new Set([...path, digest]));
    }
  };

  for (const [index, node] of azureUpgradeBinding(base).nodes.entries()) {
    const before = network.before.nodes[String(index + 1)];
    await visit(before.ownerPlanSha256, node, before.vmId, new Set());
  }
  require(same([...generations].sort(), origin.generationPlanSha256s), 'complete VM generation lineage differs');
}

/** Offline retirement qualifies immutable completed network records after private admission retirement.
 * Completion snapshots and configuration receipts establish provenance, never operational freshness.
 */
export async function verifyAzureNativeNetworkHistoryRecords(
  base: AzureCePlan,
  siteUid: string,
  records: Map<string, unknown>,
): Promise<void> {
  const sources = new Map<string, AzureCePlan>([[base.planSha256, base]]);
  for (const [name, value] of records)
    if (name.startsWith('native-source-')) {
      const source = value as AzureCePlan;
      verifyAzureCePlan(source);
      require(name === `native-source-${source.planSha256}.json`, 'source filename differs');
      sources.set(source.planSha256, source);
    }
  const store = {
    async read(name: string) {
      require(records.has(name), `required historical record is missing: ${name}`);
      return records.get(name);
    },
  };
  const histories = new Map<string, AzureNativeNetworkHistory>();
  for (const [name, value] of records)
    if (isAzureNativeNetworkHistory(name)) {
      const source = sources.get(String(object(value).sourcePlanSha256));
      require(source && name === azureNativeNetworkHistoryName(source), 'history source is unresolved');
      const plan = source as AzureCePlan,
        profile = verifyAzureNativeNetworkProfile(plan);
      require(profile.originalPlanSha256 === base.planSha256 &&
        same(azureUpgradeBinding(plan), azureUpgradeBinding(base)) &&
        same(azureNativeNetworkScope(plan, true), azureNativeNetworkScope(base, true)), 'network source scope differs');
      const history = validateAzureNativeNetworkHistory(plan, value),
        origin = history.networkUpdate.source;
      require(origin, 'completed original source is missing');
      require(origin.siteUid === siteUid, 'network original logical site differs');
      const birth = await readAzureNativeFinalConfiguration(base, history.networkUpdate.before, store);
      const final = await readAzureNativeFinalConfiguration(plan, history.networkUpdate.current, store);
      const reservation = object(await store.read('native-site.json'));
      require(birth.siteUid === siteUid &&
        birth.siteConfigurationSha256 === origin.siteConfigurationSha256 &&
        reservation.uid === siteUid &&
        reservation.siteName === base.siteName &&
        same(reservation.owner, azureUpgradeBinding(base).owner) &&
        reservation.contractFingerprint === birth.contractFingerprint &&
        final.receiptSha256 === history.finalConfigurationSha256 &&
        final.siteUid === siteUid &&
        final.siteConfigurationSha256 ===
          origin.siteConfigurationSha256, 'final or original configuration receipt differs');
      await verifyAzureNativeNetworkHistoricalBefore(base, plan, siteUid, history.networkUpdate, sources, store);
      for (const [index, node] of azureUpgradeBinding(base).nodes.entries())
        require(final.instances[node]?.toLowerCase() ===
          history.networkUpdate.current.nodes[
            String(index + 1)
          ].vmId.toLowerCase(), 'final registered VM UUID differs');
      histories.set(plan.planSha256, history);
    }
  const checkpoints = new Map<string, AzureNativeNetworkCheckpointHistory[]>();
  for (const [name, value] of records)
    if (isAzureNativeNetworkCheckpointHistory(name)) {
      const source = sources.get(String(object(value).sourcePlanSha256));
      require(source, 'public checkpoint source is unresolved');
      const row = validateAzureNativeNetworkCheckpointHistory(source, value);
      require(name === azureNativeNetworkCheckpointHistoryName(row), 'public checkpoint filename differs');
      await verifyAzureNativeNetworkHistoricalBefore(
        base,
        source,
        siteUid,
        row.checkpoint.networkUpdate as AzureNativeNetworkUpdateCheckpoint,
        sources,
        store,
      );
      const prior = checkpoints.get(source.planSha256) ?? [];
      require(prior.every((before) =>
        same(before.checkpoint.networkUpdate?.before, row.checkpoint.networkUpdate?.before),
      ), 'original public network inventory changed between checkpoints');
      checkpoints.set(source.planSha256, [...prior, row]);
    }
  const visit = async (digest: string, path: Set<string>): Promise<string[]> => {
    require(!path.has(digest), 'cyclic network history');
    const history = histories.get(digest),
      plan = sources.get(digest);
    require(history && plan, 'completed network predecessor is missing');
    const profile = verifyAzureNativeNetworkProfile(plan as AzureCePlan);
    let predecessors: string[] = [];
    if (profile.retainedPlanSha256 !== base.planSha256) {
      predecessors = await visit(profile.retainedPlanSha256, new Set([...path, digest]));
      const predecessor = histories.get(profile.retainedPlanSha256);
      require(predecessor, 'completed predecessor history is missing');
      const predecessorPlan = sources.get(profile.retainedPlanSha256) as AzureCePlan;
      const expected =
        profile.schemaVersion === 2
          ? (
              await qualifyAzureNativeNetworkGenerationBoundary(
                predecessorPlan,
                predecessor.networkUpdate.current,
                profile.retainedReplacementPlanSha256,
                store,
              )
            ).inventory
          : predecessor.networkUpdate.current;
      verifyAzureNativeNetworkHistoryBoundary(expected, history.networkUpdate.before);
    } else
      for (const node of Object.values(history.networkUpdate.before.nodes))
        for (const nic of base.nics) {
          const observed = node.nics[String(nic.index)],
            subnet =
              nic.subnet.resourceId ??
              `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${base.deploymentName}-vnet/subnets/${nic.subnet.name}`;
          require(observed.ownerPlanSha256 === base.planSha256 &&
            observed.subnetId.toLowerCase() === subnet.toLowerCase() &&
            (!nic.subnet.cidr || observed.subnetCidr === nic.subnet.cidr), 'original NIC/subnet boundary differs');
        }
    require(same(
      history.networkUpdate.source?.networkHistoryPlanSha256s,
      predecessors,
    ), 'ordered network predecessor lineage differs');
    return [...predecessors, digest];
  };
  for (const digest of histories.keys()) await visit(digest, new Set());
  for (const [digest, rows] of checkpoints) {
    const source = sources.get(digest) as AzureCePlan,
      profile = verifyAzureNativeNetworkProfile(source);
    for (const row of rows) {
      const network = row.checkpoint.networkUpdate as AzureNativeNetworkUpdateCheckpoint;
      let predecessors: string[] = [];
      if (profile.retainedPlanSha256 !== base.planSha256) {
        predecessors = await visit(profile.retainedPlanSha256, new Set([digest]));
        const predecessor = histories.get(profile.retainedPlanSha256);
        require(predecessor, 'public checkpoint completed predecessor is missing');
        const predecessorPlan = sources.get(profile.retainedPlanSha256) as AzureCePlan;
        const expected =
          profile.schemaVersion === 2
            ? (
                await qualifyAzureNativeNetworkGenerationBoundary(
                  predecessorPlan,
                  predecessor.networkUpdate.current,
                  profile.retainedReplacementPlanSha256,
                  store,
                )
              ).inventory
            : predecessor.networkUpdate.current;
        verifyAzureNativeNetworkHistoryBoundary(expected, network.before);
      } else
        for (const node of Object.values(network.before.nodes))
          for (const nic of base.nics) {
            const before = node.nics[String(nic.index)],
              subnet =
                nic.subnet.resourceId ??
                `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${base.deploymentName}-vnet/subnets/${nic.subnet.name}`;
            require(before.ownerPlanSha256 === base.planSha256 &&
              before.subnetId.toLowerCase() === subnet.toLowerCase() &&
              (!nic.subnet.cidr ||
                before.subnetCidr === nic.subnet.cidr), 'public checkpoint original NIC/subnet differs');
          }
      require(same(
        network.source?.networkHistoryPlanSha256s,
        predecessors,
      ), 'public checkpoint predecessor lineage differs');
    }
  }

  for (const source of sources.values())
    if (source.intent.operation === 'update-network') {
      require(source.engine === 'native' &&
        !source.relayProfile &&
        same(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
        same(
          azureNativeNetworkScope(source, true),
          azureNativeNetworkScope(base, true),
        ), 'network source owner/scope differs');
      if (!histories.has(source.planSha256)) {
        const rows = checkpoints.get(source.planSha256) ?? [];
        require(!rows.some(
          (row) => row.checkpoint.state === 'complete',
        ), 'completed public execution lacks complete network history');
        const receipts: Record<string, string> = {};
        for (const [name, value] of records)
          if (name.startsWith(`native-action-${source.planSha256}-`)) {
            const actionId = String(object(value).actionId);
            require(name === `native-action-${source.planSha256}-${actionId}.json` &&
              source.actions.some(
                (action) => action.id === actionId,
              ), 'interrupted source has unresolved action evidence');
            receipts[actionId] = canonicalSha256(value);
          }
        require(Object.keys(receipts).length === 0 ||
          rows.some(
            (row) => row.checkpoint.state !== 'complete' && same(row.actionReceiptSha256ById, receipts),
          ), 'executed network source lacks complete history or matching interrupted public evidence');
      }
    }
}
