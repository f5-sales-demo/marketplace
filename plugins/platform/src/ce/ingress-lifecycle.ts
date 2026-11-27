import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { join } from 'node:path';
import type { CeDeploymentStore } from './deployment-store';
import type { VerifiedIngressContract } from './ingress-contract';
import type { ExpectedCeInterface, ObservedCeInterface } from './interface-evidence';
import { acquireProcessLock } from './process-lock';
import { CeApiError, type SiteBinding } from './runtime';
import type { InsideHttpListener } from './wire-ingress';
import type { SiteLocalHttpOrigin } from './wire-origin';

type Json = Record<string, unknown>;
type Selection = { binding: SiteBinding; node: string; mac: string; insideAddress?: string };
type Intent = Omit<InsideHttpListener, 'sites'> & { originAddress: string; usePrimaryInterfaceAddress?: true };
/** Primary-interface advertisements require a complete bijection to every node in each site. */
function validatePrimarySelections(intent: Intent, selections: Selection[], provider: string): boolean {
  if (intent.usePrimaryInterfaceAddress === undefined) return false;
  if (intent.usePrimaryInterfaceAddress !== true || provider !== 'aws')
    throw new Error('Primary-interface ingress mode or provider differs');
  const groups = new Map<string, { binding: SiteBinding; nodes: Set<string> }>();
  for (const selected of selections) {
    const binding = selected.binding;
    if (
      !binding ||
      !Array.isArray(binding.nodes) ||
      ![1, 3].includes(binding.nodes.length) ||
      new Set(binding.nodes).size !== binding.nodes.length ||
      !binding.nodes.includes(selected.node) ||
      selected.insideAddress !== undefined
    )
      throw new Error('Primary-interface ingress requires exact site and node bindings');
    const group = groups.get(binding.siteName);
    if (group) {
      if (!same(group.binding, binding) || group.nodes.has(selected.node))
        throw new Error('Primary-interface ingress site bindings conflict');
      group.nodes.add(selected.node);
    } else groups.set(binding.siteName, { binding, nodes: new Set([selected.node]) });
  }
  for (const { binding, nodes } of groups.values())
    if (nodes.size !== binding.nodes.length || binding.nodes.some((node) => !nodes.has(node)))
      throw new Error('Primary-interface ingress requires every site node');
  return true;
}
function listenerPlacements(
  intent: Intent,
  placements: CeIngressPlan['material']['placements'],
): InsideHttpListener['sites'] {
  return intent.usePrimaryInterfaceAddress === true
    ? [...new Set(placements.map((row) => row.siteName))].map((name) => ({
        name,
        usePrimaryInterfaceAddress: true as const,
      }))
    : placements.map((row) => ({ name: row.siteName, insideAddress: row.insideAddress }));
}
interface Port {
  readonly engine: 'native' | 'terraform';
  readonly siteFingerprint: string;
  observeOwnedSite(binding: SiteBinding, signal?: AbortSignal): Promise<Json>;
  observeAwsInterfaces(
    binding: SiteBinding,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ): Promise<{
    status: 'observed' | 'down' | 'unknown';
    interfaces: ObservedCeInterface[];
    observedAt: string;
  }>;
  observeAzureInterfaces(
    binding: SiteBinding,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ): Promise<{
    status: 'observed' | 'down' | 'unknown';
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
export const hashCeIngressPlan = hash;
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

export interface CeIngressSourceBinding {
  schemaVersion: 1;
  kind: 'azure-ce-source';
  sourcePlanSha256: string;
  sourceArtifactSha256: string;
}
interface IngressBuilder {
  readonly fingerprint: string;
  build: VerifiedIngressContract['build'];
  buildOrigin: VerifiedIngressContract['buildOrigin'];
}
export interface CeIngressPlan {
  schemaVersion: 1;
  kind: 'ce-inside-http-ingress';
  observedAt: string;
  id: string;
  sha256: string;
  source?: CeIngressSourceBinding;
  request: {
    metadata: { name: string; namespace: string; labels: Record<string, string> };
    spec: ReturnType<VerifiedIngressContract['build']>['spec'];
  };
  material: {
    owner: SiteBinding['owner'];
    contractFingerprint: string;
    siteFingerprint: string;
    intent: Intent;
    selections: Selection[];
    placements: { siteName: string; siteUid: string; interface: ObservedCeInterface; insideAddress: string }[];
    request: CeIngressPlan['request'];
    originRequest: {
      metadata: { name: string; namespace: string; labels: Record<string, string> };
      spec: ReturnType<VerifiedIngressContract['buildOrigin']>['spec'];
    };
  };
}
function fields(value: Json, names: string[]) {
  if (Object.keys(value).sort().join(',') !== names.toSorted().join(','))
    throw new Error('Ingress historical fields differ');
}
function text(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 512) throw new Error('Ingress historical identity missing');
  return value;
}
/** Recompile saved request and identity joins; historical collection time never establishes live acceptance. */
export function validateCeIngressHistoricalPlan(
  value: unknown,
  owner: SiteBinding['owner'],
  contract: IngressBuilder,
  siteFingerprint: string,
): CeIngressPlan {
  const raw = object(value);
  fields(raw, [
    'schemaVersion',
    'kind',
    'observedAt',
    'material',
    'id',
    'sha256',
    'request',
    ...(raw.source !== undefined ? ['source'] : []),
  ]);
  const plan = raw as unknown as CeIngressPlan;
  const { id, sha256, request, ...draft } = plan;
  if (
    draft.schemaVersion !== 1 ||
    draft.kind !== 'ce-inside-http-ingress' ||
    typeof id !== 'string' ||
    !/^[a-f0-9]{24}$/.test(id) ||
    hash(draft) !== sha256 ||
    sha256.slice(0, 24) !== id ||
    typeof draft.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(draft.observedAt)) ||
    Date.parse(draft.observedAt) > Date.now()
  )
    throw new Error('Obsolete, forged or foreign ingress plan');
  if (raw.source !== undefined) {
    const source = object(raw.source);
    fields(source, ['schemaVersion', 'kind', 'sourcePlanSha256', 'sourceArtifactSha256']);
    if (
      owner.provider !== 'azure' ||
      source.schemaVersion !== 1 ||
      source.kind !== 'azure-ce-source' ||
      typeof source.sourcePlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sourcePlanSha256) ||
      typeof source.sourceArtifactSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(source.sourceArtifactSha256)
    )
      throw new Error('Ingress source binding differs');
  }
  const material = object(plan.material);
  fields(material, [
    'owner',
    'contractFingerprint',
    'siteFingerprint',
    'intent',
    'selections',
    'placements',
    'originRequest',
    'request',
  ]);
  if (
    !same(material.owner, owner) ||
    material.contractFingerprint !== contract.fingerprint ||
    material.siteFingerprint !== siteFingerprint ||
    !Array.isArray(material.selections) ||
    !Array.isArray(material.placements) ||
    material.selections.length < 1 ||
    material.selections.length > 32 ||
    material.placements.length !== material.selections.length
  )
    throw new Error('Ingress historical owner or placement differs');
  const primary = validatePrimarySelections(plan.material.intent, plan.material.selections, owner.provider);
  const uidSites = new Map<string, string>();
  const siteIds = new Map<string, string>();
  const sites = new Set<string>(),
    nodes = new Set<string>(),
    macs = new Set<string>(),
    uids = new Set<string>(),
    addresses = new Set<string>();
  for (let i = 0; i < plan.material.selections.length; i++) {
    const selected = plan.material.selections[i],
      placement = plan.material.placements[i];
    fields(object(selected), [
      'binding',
      'node',
      'mac',
      ...(selected.insideAddress !== undefined ? ['insideAddress'] : []),
    ]);
    fields(object(placement), ['siteName', 'siteUid', 'interface', 'insideAddress']);
    const binding = selected.binding;
    fields(object(binding), ['owner', 'siteName', 'nodes']);
    if (
      !same(binding.owner, owner) ||
      !['aws', 'azure'].includes(owner.provider) ||
      !Array.isArray(binding.nodes) ||
      new Set(binding.nodes).size !== binding.nodes.length ||
      (owner.provider === 'aws' ? !primary && binding.nodes.length !== 1 : ![1, 3].includes(binding.nodes.length)) ||
      !binding.nodes.includes(selected.node) ||
      binding.siteName !== placement.siteName ||
      (!primary && sites.has(binding.siteName)) ||
      nodes.has(selected.node) ||
      macs.has(selected.mac.toLowerCase()) ||
      (uids.has(placement.siteUid) && (!primary || uidSites.get(placement.siteUid) !== binding.siteName)) ||
      (siteIds.has(binding.siteName) && siteIds.get(binding.siteName) !== placement.siteUid) ||
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(selected.mac) ||
      isIP(placement.insideAddress) !== 4 ||
      addresses.has(placement.insideAddress)
    )
      throw new Error('Ingress historical selection identity differs');
    text(binding.siteName);
    text(selected.node);
    text(placement.siteUid);
    const iface = placement.interface;
    fields(object(iface), ['node', 'role', 'mac', 'device', 'interfaceName', 'mtu', 'linkUp', 'ipv4']);
    if (
      iface.node !== selected.node ||
      iface.role !== 'sli' ||
      iface.mac !== selected.mac.toLowerCase() ||
      iface.linkUp !== true ||
      !Number.isInteger(iface.mtu) ||
      (iface.mtu !== 0 && (iface.mtu < 576 || iface.mtu > 8000)) ||
      !iface.ipv4
    )
      throw new Error('Ingress historical SLI identity differs');
    text(iface.device);
    text(iface.interfaceName);
    fields(object(iface.ipv4), ['address', 'prefixLength']);
    if (
      isIP(iface.ipv4.address) !== 4 ||
      !Number.isInteger(iface.ipv4.prefixLength) ||
      iface.ipv4.prefixLength < 0 ||
      iface.ipv4.prefixLength > 32 ||
      placement.insideAddress !== (selected.insideAddress ?? iface.ipv4.address)
    )
      throw new Error('Ingress historical inside address differs');
    uidSites.set(placement.siteUid, binding.siteName);
    siteIds.set(binding.siteName, placement.siteUid);
    sites.add(binding.siteName);
    nodes.add(selected.node);
    macs.add(selected.mac.toLowerCase());
    uids.add(placement.siteUid);
    addresses.add(placement.insideAddress);
  }
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': owner.engine,
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  const { originAddress, usePrimaryInterfaceAddress: _primary, ...intent } = plan.material.intent;
  const built = contract.build({
    ...intent,
    sites: listenerPlacements(plan.material.intent, plan.material.placements),
  });
  const origin = contract.buildOrigin({
    name: plan.material.intent.originPool.name,
    namespace: plan.material.intent.originPool.namespace,
    originAddress,
    port: plan.material.intent.port,
    siteNames: [...new Set(plan.material.placements.map((row) => row.siteName))],
  });
  if (
    !same(request, material.request) ||
    !same(request, { metadata: { ...built.metadata, labels }, spec: built.spec }) ||
    !same(material.originRequest, { metadata: { ...origin.metadata, labels }, spec: origin.spec })
  )
    throw new Error('Ingress historical request differs from exact contract compilation');
  return plan;
}

/** Stored ingress plans supplement the immutable site plan. No caller-provided health is admitted. */
export class CeIngressLifecycle {
  constructor(
    private readonly port: Port,
    private readonly contract: {
      readonly fingerprint: string;
      build: VerifiedIngressContract['build'];
      buildOrigin: VerifiedIngressContract['buildOrigin'];
      projectObserved: VerifiedIngressContract['projectObserved'];
      projectOriginObserved: VerifiedIngressContract['projectOriginObserved'];
    },
    private readonly storage: CeDeploymentStore,
  ) {}
  async #locked<T>(operation: () => Promise<T>): Promise<T> {
    await this.storage.verify();
    if (this.port.engine !== this.storage.owner.engine) throw new Error('Only the owning engine may mutate ingress');
    const path = join(this.storage.directory, '.ingress-lock');
    const release = await acquireProcessLock(path);
    try {
      return await operation();
    } finally {
      await release();
    }
  }
  #labels(): Record<string, string> {
    const owner = this.storage.owner;
    return {
      'xcsh-ce-deployment': owner.deploymentId,
      'xcsh-ce-engine': owner.engine,
      'xcsh-ce-provider': owner.provider,
      'xcsh-ce-account': owner.account,
      'xcsh-ce-region': owner.region,
    };
  }
  async #material(
    provider: 'aws' | 'azure',
    intent: Intent,
    selections: Selection[],
    signal?: AbortSignal,
  ): Promise<CeIngressPlan['material']> {
    const deadline = AbortSignal.timeout(60_000);
    signal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    signal.throwIfAborted();
    if (!Array.isArray(selections) || selections.length < 1 || selections.length > 32)
      throw new Error('Ingress site selections required');
    const primary = validatePrimarySelections(intent, selections, provider);
    const names = new Set<string>();
    const nodes = new Set<string>();
    const macs = new Set<string>();
    const addresses = new Set<string>();
    const siteUids = new Map<string, string>();
    const siteIds = new Map<string, string>();
    const placements = [];
    for (const selected of selections) {
      const { binding } = selected;
      if (
        !same(binding.owner, this.storage.owner) ||
        binding.owner.provider !== provider ||
        (!primary && names.has(binding.siteName)) ||
        nodes.has(selected.node) ||
        macs.has(selected.mac.toLowerCase()) ||
        (provider === 'aws'
          ? primary
            ? !binding.nodes.includes(selected.node)
            : binding.nodes.length !== 1 || binding.nodes[0] !== selected.node
          : ![1, 3].includes(binding.nodes.length) || !binding.nodes.includes(selected.node)) ||
        !/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(selected.mac) ||
        (selected.insideAddress !== undefined &&
          (isIP(selected.insideAddress) !== 4 || addresses.has(selected.insideAddress)))
      )
        throw new Error(`Ingress requires distinct owned ${provider} sites with an observed inside interface`);
      names.add(binding.siteName);
      nodes.add(selected.node);
      macs.add(selected.mac.toLowerCase());
      if (selected.insideAddress) addresses.add(selected.insideAddress);
      const before = await this.port.observeOwnedSite(binding, signal);
      const observation = await (provider === 'aws'
        ? this.port.observeAwsInterfaces(binding, [{ node: selected.node, role: 'sli', mac: selected.mac }], signal)
        : this.port.observeAzureInterfaces(binding, [{ node: selected.node, role: 'sli', mac: selected.mac }], signal));
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
      if (siteUids.has(uid(after)) && (!primary || siteUids.get(uid(after)) !== binding.siteName))
        throw new Error('Duplicate physical deployment identity');
      if (siteIds.has(binding.siteName) && siteIds.get(binding.siteName) !== uid(after))
        throw new Error('Site replaced during ingress discovery');
      siteUids.set(uid(after), binding.siteName);
      siteIds.set(binding.siteName, uid(after));
      if (primary) {
        if (isIP(inside[0].ipv4.address) !== 4 || addresses.has(inside[0].ipv4.address))
          throw new Error('Primary interface address is invalid or duplicated');
        addresses.add(inside[0].ipv4.address);
      }
      placements.push({
        siteName: binding.siteName,
        siteUid: uid(after),
        interface: inside[0],
        insideAddress: selected.insideAddress ?? inside[0].ipv4.address,
      });
    }
    const { originAddress, usePrimaryInterfaceAddress: _primary, ...listenerIntent } = intent;
    const built = this.contract.build({
      ...listenerIntent,
      sites: listenerPlacements(intent, placements),
    });
    const origin = this.contract.buildOrigin({
      name: intent.originPool.name,
      namespace: intent.originPool.namespace,
      originAddress,
      port: intent.port,
      siteNames: [...new Set(placements.map((placement) => placement.siteName))],
    } satisfies SiteLocalHttpOrigin);
    signal.throwIfAborted();
    return {
      owner: this.storage.owner,
      contractFingerprint: this.contract.fingerprint,
      siteFingerprint: this.port.siteFingerprint,
      intent: structuredClone(intent),
      selections: structuredClone(selections),
      placements,
      originRequest: {
        metadata: { ...origin.metadata, labels: this.#labels() },
        spec: origin.spec,
      },
      request: { metadata: { ...built.metadata, labels: this.#labels() }, spec: built.spec },
    };
  }
  async planAws(intent: Intent, selections: Selection[], signal?: AbortSignal): Promise<CeIngressPlan> {
    return this.#plan('aws', intent, selections, signal);
  }
  async planAzure(
    intent: Intent,
    selections: Selection[],
    signal?: AbortSignal,
    source?: CeIngressSourceBinding,
  ): Promise<CeIngressPlan> {
    return this.#plan('azure', intent, selections, signal, source);
  }
  async #plan(
    provider: 'aws' | 'azure',
    intent: Intent,
    selections: Selection[],
    signal?: AbortSignal,
    source?: CeIngressSourceBinding,
  ): Promise<CeIngressPlan> {
    return this.#locked(async () => {
      const material = await this.#material(provider, intent, selections, signal);
      const draft = {
        schemaVersion: 1 as const,
        kind: 'ce-inside-http-ingress' as const,
        observedAt: new Date().toISOString(),
        material,
        ...(source ? { source: structuredClone(source) } : {}),
      };
      const sha256 = hash(draft);
      const id = sha256.slice(0, 24);
      const plan = { ...draft, id, sha256, request: material.request };
      validateCeIngressHistoricalPlan(plan, this.storage.owner, this.contract, this.port.siteFingerprint);
      await this.storage.write(`ingress-plan-${id}.json`, plan);
      return plan;
    });
  }
  async #load(id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) throw new Error('Invalid ingress plan identity');
    const plan = validateCeIngressHistoricalPlan(
      await this.storage.read(`ingress-plan-${id}.json`),
      this.storage.owner,
      this.contract,
      this.port.siteFingerprint,
    );
    if (plan.id !== id) throw new Error('Ingress plan filename identity differs');
    return plan;
  }
  /** Recollect Azure placement identity without mutating platform resources. */
  async matchesAzure(id: string, intent: Intent, selections: Selection[], signal?: AbortSignal): Promise<boolean> {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      if (plan.material.owner.provider !== 'azure') throw new Error('Ingress plan is not Azure-owned');
      const current = await this.#material('azure', intent, selections, signal);
      return same(current, plan.material);
    });
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
  async #originCheckpoint(id: string): Promise<Json | undefined> {
    try {
      return object(await this.storage.read(`ingress-origin-checkpoint-${id}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  #owned(actual: Json, plan: CeIngressPlan, expectedUid?: unknown) {
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
  #ownedOrigin(actual: Json, plan: CeIngressPlan, expectedUid?: unknown) {
    const metadata = object(actual.metadata);
    const labels = object(metadata.labels);
    const expected = plan.material.originRequest;
    if (
      metadata.name !== expected.metadata.name ||
      metadata.namespace !== expected.metadata.namespace ||
      labels['xcsh-ce-ingress-plan'] !== plan.id ||
      Object.entries(this.#labels()).some(([key, value]) => labels[key] !== value) ||
      (expectedUid !== undefined && uid(actual) !== expectedUid) ||
      !matches(this.contract.projectOriginObserved(actual.spec), this.contract.projectOriginObserved(expected.spec))
    )
      throw new Error('Live origin ownership, UID or configuration differs from saved ingress plan');
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
      const current = await this.#material(
        plan.material.owner.provider,
        plan.material.intent,
        plan.material.selections,
        signal,
      );
      if (!same(current, plan.material)) throw new Error('Ingress identities or addresses changed; replan required');
      const originCheckpoint = await this.#originCheckpoint(id);
      if (
        originCheckpoint &&
        (originCheckpoint.planSha256 !== plan.sha256 ||
          !['creating', 'created'].includes(String(originCheckpoint.phase)) ||
          (originCheckpoint.phase === 'created' && (typeof originCheckpoint.uid !== 'string' || !originCheckpoint.uid)))
      )
        throw new Error('Origin checkpoint does not admit application');
      const originCollection = `/api/config/namespaces/${plan.material.originRequest.metadata.namespace}/origin_pools`;
      let origin = await this.#read(`${originCollection}/${plan.material.originRequest.metadata.name}`, signal);
      if (!origin) {
        if (originCheckpoint?.uid) throw new Error('Checkpointed origin is missing; reconcile before replacement');
        await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
          phase: 'creating',
          planSha256: plan.sha256,
        });
        if (
          !same(
            await this.#material(plan.material.owner.provider, plan.material.intent, plan.material.selections, signal),
            plan.material,
          )
        )
          throw new Error('Ingress evidence changed before origin mutation');
        try {
          await this.port.request(
            originCollection,
            {
              method: 'POST',
              body: JSON.stringify({
                ...plan.material.originRequest,
                metadata: {
                  ...plan.material.originRequest.metadata,
                  labels: { ...plan.material.originRequest.metadata.labels, 'xcsh-ce-ingress-plan': id },
                },
              }),
            },
            signal,
          );
        } catch (error) {
          if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
        }
        origin = await this.#read(`${originCollection}/${plan.material.originRequest.metadata.name}`, signal);
        if (!origin) throw new Error('Origin creation is not yet observable; resume the saved plan');
      }
      this.#ownedOrigin(origin, plan, originCheckpoint?.uid);
      const originUid = uid(origin);
      await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
        phase: 'created',
        planSha256: plan.sha256,
        uid: originUid,
        observedAt: new Date().toISOString(),
      });
      const collection = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers`;
      let existing = await this.#read(`${collection}/${plan.request.metadata.name}`, signal);
      if (!existing) {
        if (checkpoint?.uid) throw new Error('Checkpointed listener is missing; reconcile before replacement');
        await this.storage.write(`ingress-checkpoint-${id}.json`, { phase: 'creating', planSha256: plan.sha256 });
        // Recollect after the durable write and immediately before the mutation boundary.
        if (
          !same(
            await this.#material(plan.material.owner.provider, plan.material.intent, plan.material.selections, signal),
            plan.material,
          )
        )
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
  /** Read-only projection for a deployment teardown manifest; raw specifications stay in private storage. */
  async teardownReference(id: string) {
    const plan = await this.#load(id),
      checkpoint = await this.#checkpoint(id),
      originCheckpoint = await this.#originCheckpoint(id);
    if (
      !checkpoint ||
      !['created', 'deleted'].includes(String(checkpoint.phase)) ||
      checkpoint.planSha256 !== plan.sha256 ||
      typeof checkpoint.uid !== 'string' ||
      !checkpoint.uid ||
      !originCheckpoint ||
      originCheckpoint.phase !== 'created' ||
      originCheckpoint.planSha256 !== plan.sha256 ||
      typeof originCheckpoint.uid !== 'string' ||
      !originCheckpoint.uid
    )
      throw new Error('Validated listener checkpoint required for teardown reference');
    return {
      id,
      name: plan.request.metadata.name,
      namespace: plan.request.metadata.namespace,
      uid: checkpoint.uid,
      phase: String(checkpoint.phase),
      originPool: { ...plan.material.intent.originPool, uid: originCheckpoint.uid },
    };
  }
  /** Retire an incomplete owned ingress plan so its corrected successor can be planned and applied. */
  async retire(id: string, signal?: AbortSignal): Promise<void> {
    return this.#locked(async () => {
      const plan = await this.#load(id);
      const listenerCheckpoint = await this.#checkpoint(id);
      const originCheckpoint = await this.#originCheckpoint(id);
      if (
        !listenerCheckpoint ||
        !['created', 'deleted'].includes(String(listenerCheckpoint.phase)) ||
        listenerCheckpoint.planSha256 !== plan.sha256 ||
        typeof listenerCheckpoint.uid !== 'string' ||
        !listenerCheckpoint.uid ||
        !originCheckpoint ||
        !['created', 'deleted'].includes(String(originCheckpoint.phase)) ||
        originCheckpoint.planSha256 !== plan.sha256 ||
        typeof originCheckpoint.uid !== 'string' ||
        !originCheckpoint.uid
      )
        throw new Error('Validated ingress identities are required for correction');
      const listenerPath = `/api/config/namespaces/${plan.request.metadata.namespace}/http_loadbalancers/${plan.request.metadata.name}`;
      const listener = await this.#read(listenerPath, signal);
      if (listener) {
        if (listenerCheckpoint.phase === 'deleted') throw new Error('Listener reappeared after correction');
        this.#owned(listener, plan, listenerCheckpoint.uid);
        await this.port.request(listenerPath, { method: 'DELETE' }, signal);
        if (await this.#read(listenerPath, signal)) throw new Error('Listener correction is still converging');
      }
      await this.storage.write(`ingress-checkpoint-${id}.json`, {
        ...listenerCheckpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
      const originPath =
        `/api/config/namespaces/${plan.material.originRequest.metadata.namespace}/origin_pools/` +
        plan.material.originRequest.metadata.name;
      const origin = await this.#read(originPath, signal);
      if (origin) {
        if (originCheckpoint.phase === 'deleted') throw new Error('Origin reappeared after correction');
        this.#ownedOrigin(origin, plan, originCheckpoint.uid);
        try {
          await this.port.request(originPath, { method: 'DELETE' }, signal);
        } catch (error) {
          if (!(error instanceof CeApiError && ['not-found', 'transient', 'deadline'].includes(error.category)))
            throw error;
        }
        if (await this.#read(originPath, signal)) throw new Error('Origin correction is still converging');
      }
      await this.storage.write(`ingress-origin-checkpoint-${id}.json`, {
        ...originCheckpoint,
        phase: 'deleted',
        observedAt: new Date().toISOString(),
      });
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
