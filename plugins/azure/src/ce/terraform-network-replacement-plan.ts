import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureTerraformNetworkScope, verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Identity binding only. The owning executor must authenticate completed predecessor source,
 * full retained NIC state and replacement completion before enrollment or mutation.
 */
export interface AzureTerraformNetworkReplacementProfile {
  schemaVersion: 1;
  kind: 'azure-terraform-network-bound-replacement';
  originalPlanSha256: string;
  retainedPlanSha256: string;
}
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network replacement plan: ${message}`);
}
export function verifyAzureTerraformNetworkReplacementProfile(
  plan: AzureCePlan,
): AzureTerraformNetworkReplacementProfile {
  const profile = plan.terraformNetworkReplacementProfile;
  require(profile &&
    typeof profile === 'object' &&
    !Array.isArray(profile) &&
    Object.keys(profile).sort().join(',') === 'kind,originalPlanSha256,retainedPlanSha256,schemaVersion' &&
    profile.schemaVersion === 1 &&
    profile.kind === 'azure-terraform-network-bound-replacement' &&
    sha(profile.originalPlanSha256) &&
    sha(profile.retainedPlanSha256) &&
    new Set([profile.originalPlanSha256, profile.retainedPlanSha256, plan.planSha256]).size === 3 &&
    plan.engine === 'terraform' &&
    plan.intent.engine === 'terraform' &&
    plan.intent.operation === 'replace-node' &&
    Number.isInteger(plan.intent.replacementNode) &&
    Number(plan.intent.replacementNode) >= 1 &&
    Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
    !plan.relayProfile &&
    !plan.networkProfile &&
    !plan.networkReplacementProfile &&
    !plan.terraformNetworkProfile &&
    same(
      plan.nics,
      plan.intent.nics.map((nic, index) => ({ ...nic, index })),
    ), 'exact original and preceding Terraform generation with one selected node required');
  return profile;
}
export function compileAzureTerraformNetworkReplacementPlan(
  base: AzureCePlan,
  retained: AzureCePlan,
  original: AzureCePlan,
): AzureCePlan {
  for (const p of [base, retained, original]) verifyAzureCePlan(p);
  require(base.engine === 'terraform' &&
    base.intent.operation === 'replace-node' &&
    !base.relayProfile &&
    !base.networkProfile &&
    !base.networkReplacementProfile &&
    !base.terraformNetworkProfile &&
    !base.terraformNetworkReplacementProfile &&
    original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    !original.relayProfile &&
    retained.engine === 'terraform' &&
    !retained.relayProfile &&
    !retained.networkProfile &&
    !retained.networkReplacementProfile &&
    same(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
    same(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
    same(azureTerraformNetworkScope(base, true), azureTerraformNetworkScope(original, true)) &&
    same(azureTerraformNetworkScope(retained, true), azureTerraformNetworkScope(original, true)) &&
    same(
      azureTerraformNetworkScope(base, false),
      azureTerraformNetworkScope(retained, false),
    ), 'exact retained subnet configuration and original CE/provider scope required');
  const retainedOriginal =
    retained.intent.operation === 'update-network'
      ? verifyAzureTerraformNetworkProfile(retained).originalPlanSha256
      : verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256;
  require(retainedOriginal === original.planSha256, 'retained original identity differs');
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  draft.terraformNetworkReplacementProfile = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-bound-replacement',
    originalPlanSha256: original.planSha256,
    retainedPlanSha256: retained.planSha256,
  };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  return plan;
}
