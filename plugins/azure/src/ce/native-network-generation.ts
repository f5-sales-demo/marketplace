import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureNativeNetworkHistoryName, validateAzureNativeNetworkHistory } from './native-network-history';
import {
  verifyAzureNativeNetworkReplacementOriginalSource,
  verifyAzureNativeNetworkReplacementProfile,
} from './native-network-replacement';
import { azureNativeNetworkReplacementNics } from './native-network-replacement-execution';
import { readAzureNativeFinalConfiguration } from './native-registered-configuration';
import { azureNativeReplacementHistoryName, persistAzureNativeReplacementHistory } from './native-replacement-history';
import {
  type NativeWorkflowCheckpoint,
  validateAzureNativeAdmissionCheckpoint,
  validateAzureNativeReplacementState,
} from './native-workflow';
import { type AzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import { validateAzureCeCheckpoint } from './recovery';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

interface AzureNativeNetworkGenerationCompletion {
  schemaVersion: 1;
  kind: 'azure-native-network-generation-completion';
  engine: 'native';
  owner: CeDeploymentStore['owner'];
  sourcePlanSha256: string;
  checkpoint: AzureCeCheckpoint;
  checkpointSha256: string;
  replacementHistorySha256: string;
  finalConfigurationSha256: string;
}
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure native network generation: ${message}`);
}
const same = canonicalEqual;
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed generation record');
  return value as Record<string, unknown>;
};
export const azureNativeNetworkGenerationCompletionName = (source: AzureCePlan) =>
  `native-network-generation-${source.planSha256}.json`;
export const isAzureNativeNetworkGenerationCompletion = (name: string) =>
  /^native-network-generation-[a-f0-9]{64}\.json$/.test(name);

function complete(source: AzureCePlan, checkpoint: AzureCeCheckpoint) {
  validateAzureCeCheckpoint(checkpoint, source);
  require(checkpoint.state === 'complete' &&
    !checkpoint.pendingAction &&
    !checkpoint.failedActionId &&
    same(
      checkpoint.completedActionIds,
      source.actions.map((a) => a.id),
    ), 'complete ordered public generation execution required');
}

/** Structural shape only: execution must resolve every VM owner through immutable completed generation receipts. */
export function validateAzureNativeNetworkGenerationInventory(
  network: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
) {
  const normalized = structuredClone(inventory);
  require(inventory &&
    typeof inventory === 'object' &&
    inventory.nodes &&
    typeof inventory.nodes === 'object', 'complete generation inventory required');
  for (const [index, node] of Object.entries(normalized.nodes)) {
    require(typeof node.ownerPlanSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(node.ownerPlanSha256), 'generation owner is unresolved');
    const action = network.actions.find((a) => a.kind === 'vm-deallocate' && a.node === Number(index));
    require(action?.expectedOwnerPlanSha256, 'original network VM action is unresolved');
    node.ownerPlanSha256 = action.expectedOwnerPlanSha256;
  }
  validateAzureNetworkUpdateInventory(network, normalized);
}

/** Non-secret receipt of actual public completion, separate from prepared/registered admission alone. */
export async function persistAzureNativeNetworkGenerationCompletion(
  source: AzureCePlan,
  checkpoint: AzureCeCheckpoint,
  store: Pick<CeDeploymentStore, 'read' | 'write' | 'verify' | 'owner'>,
) {
  await store.verify();
  verifyAzureNativeNetworkReplacementProfile(source);
  complete(source, checkpoint);
  require(same(store.owner, azureUpgradeBinding(source).owner) &&
    same(
      await store.read(`native-source-${source.planSha256}.json`),
      source,
    ), 'saved generation source or store differs');
  const admission = (await store.read(`native-admission-${source.planSha256}.json`)) as NativeWorkflowCheckpoint;
  validateAzureNativeAdmissionCheckpoint(source, admission);
  require(admission.replacement?.status === 'registered' &&
    admission.replacement.networkInventory, 'registered generation identity required');
  await persistAzureNativeReplacementHistory(source, admission, store);
  const history = await store.read(azureNativeReplacementHistoryName(source));
  const final = await readAzureNativeFinalConfiguration(source, admission.replacement.networkInventory, store);
  const selected = `${source.deploymentName}-${source.intent.replacementNode}`;
  require(final.siteUid === admission.replacement.siteUid &&
    final.siteConfigurationSha256 === admission.replacement.siteConfigurationSha256 &&
    Object.entries(final.instances).every(
      ([node, uuid]) =>
        uuid.toLowerCase() ===
        (node === selected ? admission.replacement?.newVmId : admission.replacement?.oldVmIds[node])?.toLowerCase(),
    ), 'completed generation selected/survivor registration differs');
  const row: AzureNativeNetworkGenerationCompletion = {
    schemaVersion: 1,
    kind: 'azure-native-network-generation-completion',
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: source.planSha256,
    checkpoint: structuredClone(checkpoint),
    checkpointSha256: canonicalSha256(checkpoint),
    replacementHistorySha256: canonicalSha256(history),
    finalConfigurationSha256: final.receiptSha256,
  };
  let saved: unknown;
  try {
    saved = await store.read(azureNativeNetworkGenerationCompletionName(source));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  require(saved === undefined || same(saved, row), 'immutable completed generation receipt changed');
  if (saved === undefined) await store.write(azureNativeNetworkGenerationCompletionName(source), row);
}

export async function readAzureNativeNetworkGenerationCompletion(
  source: AzureCePlan,
  store: Pick<CeDeploymentStore, 'read'>,
  load?: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
) {
  verifyAzureCePlan(source);
  verifyAzureNativeNetworkReplacementProfile(source);
  const row = object(await store.read(azureNativeNetworkGenerationCompletionName(source)));
  require(Object.keys(row).sort().join(',') ===
    'checkpoint,checkpointSha256,engine,finalConfigurationSha256,kind,owner,replacementHistorySha256,schemaVersion,sourcePlanSha256' &&
    row.schemaVersion === 1 &&
    row.kind === 'azure-native-network-generation-completion' &&
    row.engine === 'native' &&
    row.sourcePlanSha256 === source.planSha256 &&
    same(row.owner, azureUpgradeBinding(source).owner) &&
    row.checkpointSha256 ===
      canonicalSha256(row.checkpoint), 'public generation receipt schema, owner or digest differs');
  complete(source, row.checkpoint as AzureCeCheckpoint);
  if (load) require(same(await load(source), row.checkpoint), 'saved public generation completion differs');
  const record = object(await store.read(azureNativeReplacementHistoryName(source)));
  require(row.replacementHistorySha256 === canonicalSha256(record) &&
    record.schemaVersion === 1 &&
    record.kind === 'azure-native-replacement-history' &&
    record.engine === 'native' &&
    record.sourcePlanSha256 === source.planSha256 &&
    same(record.owner, azureUpgradeBinding(source).owner), 'immutable replacement history differs');
  if (load) {
    const admission = (await store.read(`native-admission-${source.planSha256}.json`)) as NativeWorkflowCheckpoint;
    validateAzureNativeAdmissionCheckpoint(source, admission);
    require(same(record, {
      schemaVersion: 1,
      kind: 'azure-native-replacement-history',
      engine: 'native',
      owner: azureUpgradeBinding(source).owner,
      sourcePlanSha256: source.planSha256,
      replacement: admission.replacement,
      bootstrappedNodes: Object.keys(admission.bootstrapByNode).sort(),
      launchedAtByNode: admission.launchedAtByNode,
    }), 'live admission differs from immutable completed generation');
  }
  const replacement = record.replacement as NonNullable<NativeWorkflowCheckpoint['replacement']>;
  validateAzureNativeReplacementState(source, replacement);
  require(replacement.status === 'registered' &&
    replacement.networkInventory, 'completed registered generation missing');
  const launched = object(record.launchedAtByNode);
  require(same(record.bootstrappedNodes, [String(replacement.node)]) &&
    Object.keys(launched).join(',') === String(replacement.node) &&
    typeof launched[String(replacement.node)] === 'string' &&
    Number.isFinite(Date.parse(String(launched[String(replacement.node)]))) &&
    Date.parse(String(launched[String(replacement.node)])) <=
      Date.now(), 'completed generation launch boundary differs');
  const final = await readAzureNativeFinalConfiguration(source, replacement.networkInventory, store);
  require(final.receiptSha256 === row.finalConfigurationSha256 &&
    final.siteUid === replacement.siteUid &&
    final.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
    Object.entries(final.instances).every(
      ([node, uuid]) =>
        uuid.toLowerCase() ===
        (node === `${source.deploymentName}-${replacement.node}`
          ? replacement.newVmId
          : replacement.oldVmIds[node]
        )?.toLowerCase(),
    ), 'immutable registered generation configuration differs');
  return { replacement, final, receiptSha256: canonicalSha256(row) };
}

/** Selected-node UUID/owner changes require an explicit ordered completed replacement chain.
 * NIC, IP-configuration, subnet, device/role/MAC and survivor boundaries remain bound to the completed network source.
 */
export async function qualifyAzureNativeNetworkGenerationBoundary(
  network: AzureCePlan,
  originalInventory: AzureNetworkUpdateInventory,
  retainedReplacementSha: string,
  store: Pick<CeDeploymentStore, 'read'>,
  load?: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
) {
  const history = validateAzureNativeNetworkHistory(network, await store.read(azureNativeNetworkHistoryName(network)));
  require(same(
    history.networkUpdate.current.nodes,
    originalInventory.nodes,
  ), 'original completed network inventory differs');
  const networkFinal = await readAzureNativeFinalConfiguration(network, history.networkUpdate.current, store);
  require(networkFinal.receiptSha256 ===
    history.finalConfigurationSha256, 'original network configuration digest differs');
  const chain: AzureCePlan[] = [],
    visited = new Set<string>();
  let digest: string | undefined = retainedReplacementSha;
  while (digest) {
    require(/^[a-f0-9]{64}$/.test(digest) &&
      !visited.has(digest) &&
      digest !== network.planSha256, 'cyclic or unresolved completed generation chain');
    visited.add(digest);
    const source = (await store.read(`native-source-${digest}.json`)) as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planSha256 === digest, 'completed generation source filename differs');
    const profile = verifyAzureNativeNetworkReplacementProfile(source);
    const original = (await store.read(`native-source-${profile.originalPlanSha256}.json`)) as AzureCePlan;
    verifyAzureNativeNetworkReplacementOriginalSource(source, original, network);
    chain.unshift(source);
    digest = profile.schemaVersion === 2 ? profile.retainedReplacementPlanSha256 : undefined;
  }
  const inventory = structuredClone(originalInventory);
  const receipts: string[] = [];
  for (const source of chain) {
    const generation = await readAzureNativeNetworkGenerationCompletion(source, store, load);
    const prior = generation.replacement;
    require(prior.networkSourcePlan &&
      same(prior.networkSourcePlan, network) &&
      prior.networkHistorySha256 === canonicalSha256(history) &&
      prior.siteUid === networkFinal.siteUid &&
      prior.siteConfigurationSha256 === networkFinal.siteConfigurationSha256 &&
      prior.networkInventory &&
      same(prior.networkInventory.nodes, inventory.nodes) &&
      same(prior.retainedNics, azureNativeNetworkReplacementNics(inventory)) &&
      Object.entries(inventory.nodes).every(
        ([index, vm]) =>
          prior.oldVmIds[`${source.deploymentName}-${index}`]?.toLowerCase() === vm.vmId.toLowerCase() &&
          prior.ownerPlanSha256ByNode[`${source.deploymentName}-${index}`] === vm.ownerPlanSha256,
      ), 'complete selected/survivor predecessor inventory differs');
    const selected = inventory.nodes[String(source.intent.replacementNode)];
    require(selected &&
      prior.newVmId &&
      !Object.values(inventory.nodes).some(
        (vm) => vm.vmId.toLowerCase() === prior.newVmId?.toLowerCase(),
      ), 'new generation UUID duplicates a predecessor or survivor');
    selected.vmId = prior.newVmId;
    selected.ownerPlanSha256 = source.planSha256;
    receipts.push(generation.receiptSha256);
  }
  return { inventory, generationPlanSha256s: chain.map((p) => p.planSha256), receiptSha256: canonicalSha256(receipts) };
}
