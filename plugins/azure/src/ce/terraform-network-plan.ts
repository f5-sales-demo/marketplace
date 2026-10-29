import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

/** Planning identity only. Execution must authenticate the exact completed predecessor and its
 * private source, cloud/output identity and operational history before any provider mutation.
 */
export interface AzureTerraformNetworkProfile {
  schemaVersion: 1;
  kind: 'azure-terraform-network-generation';
  originalPlanSha256: string;
  retainedPlanSha256: string;
}
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network plan: ${message}`);
}
const same = canonicalEqual;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Explicitly permit subnet selection changes while retaining all other CE/provider intent. */
export function azureTerraformNetworkScope(plan: AzureCePlan, permitSubnetChange: boolean) {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  const nicScope = (nic: Record<string, unknown>) => {
    const { subnet: _subnet, ...rest } = nic;
    return permitSubnetChange ? rest : nic;
  };
  return {
    intent: { ...intent, nics: nics.map((nic) => nicScope(nic as unknown as Record<string, unknown>)) },
    image,
    subscription: plan.subscription,
    namespace: plan.namespace,
    securityRules: plan.securityRules,
    topology: plan.topology,
    nics: plan.nics.map((nic) => nicScope(nic as unknown as Record<string, unknown>)),
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}

/** Structural integrity only, separately dispatched from the native network profile. */
export function verifyAzureTerraformNetworkProfile(plan: AzureCePlan): AzureTerraformNetworkProfile {
  const profile = plan.terraformNetworkProfile;
  require(profile &&
    typeof profile === 'object' &&
    !Array.isArray(profile) &&
    Object.keys(profile).sort().join(',') === 'kind,originalPlanSha256,retainedPlanSha256,schemaVersion' &&
    profile.schemaVersion === 1 &&
    profile.kind === 'azure-terraform-network-generation' &&
    same(
      plan.nics,
      plan.intent.nics.map((nic, index) => ({ ...nic, index })),
    ) &&
    plan.engine === 'terraform' &&
    plan.intent.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    !plan.relayProfile &&
    !plan.networkProfile &&
    !plan.networkReplacementProfile &&
    !plan.terraformNetworkReplacementProfile &&
    sha(profile.originalPlanSha256) &&
    sha(profile.retainedPlanSha256) &&
    profile.originalPlanSha256 !== plan.planSha256 &&
    profile.retainedPlanSha256 !==
      plan.planSha256, 'exact original and explicit preceding Terraform generation required');
  return profile;
}

/** Bind a first or repeated network plan to its explicit predecessor. An initial replacement may
 * retain original creation scope; replacements after network changes require their own contract.
 * A repeated target receives a distinct digest through the ordered predecessor, never a timestamp.
 */
export function compileAzureTerraformNetworkUpdatePlan(
  base: AzureCePlan,
  retained: AzureCePlan,
  original: AzureCePlan = retained,
): AzureCePlan {
  for (const source of [base, retained, original]) verifyAzureCePlan(source);
  require(base.engine === 'terraform' &&
    base.intent.operation === 'update-network' &&
    !base.terraformNetworkProfile &&
    !base.terraformNetworkReplacementProfile &&
    !base.networkProfile &&
    !base.networkReplacementProfile &&
    !base.relayProfile &&
    original.engine === 'terraform' &&
    original.intent.operation === 'deploy' &&
    !original.terraformNetworkProfile &&
    !original.terraformNetworkReplacementProfile &&
    !original.networkProfile &&
    !original.networkReplacementProfile &&
    !original.relayProfile &&
    retained.engine === 'terraform' &&
    !retained.networkProfile &&
    !retained.networkReplacementProfile &&
    !retained.relayProfile &&
    same(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
    same(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
    same(azureTerraformNetworkScope(base, true), azureTerraformNetworkScope(original, true)) &&
    same(
      azureTerraformNetworkScope(retained, true),
      azureTerraformNetworkScope(original, true),
    ), 'creation scope differs beyond permitted subnet changes');
  if (retained.intent.operation === 'update-network') {
    require(verifyAzureTerraformNetworkProfile(retained).originalPlanSha256 ===
      original.planSha256, 'retained network original differs');
  } else if (retained.terraformNetworkReplacementProfile) {
    require(verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256 ===
      original.planSha256, 'retained replacement original differs');
  } else if (retained.intent.operation === 'replace-node') {
    require(!retained.terraformNetworkProfile &&
      !retained.terraformNetworkReplacementProfile &&
      Number.isInteger(retained.intent.replacementNode) &&
      (retained.intent.replacementNode as number) >= 1 &&
      (retained.intent.replacementNode as number) <= retained.topology.nodeCount &&
      same(
        azureTerraformNetworkScope(retained, false),
        azureTerraformNetworkScope(original, false),
      ), 'initial replacement must retain original subnet scope');
  } else {
    require(retained.intent.operation === 'deploy' &&
      same(retained, original), 'retained source must be exact creation or explicit network/replacement predecessor');
  }
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(base);
  draft.terraformNetworkProfile = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-generation',
    originalPlanSha256: original.planSha256,
    retainedPlanSha256: retained.planSha256,
  };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkProfile(plan);
  return plan;
}
