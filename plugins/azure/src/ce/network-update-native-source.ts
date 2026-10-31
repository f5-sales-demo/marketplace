import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { readAzureNativeNetworkGenerationCompletion } from './native-network-generation';
import { qualifyAzureNativeNetworkHistories } from './native-network-history';
import { azureNativeNetworkScope as scope, verifyAzureNativeNetworkProfile } from './native-network-plan';
import { verifyAzureNativeNetworkReplacementOriginalSource } from './native-network-replacement';
import { readAzureNativeFinalConfiguration as finalHealth } from './native-registered-configuration';
import { type NativeWorkflowCheckpoint, validateAzureNativeAdmissionCheckpoint } from './native-workflow';
import type { AzureNativeNetworkUpdateSource, AzureNetworkUpdateInventory } from './network-update';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeCheckpoint, AzureCePlan } from './types';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native network source: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed provenance record');
  return value as Record<string, unknown>;
};
const same = canonicalEqual;
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

/** Qualify completed creation and all prior VM generations before accepting cloud tags as execution provenance. */
export async function qualifyAzureNativeNetworkUpdateSource(
  plan: AzureCePlan,
  before: AzureNetworkUpdateInventory,
  store: Pick<CeDeploymentStore, 'read' | 'verify'>,
  load: (source: AzureCePlan) => Promise<AzureCeCheckpoint | undefined>,
): Promise<AzureNativeNetworkUpdateSource> {
  verifyAzureCePlan(plan);
  await store.verify();
  require(plan.engine === 'native' &&
    !plan.relayProfile &&
    plan.intent.operation === 'update-network', 'owned native network plan required');
  const profile = verifyAzureNativeNetworkProfile(plan);
  const owners = new Set(
    Object.values(before.nodes).flatMap((node) => Object.values(node.nics).map((nic) => nic.ownerPlanSha256)),
  );
  require(owners.size === 1, 'retained NICs do not identify one original creation');
  const digest = [...owners][0],
    original = (await store.read(`native-source-${digest}.json`)) as AzureCePlan;
  verifyAzureCePlan(original);
  require(profile.originalPlanSha256 === digest &&
    original.planSha256 === digest &&
    original.intent.operation === 'deploy' &&
    original.engine === 'native' &&
    !original.relayProfile &&
    same(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
    same(scope(plan, true), scope(original, true)), 'original creation scope differs beyond permitted subnets');
  const site = object(await store.read('native-site.json'));
  const generations = new Set<string>(),
    boundaries = new Map<string, string>();
  const readSource = async (sha: string) => {
    const source = (await store.read(`native-source-${sha}.json`)) as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planSha256 === sha &&
      source.engine === 'native' &&
      !source.relayProfile &&
      (source.networkReplacementProfile
        ? same(scope(source, true), scope(original, true))
        : same(scope(source, false), scope(original, false))) &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(original)), 'prior generation source scope differs');
    if (source.networkReplacementProfile) {
      const network = (await store.read(
        `native-source-${source.networkReplacementProfile.retainedNetworkPlanSha256}.json`,
      )) as AzureCePlan;
      verifyAzureNativeNetworkReplacementOriginalSource(source, original, network);
      await readAzureNativeNetworkGenerationCompletion(source, store, load);
    }
    const publicCheckpoint = await load(source);
    require(publicCheckpoint?.state === 'complete' &&
      !publicCheckpoint.pendingAction &&
      same(
        publicCheckpoint.completedActionIds,
        source.actions.map((action) => action.id),
      ), 'prior generation public execution is incomplete');
    const admission = (await store.read(`native-admission-${sha}.json`)) as NativeWorkflowCheckpoint;
    validateAzureNativeAdmissionCheckpoint(source, admission);
    const expected =
      source.intent.operation === 'deploy'
        ? binding.nodes.map((_, index) => String(index + 1))
        : [String(source.intent.replacementNode)];
    require(admission.siteReserved === (source.intent.operation === 'deploy') &&
      same(Object.keys(admission.bootstrapByNode).sort(), expected.toSorted()) &&
      same(Object.keys(admission.launchedAtByNode).sort(), expected.toSorted()) &&
      Object.values(admission.launchedAtByNode).every(
        (at) => Date.parse(at) <= Date.now(),
      ), 'prior generation admission is incomplete');
    generations.add(sha);
    return { source, admission, health: await finalHealth(source, before, store) };
  };
  const binding = azureUpgradeBinding(original),
    birth = await readSource(digest);
  require(site.siteName === original.siteName &&
    site.uid === birth.health.siteUid &&
    same(site.owner, binding.owner) &&
    site.contractFingerprint === birth.health.contractFingerprint, 'original reservation identity differs');
  const histories = await qualifyAzureNativeNetworkHistories(plan, before, original, store, load, {
    siteUid: birth.health.siteUid,
    siteConfigurationSha256: birth.health.siteConfigurationSha256,
  });
  const visit = async (sha: string, node: string, vmId: string, path: Set<string>): Promise<void> => {
    require(/^[a-f0-9]{64}$/.test(sha) && !path.has(sha), 'cyclic or unresolved VM generation');
    const key = `${sha}:${node}`;
    require(!boundaries.has(key) || boundaries.get(key) === lower(vmId), 'inconsistent predecessor UUID');
    boundaries.set(key, lower(vmId));
    const generation = sha === digest ? birth : await readSource(sha);
    require(lower(generation.health.instances[node]) === lower(vmId) &&
      generation.health.siteUid === birth.health.siteUid &&
      generation.health.siteConfigurationSha256 ===
        birth.health.siteConfigurationSha256, 'historical UUID or site configuration differs');
    if (sha === digest) return;
    const prior = generation.admission.replacement;
    require(generation.source.intent.operation === 'replace-node' &&
      prior?.status === 'registered' &&
      same(prior.originalSourcePlan, original) &&
      prior.siteUid === birth.health.siteUid &&
      prior.siteConfigurationSha256 === birth.health.siteConfigurationSha256 &&
      generation.source.intent.replacementNode === binding.nodes.indexOf(node) + 1 &&
      lower(prior.newVmId) === lower(vmId), 'prior replacement registration differs');
    for (const name of binding.nodes) {
      if (name !== node)
        require(lower(generation.health.instances[name]) ===
          lower(prior?.oldVmIds[name]), 'replacement survivor UUID differs');
      await visit(
        prior?.ownerPlanSha256ByNode[name] as string,
        name,
        prior?.oldVmIds[name] as string,
        new Set([...path, sha]),
      );
    }
  };
  for (const [index, node] of binding.nodes.entries()) {
    const vm = before.nodes[String(index + 1)];
    await visit(vm.ownerPlanSha256, node, vm.vmId, new Set());
    for (const nic of original.nics) {
      const saved = histories.originalBoundary.nodes[String(index + 1)].nics[String(nic.index)],
        subnet =
          nic.subnet.resourceId ??
          `/subscriptions/${original.subscription.id}/resourceGroups/${original.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${original.deploymentName}-vnet/subnets/${nic.subnet.name}`;
      require(lower(saved.subnetId) === lower(subnet) &&
        (!nic.subnet.cidr ||
          saved.subnetCidr ===
            nic.subnet.cidr), 'preceding network change requires completed network-history provenance');
    }
  }
  return {
    originalPlanSha256: digest,
    siteUid: birth.health.siteUid,
    siteConfigurationSha256: birth.health.siteConfigurationSha256,
    generationPlanSha256s: [...generations].sort(),
    networkHistoryPlanSha256s: histories.planSha256s,
  };
}

/** Reobserve the owned logical site at every interruption/recovery boundary, including completed replay. */
export async function verifyAzureNativeNetworkUpdateSite(
  plan: AzureCePlan,
  source: AzureNativeNetworkUpdateSource,
  runtime: Pick<CeRuntime, 'observeOwnedSite' | 'ownedSiteConfiguration'>,
  signal?: AbortSignal,
): Promise<void> {
  const binding = azureUpgradeBinding(plan),
    site = await runtime.observeOwnedSite(binding, signal);
  require(object(site.system_metadata).uid === source.siteUid &&
    canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) ===
      source.siteConfigurationSha256, 'owned logical-site identity or configuration changed');
}
