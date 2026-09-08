import { createHash } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from './deployment-store';
import type { VerifiedIngressContract } from './ingress-contract';
import type { ExpectedCeInterface, ObservedCeInterface } from './interface-evidence';
import { CeApiError, type SiteBinding } from './runtime';
import type { InsideHttpListener } from './wire-ingress';

type Json = Record<string, unknown>;
type Selection = { binding: SiteBinding; node: string; mac: string };
type Intent = Omit<InsideHttpListener, 'sites'>;
interface Port {
  readonly engine: 'native' | 'terraform';
  readonly siteFingerprint: string;
  observeOwnedSite(binding: SiteBinding, signal?: AbortSignal): Promise<Json>;
  observeAwsInterfaces(
    binding: SiteBinding,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ): Promise<{
    status: 'observed' | 'unknown';
    interfaces: ObservedCeInterface[];
    observedAt: string;
  }>;
  request(path: string, init?: RequestInit, signal?: AbortSignal): Promise<Json>;
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress evidence');
  return value as Json;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const uid = (value: Json) => {
  const result = object(value.system_metadata).uid;
  if (typeof result !== 'string' || !result) throw new Error('Ingress resource UID is unavailable');
  return result;
};
function matches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i) => matches(actual[i], item))
    );
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const want = expected as Json;
    const got = actual as Json;
    return (
      Object.entries(want).every(([key, value]) => Object.hasOwn(got, key) && matches(got[key], value)) &&
      Object.entries(got).every(
        ([key, value]) =>
          Object.hasOwn(want, key) ||
          value === null ||
          value === '' ||
          value === false ||
          value === 0 ||
          (Array.isArray(value) && value.length === 0),
      )
    );
  }
  return actual === expected;
}

/** Stored ingress plans supplement the immutable site plan. No caller-provided health is admitted. */
export class CeIngressLifecycle {
  constructor(
    private readonly port: Port,
    private readonly contract: {
      readonly fingerprint: string;
      build: VerifiedIngressContract['build'];
      projectObserved: VerifiedIngressContract['projectObserved'];
    },
    private readonly storage: CeDeploymentStore,
  ) {}
  async #locked<T>(operation: () => Promise<T>): Promise<T> {
    await this.storage.verify();
    if (this.port.engine !== this.storage.owner.engine) throw new Error('Only the owning engine may mutate ingress');
    const path = join(this.storage.directory, '.ingress-lock');
    try {
      await mkdir(path, { mode: 0o700 });
    } catch {
      throw new Error('Ingress operation lock is held; reconcile the prior process before recovery');
    }
    try {
      return await operation();
    } finally {
      await rm(path, { recursive: true });
    }
  }
  #labels(): Json {
    const owner = this.storage.owner;
    return {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': owner.engine,
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
  }
  async #material(intent: Intent, selections: Selection[], signal?: AbortSignal) {
    const deadline = AbortSignal.timeout(60_000);
    signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    signal.throwIfAborted();
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > 32)
      throw new Error('Ingress site selections required');
    const names = new Set<string>();
    const nodes = new Set<string>();
    const macs = new Set<string>();
    const siteUids = new Set<string>();
    const placements = [];
    for (const selected of selections) {
      const { binding } = selected;
      if (
        !same(binding.owner, this.storage.owner) ||
        binding.owner.provider !== 'aws' ||
        names.has(binding.siteName) ||
        nodes.has(selected.node) ||
        macs.has(selected.mac.toLowerCase()) ||
        binding.nodes.length !== 1 ||
        binding.nodes[0] !== selected.node ||
        !/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(selected.mac)
      )
        throw new Error('Ingress requires distinct owned AWS sites with an observed single-node inside interface');
      names.add(binding.siteName);
      nodes.add(selected.node);
      macs.add(selected.mac.toLowerCase());
      const before = await this.port.observeOwnedSite(binding, signal);
      const observation = await this.port.observeAwsInterfaces(
        binding,
        [{ node: selected.node, role: 'sli', mac: selected.mac }],
        signal,
      );
      const observedAt = Date.parse(observation.observedAt);
      const inside = observation.interfaces;
      if (
        observation.status !== 'observed' ||
        !Number.isFinite(observedAt) ||
        observedAt > Date.now() ||
        Date.now() - observedAt > 60_000 ||
        inside.length !== 1 ||
        inside[0].role !== 'sli' ||
        inside[0].node !== selected.node ||
        inside[0].mac !== selected.mac.toLowerCase() ||
        !inside[0].linkUp ||
        !inside[0].ipv4
      )
        throw new Error('Fresh inside interface address evidence is unavailable');
      const after = await this.port.observeOwnedSite(binding, signal);
      if (uid(before) !== uid(after)) throw new Error('Site replaced during ingress discovery');
      if (siteUids.has(uid(after))) throw new Error('Duplicate physical deployment identity');
      siteUids.add(uid(after));
      placements.push({ siteName: binding.siteName, siteUid: uid(after), interface: inside[0] });
    }
    const built = this.contract.build({
      ...intent,
      sites: placements.map((p) => {
        const insideAddress = p.interface.ipv4?.address;
        if (!insideAddress) throw new Error('Inside address became unavailable');
        return { name: p.siteName, insideAddress };
      }),
    });
    const pool = await this.port.request(
      `/api/config/namespaces/${intent.originPool.namespace}/origin_pools/${intent.originPool.name}`,
      {},
      signal,
    );
    const metadata = object(pool.metadata);
    if (metadata.name !== intent.originPool.name || metadata.namespace !== intent.originPool.namespace)
      throw new Error('Origin pool scope differs from ingress intent');
    signal.throwIfAborted();
    return {
      owner: this.storage.owner,
      contractFingerprint: this.contract.fingerprint,
      siteFingerprint: this.port.siteFingerprint,
      intent: structuredClone(intent),
      selections: structuredClone(selections),
      placements,
      originUid: uid(pool),
      request: { metadata: { ...built.metadata, labels: this.#labels() }, spec: built.spec },
    };
  }
  async planAws(intent: Intent, selections: Selection[], signal?: AbortSignal) {
    return this.#locked(async () => {
      const material = await this.#material(intent, selections, signal);
      const draft = {
        schemaVersion: 1 as const,
        kind: 'ce-inside-http-ingress' as const,
        observedAt: new Date().toISOString(),
        material,
      };
      const sha256 = hash(draft);
      const id = sha256.slice(0, 24);
      const plan = { ...draft, id, sha256, request: material.request };
      await this.storage.write(`ingress-plan-${id}.json`, plan);
      return plan;
    });
  }
  async #load(id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Invalid ingress plan identity');
    const plan = (await this.storage.read(`ingress-plan-${id}.json`)) as Awaited<
      ReturnType<CeIngressLifecycle['planAws']>
    >;
    const { id: savedId, sha256, request, ...draft } = plan;
    if (
      savedId !== id ||
      draft.schemaVersion !== 1 ||
      draft.kind !== 'ce-inside-http-ingress' ||
      hash(draft) !== sha256 ||
      sha256.slice(0, 24) !== id ||
      !same(request, draft.material.request) ||
      !same(draft.material.owner, this.storage.owner) ||
      draft.material.contractFingerprint !== this.contract.fingerprint ||
      draft.material.siteFingerprint !== this.port.siteFingerprint
    )
      throw new Error('Obsolete, forged or foreign ingress plan');
    return plan;
  }
  async #read(path: string, signal?: AbortSignal) {
    try {
      return await this.port.request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return undefined;
      throw error;
    }
  }
  async #checkpoint(id: string): Promise<Json | undefined> {
    try {
      return object(await this.storage.read(`ingress-checkpoint-${id}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  #owned(actual: Json, plan: Awaited<ReturnType<CeIngressLifecycle['planAws']>>, expectedUid?: unknown) {
    const metadata = object(actual.metadata);
    const labels = object(metadata.labels);
    if (
      metadata.name !== plan.request.metadata.name ||
      metadata.namespace !== plan.request.metadata.namespace ||
      labels['xcsh-ce-ingress-plan'] !== plan.id ||
      Object.entries(this.#labels()).some(([key, value]) => labels[key] !== value) ||
      (expectedUid !== undefined && uid(actual) !== expectedUid) ||
      !matches(this.contract.projectObserved(actual.spec), this.contract.projectObserved(plan.request.spec))
    )
      throw new Error('Live listener ownership, UID or configuration differs from saved ingress plan');
  }
  async apply(id: string, signal?: AbortSignal) {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const checkpoint = await this.#checkpoint(id);
      if (
        checkpoint?.phase === 'deleted' ||
        (checkpoint &&
          (checkpoint.planSha256 !== plan.sha256 ||
            !['creating', 'created'].includes(String(checkpoint.phase)) ||
            (checkpoint.phase === 'created' && (typeof checkpoint.uid !== 'string' || !checkpoint.uid))))
      )
        throw new Error('Ingress checkpoint does not admit application');
      const current = await this.#material(plan.material.intent, plan.material.selections, signal);
      if (!same(current, plan.material)) throw new Error('Ingress identities or addresses changed; replan required');
      const collection = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers`;
      let existing = await this.#read(`${collection}/${plan.request.metadata.name}`, signal);
      if (!existing) {
        if (checkpoint?.uid) throw new Error('Checkpointed listener is missing; reconcile before replacement');
        await this.storage.write(`ingress-checkpoint-${id}.json`, { phase: 'creating', planSha256: plan.sha256 });
        // Recollect after the durable write and immediately before the mutation boundary.
        if (!same(await this.#material(plan.material.intent, plan.material.selections, signal), plan.material))
          throw new Error('Ingress evidence changed before mutation');
        try {
          await this.port.request(
            collection,
            {
              method: 'POST',
              body: JSON.stringify({
                ...plan.request,
                metadata: {
                  ...plan.request.metadata,
                  labels: { ...plan.request.metadata.labels, 'xcsh-ce-ingress-plan': id },
                },
              }),
            },
            signal,
          );
        } catch (error) {
          if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
        }
        existing = await this.#read(`${collection}/${plan.request.metadata.name}`, signal);
        if (!existing) throw new Error('Ingress creation is not yet observable; resume the saved plan');
      }
      this.#owned(existing, plan, checkpoint?.uid);
      const receipt = {
        phase: 'created',
        planSha256: plan.sha256,
        uid: uid(existing),
        observedAt: new Date().toISOString(),
        listener: 'configured',
        routes: 'unknown',
        traffic: 'unknown',
      };
      await this.storage.write(`ingress-checkpoint-${id}.json`, receipt);
      return receipt;
    });
  }
  async delete(id: string, signal?: AbortSignal): Promise<void> {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const checkpoint = await this.#checkpoint(id);
      if (
        !checkpoint ||
        !['created', 'deleted'].includes(String(checkpoint.phase)) ||
        checkpoint.planSha256 !== plan.sha256 ||
        typeof checkpoint.uid !== 'string' ||
        !checkpoint.uid
      )
        throw new Error('A durable listener UID is required before teardown');
      const path = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers/${plan.request.metadata.name}`;
      const existing = await this.#read(path, signal);
      if (existing) {
        if (checkpoint.phase === 'deleted') throw new Error('Listener reappeared after teardown');
        this.#owned(existing, plan, checkpoint.uid);
        await this.port.request(path, { method: 'DELETE' }, signal);
        if (await this.#read(path, signal)) throw new Error('Listener deletion is still converging; resume teardown');
      }
      await this.storage.write(`ingress-checkpoint-${id}.json`, {
        ...checkpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
    });
  }
}
