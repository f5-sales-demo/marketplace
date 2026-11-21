import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { qualifyAzureNativeNetworkGenerationBoundary } from './native-network-generation';
import {
  azureNativeNetworkHistoryName,
  validateAzureNativeNetworkHistory,
  verifyAzureNativeNetworkHistoryBoundary,
} from './native-network-history';
import { azureNativeNetworkScope, verifyAzureNativeNetworkProfile } from './native-network-plan';
import {
  azureNativeNetworkReplacementNics,
  validateAzureNativeNetworkReplacementMetadata,
} from './native-network-replacement-execution';
import { readAzureNativeFinalConfiguration } from './native-registered-configuration';
import type { NativeWorkflowCheckpoint } from './native-workflow';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native network replacement retirement: ${message}`);
};
const same = canonicalEqual;

/** Offline provenance after cloud/site absence. Historical configuration is identity evidence, never link freshness. */
export async function verifyAzureNativeNetworkReplacementRetirementSource(
  plan: AzureCePlan,
  replacement: NonNullable<NativeWorkflowCheckpoint['replacement']>,
  store: Pick<CeDeploymentStore, 'read'>,
): Promise<void> {
  validateAzureNativeNetworkReplacementMetadata(plan, replacement);
  const original = replacement.originalSourcePlan as AzureCePlan,
    network = replacement.networkSourcePlan as AzureCePlan,
    inventory = replacement.networkInventory as NonNullable<typeof replacement.networkInventory>;
  for (const source of [plan, original, network])
    require(same(await store.read(`native-source-${source.planSha256}.json`), source), 'exact saved source differs');
  const history = validateAzureNativeNetworkHistory(network, await store.read(azureNativeNetworkHistoryName(network)));
  const expected =
    plan.networkReplacementProfile?.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            network,
            history.networkUpdate.current,
            plan.networkReplacementProfile.retainedReplacementPlanSha256,
            store,
          )
        ).inventory
      : history.networkUpdate.current;
  require(canonicalSha256(history) === replacement.networkHistorySha256 &&
    same(expected.nodes, inventory.nodes) &&
    history.networkUpdate.source?.originalPlanSha256 ===
      original.planSha256, 'frozen complete network history differs');
  const birth = await readAzureNativeFinalConfiguration(original, inventory, store),
    final = await readAzureNativeFinalConfiguration(network, history.networkUpdate.current, store);
  const reservation = (await store.read('native-site.json')) as Record<string, unknown>;
  require(final.receiptSha256 === history.finalConfigurationSha256 &&
    final.siteUid === replacement.siteUid &&
    birth.siteUid === replacement.siteUid &&
    final.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
    birth.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
    history.networkUpdate.source?.siteUid === replacement.siteUid &&
    history.networkUpdate.source?.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
    reservation.uid === birth.siteUid &&
    reservation.siteName === original.siteName &&
    reservation.contractFingerprint === birth.contractFingerprint &&
    same(reservation.owner, azureUpgradeBinding(original).owner) &&
    Object.entries(final.instances).every(
      ([node, uuid]) =>
        uuid.toLowerCase() ===
        history.networkUpdate.current.nodes[
          String(azureUpgradeBinding(network).nodes.indexOf(node) + 1)
        ].vmId.toLowerCase(),
    ), 'original/network registered configuration or logical site differs');
  if (replacement.status === 'registered') {
    const registered = await readAzureNativeFinalConfiguration(plan, inventory, store);
    const selected = `${plan.deploymentName}-${replacement.node}`;
    require(registered.siteUid === replacement.siteUid &&
      registered.siteConfigurationSha256 === replacement.siteConfigurationSha256 &&
      Object.entries(registered.instances).every(
        ([node, uuid]) =>
          uuid.toLowerCase() === (node === selected ? replacement.newVmId : replacement.oldVmIds[node])?.toLowerCase(),
      ), 'registered selected/survivor generation differs');
  }
}

/** A subnet difference between generations needs an explicit, complete network chain joining both NIC snapshots. */
export async function verifyAzureNativeNetworkReplacementRetirementNicBridge(
  plan: AzureCePlan,
  current: NonNullable<NativeWorkflowCheckpoint['replacement']>,
  priorDigest: string,
  prior: NonNullable<NativeWorkflowCheckpoint['replacement']>,
  records: Map<string, unknown>,
): Promise<void> {
  validateAzureNativeNetworkReplacementMetadata(plan, current);
  const original = current.originalSourcePlan as AzureCePlan;
  let digest = current.networkSourcePlan?.planSha256 as string;
  const visited = new Set<string>();
  const chain: Array<{ source: AzureCePlan; history: ReturnType<typeof validateAzureNativeNetworkHistory> }> = [];
  const store = {
    async read(name: string) {
      require(records.has(name), 'required NIC bridge record is missing');
      return records.get(name);
    },
  };
  while (digest !== original.planSha256) {
    require(!visited.has(digest), 'cyclic NIC bridge history');
    visited.add(digest);
    const source = records.get(`native-source-${digest}.json`) as AzureCePlan;
    require(source, 'NIC bridge source is missing');
    verifyAzureCePlan(source);
    const profile = verifyAzureNativeNetworkProfile(source);
    require(source.planSha256 === digest &&
      profile.originalPlanSha256 === original.planSha256 &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
      same(
        azureNativeNetworkScope(source, true),
        azureNativeNetworkScope(original, true),
      ), 'NIC bridge source scope differs');
    const history = validateAzureNativeNetworkHistory(source, records.get(azureNativeNetworkHistoryName(source)));
    const final = await readAzureNativeFinalConfiguration(source, history.networkUpdate.current, store);
    require(history.networkUpdate.source?.siteUid === current.siteUid &&
      history.networkUpdate.source?.siteConfigurationSha256 === current.siteConfigurationSha256 &&
      final.receiptSha256 === history.finalConfigurationSha256 &&
      final.siteUid === current.siteUid &&
      final.siteConfigurationSha256 === current.siteConfigurationSha256, 'NIC bridge final configuration differs');
    chain.unshift({ source, history });
    digest = profile.retainedPlanSha256;
  }
  const latest = chain.at(-1);
  if (!latest) throw Error('Azure native network replacement retirement: complete NIC bridge is missing');
  const expected =
    plan.networkReplacementProfile?.schemaVersion === 2
      ? (
          await qualifyAzureNativeNetworkGenerationBoundary(
            latest.source,
            latest.history.networkUpdate.current,
            plan.networkReplacementProfile.retainedReplacementPlanSha256,
            store,
          )
        ).inventory
      : latest.history.networkUpdate.current;
  require(canonicalSha256(latest.history) === current.networkHistorySha256 &&
    same(expected.nodes, current.networkInventory?.nodes), 'NIC bridge current endpoint differs');
  // Start at an exact registered predecessor boundary, not a network record that predates that VM generation.
  let start = -1;
  for (const [index, entry] of chain.entries()) {
    const { history } = entry;
    const selected = history.networkUpdate.before.nodes[String(prior.node)];
    if (
      !history.networkUpdate.source?.generationPlanSha256s.includes(priorDigest) ||
      !same(azureNativeNetworkReplacementNics(history.networkUpdate.before), prior.retainedNics) ||
      selected.vmId.toLowerCase() !== prior.newVmId?.toLowerCase() ||
      selected.ownerPlanSha256 !== priorDigest
    )
      continue;
    const exactSurvivors = azureUpgradeBinding(original).nodes.every(
      (node, position) =>
        position + 1 === prior.node ||
        (history.networkUpdate.before.nodes[String(position + 1)].vmId.toLowerCase() ===
          prior.oldVmIds[node]?.toLowerCase() &&
          history.networkUpdate.before.nodes[String(position + 1)].ownerPlanSha256 ===
            prior.ownerPlanSha256ByNode[node]),
    );
    if (exactSurvivors) {
      start = index;
      break;
    }
    const profile = verifyAzureNativeNetworkProfile(entry.source),
      predecessor = chain[index - 1];
    if (profile.schemaVersion !== 2 || !predecessor) continue;
    const generations = await qualifyAzureNativeNetworkGenerationBoundary(
      predecessor.source,
      predecessor.history.networkUpdate.current,
      profile.retainedReplacementPlanSha256,
      store,
    );
    require(generations.generationPlanSha256s.includes(
      priorDigest,
    ), 'NIC bridge lacks completed survivor generation lineage');
    verifyAzureNativeNetworkHistoryBoundary(generations.inventory, history.networkUpdate.before);
    start = index;
    break;
  }
  require(start >= 0, 'NIC bridge lacks exact registered predecessor generation');
  for (let index = start + 1; index < chain.length; index++) {
    const previous = chain[index - 1],
      entry = chain[index],
      binding = verifyAzureNativeNetworkProfile(entry.source);
    const boundary =
      binding.schemaVersion === 2
        ? (
            await qualifyAzureNativeNetworkGenerationBoundary(
              previous.source,
              previous.history.networkUpdate.current,
              binding.retainedReplacementPlanSha256,
              store,
            )
          ).inventory
        : previous.history.networkUpdate.current;
    verifyAzureNativeNetworkHistoryBoundary(boundary, entry.history.networkUpdate.before);
  }
}
