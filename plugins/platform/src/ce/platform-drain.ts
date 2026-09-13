import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from './deployment-store';
import type { OriginTeardownSnapshot } from './origin-teardown';
import { CeApiError, type CeOwner, type SiteBinding } from './runtime';

type RoutingResource = { kind: 'bgp' | 'bgp_routing_policy' | 'external_connector'; name: string; uid: string };
export interface CePlatformDrainPlan {
  schemaVersion: 1;
  owner: CeOwner;
  sourcePlanSha256: string;
  siteContractFingerprint: string;
  ingressContractFingerprint: string;
  listeners: Array<{ id: string; name: string; namespace: string }>;
  origins: OriginTeardownSnapshot[];
  sites: Array<{ binding: SiteBinding; siteUid: string; routing: RoutingResource[] }>;
}
interface Port {
  readonly engine: 'native' | 'terraform';
  readonly siteContractFingerprint: string;
  readonly ingressContractFingerprint: string;
  observeOwnedSite(binding: SiteBinding, signal?: AbortSignal): Promise<Record<string, unknown>>;
  deleteListener(listener: CePlatformDrainPlan['listeners'][number], signal?: AbortSignal): Promise<void>;
  deleteOrigin(
    snapshot: OriginTeardownSnapshot,
    listeners: CePlatformDrainPlan['listeners'],
    signal?: AbortSignal,
  ): Promise<{ status: 'pending' | 'deleted' }>;
  deleteRouting(binding: SiteBinding, resource: RoutingResource, signal?: AbortSignal): Promise<void>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const name = (value: unknown) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const text = (value: unknown) => typeof value === 'string' && !!value.trim();
const list = (value: unknown, maximum: number): value is unknown[] => Array.isArray(value) && value.length <= maximum;
function validate(plan: CePlatformDrainPlan, store: CeDeploymentStore, port: Port) {
  if (
    plan?.schemaVersion !== 1 ||
    canonical(plan.owner) !== canonical(store.owner) ||
    plan.owner.engine !== port.engine ||
    !/^[a-f0-9]{64}$/.test(plan.sourcePlanSha256) ||
    plan.siteContractFingerprint !== port.siteContractFingerprint ||
    plan.ingressContractFingerprint !== port.ingressContractFingerprint ||
    !text(plan.siteContractFingerprint) ||
    !text(plan.ingressContractFingerprint) ||
    !list(plan.listeners, 128) ||
    !list(plan.origins, 128) ||
    !list(plan.sites, 32) ||
    !plan.sites.length
  )
    throw new Error('Platform drain plan scope or contract differs');
  const identities = new Set<string>();
  const unique = (key: string) => {
    if (identities.has(key)) throw new Error('Duplicate platform drain identity');
    identities.add(key);
  };
  for (const listener of plan.listeners) {
    if (!listener || !/^[a-f0-9]{24}$/.test(listener.id) || !name(listener.name) || !name(listener.namespace))
      throw new Error('Invalid drain listener');
    unique(`listener:${listener.namespace}/${listener.name}`);
    unique(`listener-plan:${listener.id}`);
  }
  for (const snapshot of plan.origins) {
    if (
      snapshot?.schemaVersion !== 1 ||
      canonical(snapshot.owner) !== canonical(plan.owner) ||
      snapshot.contractFingerprint !== plan.ingressContractFingerprint ||
      !snapshot.origin ||
      !name(snapshot.origin.name) ||
      !name(snapshot.origin.namespace) ||
      !text(snapshot.origin.uid) ||
      !text(snapshot.resourceVersion) ||
      !/^[a-f0-9]{64}$/.test(snapshot.specSha256) ||
      !Number.isFinite(Date.parse(snapshot.observedAt))
    )
      throw new Error('Invalid drain origin observation');
    unique(`origin:${snapshot.origin.namespace}/${snapshot.origin.name}`);
    unique(`uid:${snapshot.origin.uid}`);
  }
  for (const site of plan.sites) {
    if (
      !site?.binding ||
      canonical(site.binding.owner) !== canonical(plan.owner) ||
      !name(site.binding.siteName) ||
      !text(site.siteUid) ||
      !Array.isArray(site.binding.nodes) ||
      ![1, 3].includes(site.binding.nodes.length) ||
      !list(site.routing, 128)
    )
      throw new Error('Invalid drain site identity');
    unique(`site:${site.binding.siteName}`);
    unique(`uid:${site.siteUid}`);
    for (const node of site.binding.nodes) {
      if (!name(node)) throw new Error('Invalid drain node');
      unique(`node:${node}`);
    }
    for (const resource of site.routing) {
      if (
        !resource ||
        !['bgp', 'bgp_routing_policy', 'external_connector'].includes(resource.kind) ||
        !name(resource.name) ||
        !text(resource.uid)
      )
        throw new Error('Invalid drain routing identity');
      unique(`${resource.kind}:${resource.name}`);
      unique(`uid:${resource.uid}`);
    }
  }
}
/** Persisted platform drain stage, before cloud destruction and logical-site retirement.
 * Every resume re-observes each deletion. Progress records never substitute for resource evidence.
 * The owning deployment coordinator serializes runs and supplies the complete resource inventory.
 */
export async function drainCePlatform(
  input: CePlatformDrainPlan,
  store: CeDeploymentStore,
  port: Port,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input);
  validate(plan, store, port);
  signal?.throwIfAborted();
  await store.verify();
  const sha256 = hash(plan);
  let saved: unknown;
  try {
    saved = await store.read('platform-drain-source.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (saved === undefined) await store.write('platform-drain-source.json', { sha256, plan });
  else if (!saved || typeof saved !== 'object' || canonical(saved) !== canonical({ sha256, plan }))
    throw new Error('Persisted platform drain source differs');
  const completed: string[] = [];
  const checkpoint = async () =>
    store.write('platform-drain-progress.json', {
      schemaVersion: 1,
      planSha256: sha256,
      completed: [...completed],
      observedAt: new Date().toISOString(),
    });
  const boundary = async () => {
    signal?.throwIfAborted();
    await store.verify();
    validate(plan, store, port);
  };
  // Refuse a replaced site before draining anything; routing removal repeats this check at its own boundary.
  const siteIdentity = async (site: CePlatformDrainPlan['sites'][number]) => {
    let current: Record<string, unknown>;
    try {
      current = await port.observeOwnedSite(site.binding, signal);
    } catch (error) {
      // A completed outer teardown may have retired the logical site. Each deletion still
      // performs its own readback; an existing routing object requires owned-site evidence.
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    if (!current || (current.system_metadata as Record<string, unknown> | undefined)?.uid !== site.siteUid)
      throw new Error('Site replaced after platform drain planning');
  };
  for (const site of plan.sites) await siteIdentity(site);
  for (const listener of plan.listeners) {
    await boundary();
    await port.deleteListener(listener, signal);
    completed.push(`listener:${listener.namespace}/${listener.name}`);
    await checkpoint();
  }
  for (const origin of plan.origins) {
    await boundary();
    const observation = await port.deleteOrigin(origin, plan.listeners, signal);
    if (observation.status !== 'deleted') return { status: 'pending-origin' as const, planSha256: sha256, completed };
    completed.push(`origin:${origin.origin.namespace}/${origin.origin.name}`);
    await checkpoint();
  }
  // BGP must disappear before its policy and GRE connector dependencies, regardless of input order.
  for (const kind of ['bgp', 'bgp_routing_policy', 'external_connector'] as const)
    for (const site of plan.sites)
      for (const resource of site.routing.filter((row) => row.kind === kind)) {
        await boundary();
        await siteIdentity(site);
        await port.deleteRouting(site.binding, resource, signal);
        completed.push(`${resource.kind}:${resource.name}`);
        await checkpoint();
      }
  await boundary();
  const receipt = {
    status: 'platform-drained' as const,
    owner: plan.owner,
    sourcePlanSha256: plan.sourcePlanSha256,
    planSha256: sha256,
    completed,
    cloud: 'unknown' as const,
    sites: 'not-retired' as const,
    observedAt: new Date().toISOString(),
  };
  await store.write('platform-drain-receipt.json', receipt);
  return receipt;
}
