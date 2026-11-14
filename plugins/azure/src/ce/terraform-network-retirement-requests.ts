import { readAzureCePlanInventory, type SessionManagerLike, verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { azureTerraformNetworkScope, verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network retirement requests: ${message}`);
}
/** Discover every selected deployment's public network request, including requests without stages.
 * Exact planning ancestry does not establish submission, completion, cancellation or retirement.
 * The next custody reader must authenticate actual outcomes and main/child journals for every row.
 * This reader performs no storage/cloud mutation and never authorizes destructive cleanup.
 */
export async function readAzureTerraformNetworkRetirementRequests(
  originalRequest: AzureCePlan,
  session: SessionManagerLike,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const original = structuredClone(originalRequest);
  verifyAzureCePlan(original);
  require(original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    !original.terraformNetworkProfile &&
    !original.terraformNetworkReplacementProfile &&
    !original.relayProfile, 'exact original Terraform deploy required');
  const binding = azureUpgradeBinding(original);
  const inventory = await readAzureCePlanInventory(session, signal);
  const plans = new Map(inventory.plans.map(({ plan }) => [plan.planSha256, plan]));
  require(same(
    plans.get(original.planSha256) ?? null,
    original,
  ), 'original deploy missing or changed in public plan inventory');
  const selected = inventory.plans
    .map(({ plan }) => plan)
    .filter((plan) => {
      const profile = plan.terraformNetworkProfile ?? plan.terraformNetworkReplacementProfile;
      const ownerMatches = same(azureUpgradeBinding(plan).owner, binding.owner);
      if (profile?.originalPlanSha256 === original.planSha256 || (ownerMatches && profile)) {
        require(profile?.originalPlanSha256 === original.planSha256 &&
          same(azureUpgradeBinding(plan), binding), 'network request original lineage or owner differs');
        return true;
      }
      require(!(
        ownerMatches &&
        plan.engine === 'terraform' &&
        plan.intent.operation === 'update-network'
      ), 'network execution identifiers unresolved');
      return false;
    });
  const profileOf = (plan: AzureCePlan) =>
    plan.terraformNetworkProfile
      ? verifyAzureTerraformNetworkProfile(plan)
      : verifyAzureTerraformNetworkReplacementProfile(plan);
  const ancestry = (plan: AzureCePlan, seen = new Set<string>()): string[] => {
    require(!seen.has(plan.planSha256), 'cyclic network ancestry');
    seen.add(plan.planSha256);
    const profile = profileOf(plan),
      retained = plans.get(profile.retainedPlanSha256);
    require(retained &&
      same(azureUpgradeBinding(retained), binding) &&
      same(azureTerraformNetworkScope(plan, true), azureTerraformNetworkScope(original, true)) &&
      same(
        azureTerraformNetworkScope(retained, true),
        azureTerraformNetworkScope(original, true),
      ), 'exact retained predecessor or original provider scope unavailable');
    if (plan.terraformNetworkReplacementProfile)
      require(same(
        azureTerraformNetworkScope(plan, false),
        azureTerraformNetworkScope(retained, false),
      ), 'replacement retained subnet scope differs');
    if (retained.planSha256 === original.planSha256) {
      require(!plan.terraformNetworkReplacementProfile, 'network-bound replacement requires preceding generation');
      return [original.planSha256];
    }
    if (retained.terraformNetworkProfile || retained.terraformNetworkReplacementProfile) {
      require(profileOf(retained).originalPlanSha256 === original.planSha256, 'retained original differs');
      return [...ancestry(retained, seen), retained.planSha256];
    }
    require(!plan.terraformNetworkReplacementProfile &&
      retained.engine === 'terraform' &&
      retained.intent.operation === 'replace-node' &&
      Number.isInteger(retained.intent.replacementNode) &&
      Number(retained.intent.replacementNode) >= 1 &&
      Number(retained.intent.replacementNode) <= original.topology.nodeCount &&
      !retained.networkProfile &&
      !retained.networkReplacementProfile &&
      !retained.relayProfile &&
      same(
        azureTerraformNetworkScope(retained, false),
        azureTerraformNetworkScope(original, false),
      ), 'initial replacement predecessor is unresolved');
    return [original.planSha256, retained.planSha256];
  };
  const requests = selected.map((plan) => ({
    kind: plan.terraformNetworkProfile ? ('network-update' as const) : ('node-replacement' as const),
    planId: plan.planId,
    planSha256: plan.planSha256,
    retainedPlanSha256: profileOf(plan).retainedPlanSha256,
    ancestry: ancestry(plan),
    execution: 'unclassified' as const,
  }));
  const recheck = async () => {
    signal?.throwIfAborted();
    require(same(originalRequest, original), 'original request changed');
    await inventory.recheck();
    require(same(originalRequest, original), 'original request changed');
  };
  await recheck();
  return {
    schemaVersion: 1 as const,
    originalPlanSha256: original.planSha256,
    owner: structuredClone(binding.owner),
    requests,
    publicPlanInventorySha256: inventory.sourceSha256,
    requestInventorySha256: canonicalSha256({
      originalPlanSha256: original.planSha256,
      publicPlanInventorySha256: inventory.sourceSha256,
      requests,
    }),
    executionHistoryQualified: false as const,
    parentRetirementQualified: false as const,
    recheck,
  };
}
