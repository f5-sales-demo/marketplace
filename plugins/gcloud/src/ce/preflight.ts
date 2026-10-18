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
/** Direct source collection: raw IAM, policy and image responses never enter public plans. */
export async function collectGcpLaunchPreflight(intent: GcpCeIntent, port: GcpPreflightPort, signal?: AbortSignal) {
  validateIntent(intent);
  if (
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 1 ||
    intent.sites[0].nodes[0].interfaces.length !== 2 ||
    intent.sites[0].nodes[0].interfaces[1].role !== 'sli' ||
    intent.egress.mode !== 'external-ip'
  )
    throw new Error('Preflight requires the qualified single-node two-interface profile');
  signal?.throwIfAborted();
  const node = intent.sites[0].nodes[0],
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
  let machine: Record<string, unknown> | undefined;
  await attempt(async () => {
    machine = await read('machine-type', () =>
      port.query(`${prefix}/zones/${node.zone}/machineTypes/${intent.machineType}`, undefined, signal),
    );
    // Admit the two-interface N2 profile exercised by the installed live campaigns.
    // Other families require their own provider limits; no general limit is inferred.
    if (
      intent.machineType === 'n2-standard-8' &&
      machine.name === intent.machineType &&
      machine.guestCpus === 8 &&
      machine.memoryMb === 32768
    )
      checks.machineNicLimit = 'verified';
  });
  await attempt(async () => {
    const result = await read('zone', () => port.query(`${prefix}/zones/${node.zone}`, undefined, signal));
    if (result.name === node.zone && result.status === 'UP') checks.zone = 'verified';
  });
  await attempt(async () => {
    const region = await read('regional-quotas', () =>
      port.query(`${prefix}/regions/${intent.region}`, undefined, signal),
    );
    const project = await read('project-quotas', () => port.query(prefix, undefined, signal));
    if (
      machine &&
      typeof machine.guestCpus === 'number' &&
      quota(region, 'N2_CPUS', machine.guestCpus) &&
      quota(region, 'DISKS_TOTAL_GB', intent.diskGiB) &&
      quota(region, 'IN_USE_ADDRESSES', 1) &&
      quota(project, 'NETWORKS', 2)
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
