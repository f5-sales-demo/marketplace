import type { authorizeGcpByolTerms } from './byol-terms';
import { GCP_CE_API_RELEASE } from './contract';
import { assertGcpCorporateFundingCurrent, type GcpCorporateFundingReceipt } from './corporate-funding';
import { fingerprint } from './discovery';
import type { GcpPolicyReceipt } from './policy';
import type { GcpLaunchPreflight } from './preflight';
import { GCP_CE_POLICY, type GcpCeDiscovery, type GcpCeIntent, type GcpCePlan } from './types';
import { validateIntent } from './validation';

export function planGcpCe(
  intent: GcpCeIntent,
  discovery: GcpCeDiscovery,
  now = Date.now(),
  policyReceipt?: GcpPolicyReceipt,
  preflight?: GcpLaunchPreflight,
  fundingReceipt?: GcpCorporateFundingReceipt,
  byolAuthorization?: Awaited<ReturnType<typeof authorizeGcpByolTerms>>,
): GcpCePlan {
  validateIntent(intent);
  if (fundingReceipt)
    assertGcpCorporateFundingCurrent(fundingReceipt, intent.project, fundingReceipt.billingAccountName);
  if (byolAuthorization) {
    const { authorizationHash, ...authorizationBody } = byolAuthorization;
    if (
      authorizationHash !== fingerprint(authorizationBody) ||
      byolAuthorization.state !== 'authorized-for-access-or-use' ||
      byolAuthorization.binding.intentFingerprint !== fingerprint(intent) ||
      !fundingReceipt ||
      byolAuthorization.fundingPolicySha256 !== fundingReceipt.policySha256 ||
      byolAuthorization.billingAccountName !== fundingReceipt.billingAccountName
    )
      throw new Error('BYOL authorization does not match readiness intent/funding');
  }
  if (discovery.schemaVersion !== 1 || discovery.project !== intent.project || discovery.region !== intent.region)
    throw new Error('Discovery scope does not match the intent');
  const observed = Date.parse(discovery.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > 5 * 60_000)
    throw new Error('Discovery is stale');
  if (!discovery.images.some((image) => fingerprint(image) === fingerprint(intent.image)))
    throw new Error('Exact image and license identity is not present in discovery');
  if (preflight) {
    const timestamp = Date.parse(preflight.observedAt);
    if (
      preflight.schemaVersion !== 1 ||
      preflight.project !== intent.project ||
      preflight.region !== intent.region ||
      preflight.intentFingerprint !== fingerprint(intent) ||
      !Number.isFinite(timestamp) ||
      timestamp > now ||
      now - timestamp > 5 * 60_000
    )
      throw new Error('Preflight scope/intent differs or evidence is stale');
  }
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const machine = discovery.machineTypes.find((m) => m.name === intent.machineType && m.zone === node.zone);
      if (
        !machine ||
        !Number.isFinite(machine.guestCpus) ||
        machine.guestCpus < 8 ||
        !Number.isFinite(machine.memoryMb) ||
        machine.memoryMb < 32 * 1024
      )
        throw new Error('Every node requires an observed machine with at least 8 vCPUs and 32 GiB RAM');
    }
  const unavailable = [
    'gcp_executable_api_mapping_not_qualified',
    ...(policyReceipt ? [] : ['current_policy_release_not_bound']),
    'shared_platform_gcp_runtime_not_available',
    ...(intent.engine === 'terraform' ? ['shared_terraform_gcp_runner_not_available'] : []),
    ...(discovery.billingEnabled !== true ? ['billing_not_verified'] : []),
    ...(fundingReceipt ? [] : ['corporate_funding_not_verified']),
    ...['compute.googleapis.com', 'serviceusage.googleapis.com']
      .filter((api) => !discovery.enabledApis.includes(api))
      .map((api) => `api_not_enabled:${api}`),
    ...(preflight
      ? [
          ...(['iam', 'organizationPolicy', 'machineNicLimit', 'image', 'zone'] as const)
            .filter((check) => preflight.checks[check] !== 'verified')
            .map((check) => `${check}_not_verified`),
          ...(preflight.checks.quota === 'verified' ? [] : ['quota_headroom_not_qualified']),
          ...(byolAuthorization ? [] : ['licenseAcceptance_not_verified']),
          'zone_capacity_not_reserved',
        ]
      : [...Object.keys(discovery.checks).map((check) => `${check}_not_verified`), 'quota_headroom_not_qualified']),
    'routing_and_return_path_not_qualified',
  ];
  const body = {
    schemaVersion: 1 as const,
    policyIdentity: GCP_CE_POLICY,
    ...(policyReceipt ? { policyReceipt } : {}),
    ...(preflight ? { preflight: structuredClone(preflight) } : {}),
    ...(fundingReceipt ? { fundingReceipt: structuredClone(fundingReceipt) } : {}),
    ...(byolAuthorization ? { byolAuthorization: structuredClone(byolAuthorization) } : {}),
    apiRelease: GCP_CE_API_RELEASE,
    engine: intent.engine,
    intent: structuredClone(intent),
    discoveryFingerprint: fingerprint(discovery),
    executable: false as const,
    unavailable,
    actions: [] as [],
    approval: 'not-requested' as const,
  };
  return { ...body, planHash: fingerprint(body) };
}
