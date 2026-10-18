import { GCP_CE_API_RELEASE } from './contract';
import { fingerprint } from './discovery';
import type { GcpPolicyReceipt } from './policy';
import { GCP_CE_POLICY, type GcpCeDiscovery, type GcpCeIntent, type GcpCePlan } from './types';
import { validateIntent } from './validation';

export function planGcpCe(
  intent: GcpCeIntent,
  discovery: GcpCeDiscovery,
  now = Date.now(),
  policyReceipt?: GcpPolicyReceipt,
): GcpCePlan {
  validateIntent(intent);
  if (discovery.schemaVersion !== 1 || discovery.project !== intent.project || discovery.region !== intent.region)
    throw new Error('Discovery scope does not match the intent');
  const observed = Date.parse(discovery.observedAt);
  if (!Number.isFinite(observed) || observed > now || now - observed > 5 * 60_000)
    throw new Error('Discovery is stale');
  if (!discovery.images.some((image) => fingerprint(image) === fingerprint(intent.image)))
    throw new Error('Exact image and license identity is not present in discovery');
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
    ...['compute.googleapis.com', 'serviceusage.googleapis.com']
      .filter((api) => !discovery.enabledApis.includes(api))
      .map((api) => `api_not_enabled:${api}`),
    ...Object.keys(discovery.checks).map((check) => `${check}_not_verified`),
    'quota_headroom_not_qualified',
    'routing_and_return_path_not_qualified',
  ];
  const body = {
    schemaVersion: 1 as const,
    policyIdentity: GCP_CE_POLICY,
    ...(policyReceipt ? { policyReceipt } : {}),
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
