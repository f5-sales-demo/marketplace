import { createHash } from 'node:crypto';
import { CeApiError, type CeOwner } from './runtime';

type Json = Record<string, unknown>;
interface Locator {
  name: string;
  namespace: string;
}
interface Origin extends Locator {
  uid: string;
}
interface Port {
  readonly engine: 'native' | 'terraform';
  request(path: string, init?: RequestInit, signal?: AbortSignal): Promise<Json>;
}
export interface OriginTeardownSnapshot {
  schemaVersion: 1;
  owner: CeOwner;
  origin: Origin;
  resourceVersion: string;
  specSha256: string;
  contractFingerprint: string;
  observedAt: string;
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed origin evidence');
  return value as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function path(locator: Locator, kind: 'origin_pools' | 'http_loadbalancers'): string {
  if (
    !locator ||
    ![locator.name, locator.namespace].every(
      (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value),
    )
  )
    throw new Error('Invalid origin or listener scope');
  return `/api/config/namespaces/${locator.namespace}/${kind}/${locator.name}`;
}
/** Exact origin mutation primitive for a serialized deployment teardown coordinator.
 * The coordinator persists the observed snapshot and the deployment's complete listener inventory.
 * This primitive does not claim cloud cleanup or discover unrelated listener references.
 */
export class CeOriginTeardown {
  constructor(
    private readonly port: Port,
    private readonly fingerprint: string,
  ) {}
  #scope(owner: CeOwner, origin: Origin, mutate = false) {
    if (
      !owner ||
      !['native', 'terraform'].includes(owner.engine) ||
      !['aws', 'azure'].includes(owner.provider) ||
      [owner.deploymentId, owner.account, owner.region].some(
        (value) => typeof value !== 'string' || !value || /[\r\n]/.test(value),
      ) ||
      (mutate && owner.engine !== this.port.engine)
    )
      throw new Error('Origin ownership or execution engine differs');
    path(origin, 'origin_pools');
    if (typeof origin.uid !== 'string' || !origin.uid.trim()) throw new Error('Exact origin UID is required');
  }
  async #read(source: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    try {
      return object(await this.port.request(source, {}, signal));
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return undefined;
      throw error;
    }
  }
  #identity(value: Json, owner: CeOwner, origin: Origin) {
    const metadata = object(value.metadata),
      labels = object(metadata.labels);
    const expected = {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': owner.engine,
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
    if (
      metadata.name !== origin.name ||
      metadata.namespace !== origin.namespace ||
      object(value.system_metadata).uid !== origin.uid ||
      Object.entries(expected).some(([key, item]) => labels[key] !== item)
    )
      throw new Error('Live origin UID or ownership differs');
    if (typeof value.resource_version !== 'string' || !value.resource_version)
      throw new Error('Origin resource version is unavailable');
    return { resourceVersion: value.resource_version, specSha256: digest(object(value.spec)) };
  }
  async observe(owner: CeOwner, origin: Origin, signal?: AbortSignal): Promise<OriginTeardownSnapshot> {
    owner = structuredClone(owner);
    origin = structuredClone(origin);
    this.#scope(owner, origin);
    const current = await this.#read(path(origin, 'origin_pools'), signal);
    if (!current) throw new Error('Origin must be observed before planning teardown');
    return {
      schemaVersion: 1,
      owner,
      origin,
      ...this.#identity(current, owner, origin),
      contractFingerprint: this.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
  async delete(snapshot: OriginTeardownSnapshot, listeners: Locator[], signal?: AbortSignal) {
    snapshot = structuredClone(snapshot);
    listeners = structuredClone(listeners);
    signal?.throwIfAborted();
    this.#scope(snapshot?.owner, snapshot?.origin, true);
    if (
      snapshot.schemaVersion !== 1 ||
      snapshot.contractFingerprint !== this.fingerprint ||
      !/^[a-f0-9]{64}$/.test(snapshot.specSha256) ||
      typeof snapshot.resourceVersion !== 'string' ||
      !snapshot.resourceVersion ||
      !Number.isFinite(Date.parse(snapshot.observedAt))
    )
      throw new Error('Origin teardown snapshot is invalid');
    if (!Array.isArray(listeners) || listeners.length < 1 || listeners.length > 128)
      throw new Error('Recorded listener inventory is required');
    const listenerPaths = listeners.map((listener) => path(listener, 'http_loadbalancers'));
    if (new Set(listenerPaths).size !== listenerPaths.length) throw new Error('Duplicate listener identities');
    const source = path(snapshot.origin, 'origin_pools');
    // Recheck the known listeners even on resume after origin absence.
    for (const listener of listenerPaths)
      if (await this.#read(listener, signal)) throw new Error('Listener must be absent before origin deletion');
    const check = (value: Json) => {
      const identity = this.#identity(value, snapshot.owner, snapshot.origin);
      if (identity.resourceVersion !== snapshot.resourceVersion || identity.specSha256 !== snapshot.specSha256)
        throw new Error('Origin configuration changed after teardown planning');
    };
    let current = await this.#read(source, signal);
    if (current) {
      check(current);
      signal?.throwIfAborted();
      this.#scope(snapshot.owner, snapshot.origin, true);
      try {
        await this.port.request(source, { method: 'DELETE' }, signal);
      } catch (error) {
        if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
          throw error;
      }
      current = await this.#read(source, signal);
      if (current) check(current);
    }
    return {
      status: current ? ('pending' as const) : ('deleted' as const),
      owner: snapshot.owner,
      origin: snapshot.origin,
      source,
      listenerSources: listenerPaths,
      specSha256: snapshot.specSha256,
      contractFingerprint: this.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
}
