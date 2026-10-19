import { fingerprint } from './discovery';
import { parseGcpGlobalHealth } from './health';
import { correlateGcpPhysicalInterfaces, type GcpExpectedNodeIdentity } from './interface-identity';
import type { GcpCeEngine } from './types';

export interface GcpStatusSource {
  cloud(nodeName: string, signal?: AbortSignal): Promise<unknown>;
  configuration(siteName: string, signal?: AbortSignal): Promise<unknown>;
  registrations(siteName: string, signal?: AbortSignal): Promise<unknown>;
  health(siteName: string, signal?: AbortSignal): Promise<unknown>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed status observation');
  return value as Record<string, unknown>;
}
/** Collect source evidence directly; caller health assertions and labels are not accepted. */
export async function observeGcpSiteStatus(
  expected: GcpExpectedNodeIdentity,
  engine: GcpCeEngine,
  source: GcpStatusSource,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!['native', 'terraform'].includes(engine)) throw new Error('Explicit status owning engine required');
  const evidence = {
    schemaVersion: 1,
    project: expected.project,
    zone: expected.zone,
    siteName: expected.siteName,
    nodeName: expected.nodeName,
    instanceId: expected.instanceId,
    engine,
    observedAt: new Date().toISOString(),
    cloudProvisioning: 'unknown',
    registration: 'unknown',
    physicalInterfaceIdentity: 'unknown',
    platformHealth: 'unknown',
    routing: 'unknown',
    applicationTraffic: 'unknown',
    sourceReceipts: [] as Array<{ source: string; sha256: string }>,
  };
  const read = async (name: string, fn: () => Promise<unknown>) => {
    signal?.throwIfAborted();
    const value = await fn();
    signal?.throwIfAborted();
    evidence.sourceReceipts.push({ source: name, sha256: fingerprint(value) });
    return object(value);
  };
  let cloud: Record<string, unknown>;
  try {
    cloud = await read('gcloud-instance', () => source.cloud(expected.nodeName, signal));
    if (
      String(cloud.id) !== expected.instanceId ||
      cloud.name !== expected.nodeName ||
      cloud.zone !== `https://www.googleapis.com/compute/v1/projects/${expected.project}/zones/${expected.zone}`
    )
      return evidence;
    evidence.cloudProvisioning = cloud.status === 'RUNNING' ? 'running' : 'observed';
  } catch {
    signal?.throwIfAborted();
    return evidence;
  }
  let configuration: Record<string, unknown>, registration: Record<string, unknown>;
  try {
    configuration = await read('xc-site-configuration', () => source.configuration(expected.siteName, signal));
    const metadata = object(configuration.metadata);
    if (metadata.name !== expected.siteName || metadata.namespace !== 'system') return evidence;
    const response = await read('xc-site-registrations', () => source.registrations(expected.siteName, signal));
    if (
      !Array.isArray(response.items) ||
      (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) ||
      response.next_page_token ||
      response.continue
    )
      return evidence;
    const matches = response.items.map(object).filter((item) => {
      const spec = object(item.get_spec),
        infra = object(spec.infra),
        passport = object(spec.passport);
      return infra.hostname === expected.nodeName && passport.cluster_name === expected.siteName;
    });
    if (matches.length !== 1) return evidence;
    registration = matches[0];
    const infra = object(object(registration.get_spec).infra);
    const state = object(object(registration.object).status).current_state;
    if (
      infra.provider !== 'GOOGLE' ||
      String(infra.instance_id) !== expected.instanceId ||
      infra.availability_zone !== expected.zone
    )
      return evidence;
    evidence.registration = state === 'ONLINE' ? 'online' : 'observed-not-online';
    if (state !== 'ONLINE') return evidence;
  } catch {
    signal?.throwIfAborted();
    return evidence;
  }
  try {
    correlateGcpPhysicalInterfaces(expected, cloud, registration, configuration);
    evidence.physicalInterfaceIdentity = 'observed';
  } catch {
    return evidence;
  }
  try {
    const health = await read('xc-global-health', () => source.health(expected.siteName, signal));
    evidence.platformHealth = parseGcpGlobalHealth(health, expected.nodeName).status;
  } catch {
    signal?.throwIfAborted();
    evidence.platformHealth = 'unknown';
  }
  return evidence;
}
