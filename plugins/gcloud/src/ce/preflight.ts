import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

export const GCP_CREATE_PERMISSIONS = [
  'compute.instances.create',
  'compute.instances.delete',
  'compute.instances.get',
  'compute.instances.setMetadata',
  'compute.instances.setLabels',
  'compute.instances.setTags',
  'compute.disks.create',
  'compute.disks.delete',
  'compute.disks.get',
  'compute.disks.use',
  'compute.images.useReadOnly',
  'compute.networks.create',
  'compute.networks.delete',
  'compute.networks.get',
  'compute.networks.use',
  'compute.subnetworks.create',
  'compute.subnetworks.delete',
  'compute.subnetworks.get',
  'compute.subnetworks.use',
  'compute.subnetworks.useExternalIp',
  'compute.zoneOperations.get',
  'compute.globalOperations.get',
  'compute.regionOperations.get',
  'compute.machineTypes.get',
  'compute.regions.get',
  'compute.zones.get',
] as const;
export interface GcpPreflightPort {
  query(path: string, body?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  policy(project: string, constraint: string, signal?: AbortSignal): Promise<unknown>;
}
type Gate = 'verified' | 'unavailable';
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed preflight source');
  return value as Record<string, unknown>;
}
function quota(value: unknown, metric: string, required: number): boolean {
  const rows = object(value).quotas;
  if (!Array.isArray(rows)) return false;
  const matches = rows.map(object).filter((row) => row.metric === metric);
  return (
    matches.length === 1 &&
    typeof matches[0].limit === 'number' &&
    typeof matches[0].usage === 'number' &&
    Number.isFinite(matches[0].limit) &&
    Number.isFinite(matches[0].usage) &&
    matches[0].usage >= 0 &&
    matches[0].limit - matches[0].usage >= required
  );
}
function unconditional(value: unknown, field: string, expected: boolean): boolean {
  const spec = object(object(value).spec),
    rules = spec.rules;
  return (
    !spec.reset &&
    Array.isArray(rules) &&
    rules.length === 1 &&
    !object(rules[0]).condition &&
    object(rules[0])[field] === expected
  );
}
/** Read-only collection supports candidate topology; executable admission remains contract-bound. */
export function supportsGcpLaunchPreflight(intent: GcpCeIntent): boolean {
  return (
    intent.egress.mode === 'external-ip' &&
    intent.sites.every((site) =>
      site.nodes.every((node) => node.interfaces.length === 2 && node.interfaces[1].role === 'sli'),
    )
  );
}
/** Direct source collection: raw IAM, policy and image responses never enter public plans. */
export async function collectGcpLaunchPreflight(intent: GcpCeIntent, port: GcpPreflightPort, signal?: AbortSignal) {
  validateIntent(intent);
  if (!supportsGcpLaunchPreflight(intent)) throw new Error('Preflight requires the two-interface external-IP profile');
  signal?.throwIfAborted();
  const nodes = intent.sites.flatMap((site) => site.nodes),
    zones = [...new Set(nodes.map((node) => node.zone))],
    networks = new Set(nodes.flatMap((node) => node.interfaces.map((nic) => nic.network))),
    prefix = `/compute/v1/projects/${intent.project}`;
  const checks = {
    iam: 'unavailable' as Gate,
    quota: 'unavailable' as Gate,
    organizationPolicy: 'unavailable' as Gate,
    image: 'unavailable' as Gate,
    machineNicLimit: 'unavailable' as Gate,
    zone: 'unavailable' as Gate,
    licenseUseFee: 'unknown' as 'unknown' | 'none' | 'charged',
    legalAcceptance: 'unknown' as const,
    zoneCapacity: 'not-reserved' as const,
  };
  const receipts: Array<{ source: string; observedAt: string; sha256: string }> = [];
  const read = async (source: string, fn: () => Promise<unknown>) => {
    signal?.throwIfAborted();
    const value = await fn();
    signal?.throwIfAborted();
    receipts.push({ source, observedAt: new Date().toISOString(), sha256: fingerprint(value) });
    return object(value);
  };
  const attempt = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch {
      signal?.throwIfAborted();
    }
  };
  await attempt(async () => {
    const result = await read('project-iam', () =>
      port.query(
        `/cloudresourcemanager/v1/projects/${intent.project}:testIamPermissions`,
        { permissions: [...GCP_CREATE_PERMISSIONS] },
        signal,
      ),
    );
    const permissions = result.permissions;
    if (Array.isArray(permissions) && GCP_CREATE_PERMISSIONS.every((permission) => permissions.includes(permission)))
      checks.iam = 'verified';
  });
  const machines = new Map<string, Record<string, unknown>>();
  const availableZones = new Set<string>();
  for (const zone of zones) {
    await attempt(async () => {
      const machine = await read(`machine-type:${zone}`, () =>
        port.query(`${prefix}/zones/${zone}/machineTypes/${intent.machineType}`, undefined, signal),
      );
      // The two-interface N2 limit is independent of node count. Neither an
      // observed machine nor a readable zone establishes HA service health.
      if (
        intent.machineType === 'n2-standard-8' &&
        machine.name === intent.machineType &&
        machine.guestCpus === 8 &&
        machine.memoryMb === 32768
      )
        machines.set(zone, machine);
    });
    await attempt(async () => {
      const result = await read(`zone:${zone}`, () => port.query(`${prefix}/zones/${zone}`, undefined, signal));
      if (result.name === zone && result.status === 'UP') availableZones.add(zone);
    });
  }
  if (machines.size === zones.length) checks.machineNicLimit = 'verified';
  if (availableZones.size === zones.length) checks.zone = 'verified';
  await attempt(async () => {
    const region = await read('regional-quotas', () =>
      port.query(`${prefix}/regions/${intent.region}`, undefined, signal),
    );
    const project = await read('project-quotas', () => port.query(prefix, undefined, signal));
    if (
      checks.machineNicLimit === 'verified' &&
      quota(region, 'N2_CPUS', nodes.length * 8) &&
      quota(region, 'SSD_TOTAL_GB', nodes.length * intent.diskGiB) &&
      quota(region, 'IN_USE_ADDRESSES', nodes.length) &&
      quota(project, 'NETWORKS', networks.size)
    )
      checks.quota = 'verified';
  });
  await attempt(async () => {
    const raw = await read('exact-image', () =>
      port.query(intent.image.selfLink.replace('https://www.googleapis.com', ''), undefined, signal),
    );
    const result: Record<string, unknown> = { ...raw, architecture: raw.architecture ?? 'X86_64' };
    if (
      ['id', 'name', 'selfLink', 'status', 'architecture', 'licenses'].every(
        (key) => fingerprint(result[key]) === fingerprint(intent.image[key as keyof typeof intent.image]),
      )
    )
      checks.image = 'verified';
    const licenses = [];
    for (const license of intent.image.licenses)
      licenses.push(
        await read('image-license', () =>
          port.query(license.replace('https://www.googleapis.com', ''), undefined, signal),
        ),
      );
    if (licenses.every((license) => license.chargesUseFee === false)) checks.licenseUseFee = 'none';
    else if (licenses.some((license) => license.chargesUseFee === true)) checks.licenseUseFee = 'charged';
  });
  await attempt(async () => {
    const values = [];
    for (const constraint of [
      'compute.vmExternalIpAccess',
      'compute.trustedImageProjects',
      'compute.requireShieldedVm',
      'compute.restrictNonConfidentialComputing',
      'compute.disableSerialPortAccess',
    ])
      values.push(await read(constraint, () => port.policy(intent.project, constraint, signal)));
    if (
      unconditional(values[0], 'allowAll', true) &&
      unconditional(values[1], 'allowAll', true) &&
      unconditional(values[2], 'enforce', false) &&
      unconditional(values[3], 'allowAll', true) &&
      unconditional(values[4], 'enforce', true)
    )
      checks.organizationPolicy = 'verified';
  });
  return {
    schemaVersion: 1,
    project: intent.project,
    region: intent.region,
    intentFingerprint: fingerprint(intent),
    observedAt: new Date().toISOString(),
    checks,
    receipts,
  };
}

export type GcpLaunchPreflight = Awaited<ReturnType<typeof collectGcpLaunchPreflight>>;
