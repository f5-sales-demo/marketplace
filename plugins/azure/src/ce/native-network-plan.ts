import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { verifyAzureNativeNetworkReplacementProfile } from './native-network-replacement';
import { verifyAzureForwardingPredecessor } from './network-forwarding-expectations';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export type AzureNativeNetworkProfile =
  | {
      schemaVersion: 1;
      originalPlanSha256: string;
      retainedPlanSha256: string;
    }
  | {
      schemaVersion: 2;
      originalPlanSha256: string;
      retainedPlanSha256: string;
      retainedReplacementPlanSha256: string;
    };
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native network plan: ${message}`);
};
const same = canonicalEqual;

/** Compare only explicitly permitted subnet changes; retain all other CE intent and provider scope. */
export function azureNativeNetworkScope(plan: AzureCePlan, permitSubnetChange: boolean) {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  // Route expectations select read-only comparisons; they do not alter provider configuration.
  const { forwardingRoutes: _forwarding, ...configurationRouting } = plan.routing;
  const { forwardingRoutes: _intentForwarding, ...configurationIntentRouting } = intent.routing;
  const nicScope = (nic: Record<string, unknown>) => {
    const { subnet: _subnet, ...rest } = nic;
    return permitSubnetChange ? rest : nic;
  };
  return {
    intent: {
      ...intent,
      routing: permitSubnetChange ? configurationIntentRouting : intent.routing,
      nics: nics.map((nic) => nicScope(nic as unknown as Record<string, unknown>)),
    },
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics.map((nic) => nicScope(nic as unknown as Record<string, unknown>)),
    vm: plan.vm,
    routing: permitSubnetChange ? configurationRouting : plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}

/** Structural integrity only. Execution separately requires owned sources and completed public history. */
export function verifyAzureNativeNetworkProfile(plan: AzureCePlan): AzureNativeNetworkProfile {
  const profile = plan.networkProfile;
  require(profile &&
    typeof profile === 'object' &&
    !Array.isArray(profile) &&
    ((profile.schemaVersion === 1 &&
      Object.keys(profile).sort().join(',') === 'originalPlanSha256,retainedPlanSha256,schemaVersion') ||
      (profile.schemaVersion === 2 &&
        Object.keys(profile).sort().join(',') ===
          'originalPlanSha256,retainedPlanSha256,retainedReplacementPlanSha256,schemaVersion' &&
        /^[a-f0-9]{64}$/.test(profile.retainedReplacementPlanSha256) &&
        ![profile.originalPlanSha256, profile.retainedPlanSha256, plan.planSha256].includes(
          profile.retainedReplacementPlanSha256,
        ))) &&
    plan.engine === 'native' &&
    !plan.relayProfile &&
    plan.intent.operation === 'update-network' &&
    /^[a-f0-9]{64}$/.test(profile.originalPlanSha256) &&
    /^[a-f0-9]{64}$/.test(profile.retainedPlanSha256) &&
    profile.originalPlanSha256 !== plan.planSha256 &&
    profile.retainedPlanSha256 !== plan.planSha256, 'exact original and preceding deployment identities required');
  return profile as AzureNativeNetworkProfile;
}

/** Bind an immutable network intent to an explicit predecessor, including repeated A -> B -> A -> B changes. */
export function compileAzureNativeNetworkUpdatePlan(
  base: AzureCePlan,
  retained: AzureCePlan,
  original: AzureCePlan = retained,
): AzureCePlan {
  for (const source of [base, retained, original]) verifyAzureCePlan(source);
  require(base.intent.operation === 'update-network' &&
    !base.networkProfile &&
    base.engine === 'native' &&
    !base.relayProfile &&
    original.engine === 'native' &&
    !original.relayProfile &&
    original.intent.operation === 'deploy' &&
    retained.engine === 'native' &&
    !retained.relayProfile &&
    same(azureUpgradeBinding(base), azureUpgradeBinding(original)) &&
    same(azureUpgradeBinding(retained), azureUpgradeBinding(original)) &&
    same(azureNativeNetworkScope(base, true), azureNativeNetworkScope(original, true)) &&
    same(
      azureNativeNetworkScope(retained, true),
      azureNativeNetworkScope(original, true),
    ), 'retained creation/network scope differs');
  verifyAzureForwardingPredecessor(base, retained);
  if (retained.intent.operation === 'update-network')
    require(verifyAzureNativeNetworkProfile(retained).originalPlanSha256 ===
      original.planSha256, 'retained network original source differs');
  else if (retained.networkReplacementProfile)
    require(verifyAzureNativeNetworkReplacementProfile(retained).originalPlanSha256 ===
      original.planSha256, 'retained replacement original differs');
  else
    require(retained.intent.operation === 'deploy' &&
      same(retained, original), 'retained source must be the original creation or a network deployment');
  const { planId: _planId, planSha256: _planSha256, ...draft } = structuredClone(base);
  draft.networkProfile = retained.networkReplacementProfile
    ? {
        schemaVersion: 2,
        originalPlanSha256: original.planSha256,
        retainedPlanSha256: retained.networkReplacementProfile.retainedNetworkPlanSha256,
        retainedReplacementPlanSha256: retained.planSha256,
      }
    : { schemaVersion: 1, originalPlanSha256: original.planSha256, retainedPlanSha256: retained.planSha256 };
  const digest = canonicalSha256(draft);
  const plan = { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
  verifyAzureCePlan(plan);
  return plan;
}
