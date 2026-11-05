import { CeApiError, type CeOwner, type SiteBinding } from './runtime';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed teardown inventory');
  return value as Json;
};
const name = (value: unknown) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const ownerLabels = (owner: CeOwner) => ({
  'xcsh-ce-deployment': owner.deploymentId,
  'xcsh-ce-engine': owner.engine,
  'xcsh-ce-provider': owner.provider,
  'xcsh-ce-account': owner.account,
  'xcsh-ce-region': owner.region,
});
export interface CeTeardownResource {
  kind: 'tokens' | 'http_loadbalancers' | 'origin_pools' | 'bgps' | 'bgp_routing_policys' | 'external_connectors';
  name: string;
  namespace: string;
  uid: string;
  siteName?: string;
  siteUid?: string;
  node?: string;
  ingressPlanId?: string;
}
interface Port {
  request(path: string, init?: RequestInit, signal?: AbortSignal): Promise<Json>;
}
function validateScope(bindings: SiteBinding[], namespaces: string[], contracts: { site: string; ingress: string }) {
  const owner = bindings?.[0]?.owner;
  if (
    !owner ||
    !name(owner.deploymentId) ||
    !['native', 'terraform'].includes(owner.engine) ||
    !['aws', 'azure'].includes(owner.provider) ||
    !text(owner.account) ||
    !text(owner.region) ||
    !Array.isArray(bindings) ||
    !bindings.length ||
    bindings.length > 32 ||
    !Array.isArray(namespaces) ||
    !namespaces.length ||
    namespaces.length > 128 ||
    namespaces.some((value) => !name(value)) ||
    new Set(namespaces).size !== namespaces.length ||
    !text(contracts.site) ||
    !text(contracts.ingress)
  )
    throw new Error('Invalid teardown inventory scope');
  const labels = ownerLabels(owner),
    sites = new Set<string>(),
    nodes = new Map<string, string>();
  for (const binding of bindings) {
    if (
      !name(binding.siteName) ||
      sites.has(binding.siteName) ||
      Object.keys(ownerLabels(binding.owner)).some(
        (key) => ownerLabels(binding.owner)[key as keyof typeof labels] !== labels[key as keyof typeof labels],
      ) ||
      !Array.isArray(binding.nodes) ||
      ![1, 3].includes(binding.nodes.length)
    )
      throw new Error('Invalid teardown site scope');
    sites.add(binding.siteName);
    for (const node of binding.nodes) {
      if (!name(node) || nodes.has(node)) throw new Error('Invalid teardown node scope');
      nodes.set(node, binding.siteName);
    }
  }
  return { owner, labels, nodes };
}
/** Read-only inventory for registered deployments. Never return specs, annotations, or enrollment content. */
export async function collectCeTeardownInventory(
  port: Port,
  input: SiteBinding[],
  namespaces: string[],
  contracts: { site: string; ingress: string },
  signal?: AbortSignal,
) {
  const bindings = structuredClone(input);
  namespaces = structuredClone(namespaces);
  contracts = structuredClone(contracts);
  const { owner, labels, nodes } = validateScope(bindings, namespaces, contracts);
  signal?.throwIfAborted();
  const sources: string[] = [];
  const base = {
    owner,
    siteContractFingerprint: contracts.site,
    ingressContractFingerprint: contracts.ingress,
    startedAt: new Date().toISOString(),
  };
  const read = async (path: string) => {
    signal?.throwIfAborted();
    sources.push(path);
    return object(await port.request(path, {}, signal));
  };
  const owned = (actual: unknown) => {
    const row = object(actual);
    if (Object.entries(labels).some(([key, value]) => row[key] !== value))
      throw new Error('Inventory ownership differs');
    return row;
  };
  const readSite = async (binding: SiteBinding, physical: boolean) => {
    const value = await read(
      `/api/config/namespaces/system/${physical ? 'sites' : 'securemesh_site_v2s'}/${binding.siteName}`,
    );
    const metadata = object(value.metadata),
      uid = object(value.system_metadata).uid;
    owned(metadata.labels);
    if (metadata.name !== binding.siteName || metadata.namespace !== 'system' || !text(uid))
      throw new Error('Site inventory identity differs');
    if (physical) {
      const observed = object(value.spec).main_nodes;
      if (
        !Array.isArray(observed) ||
        observed.length !== binding.nodes.length ||
        new Set(observed.map((row) => object(row).name)).size !== observed.length ||
        observed.some((row) => !binding.nodes.includes(String(object(row).name)))
      )
        throw new Error('Physical node inventory differs');
    }
    return uid;
  };
  try {
    const identities = [];
    for (const binding of bindings)
      identities.push({
        siteName: binding.siteName,
        siteUid: await readSite(binding, false),
        physicalSiteUid: await readSite(binding, true),
      });
    const resources: CeTeardownResource[] = [],
      seen = new Set<string>(),
      uids = new Set(identities.flatMap((row) => [row.siteUid, row.physicalSiteUid]));
    if (uids.size !== identities.length * 2) throw new Error('Duplicate site UID');
    const collections: Array<{ kind: CeTeardownResource['kind']; namespace: string; prefix: string }> = [
      { kind: 'tokens', namespace: 'system', prefix: 'register' },
      { kind: 'bgps', namespace: 'system', prefix: 'config' },
      { kind: 'bgp_routing_policys', namespace: 'system', prefix: 'config' },
      { kind: 'external_connectors', namespace: 'system', prefix: 'config' },
      ...namespaces.flatMap((namespace) => [
        { kind: 'http_loadbalancers' as const, namespace, prefix: 'config' },
        { kind: 'origin_pools' as const, namespace, prefix: 'config' },
      ]),
    ];
    for (const { kind, namespace, prefix } of collections) {
      const query = new URLSearchParams({ label_filter: `xcsh-ce-deployment=${owner.deploymentId}` });
      const response = await read(`/api/${prefix}/namespaces/${namespace}/${kind}?${query}`);
      if (
        !Array.isArray(response.items) ||
        response.items.length > 10000 ||
        (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)) ||
        Object.keys(response).some((key) => !['items', 'errors'].includes(key))
      )
        throw new Error('Incomplete teardown collection');
      for (const item of response.items) {
        const row = object(item),
          rowLabels = owned(row.labels),
          key = `${namespace}/${kind}/${row.name}`;
        if (!name(row.name) || row.namespace !== namespace || !text(row.uid) || seen.has(key) || uids.has(row.uid))
          throw new Error('Invalid or duplicate teardown resource');
        const metadata = row.metadata === undefined || row.metadata === null ? {} : object(row.metadata),
          system = row.system_metadata === undefined || row.system_metadata === null ? {} : object(row.system_metadata);
        if (
          ['name', 'namespace'].some(
            (key) => metadata[key] !== undefined && metadata[key] !== '' && metadata[key] !== row[key],
          ) ||
          (system.uid !== undefined && system.uid !== '' && system.uid !== row.uid)
        )
          throw new Error('Conflicting flat and nested inventory identities');
        if (metadata.labels !== undefined && Object.keys(object(metadata.labels)).length) owned(metadata.labels);
        const selected: CeTeardownResource = { kind, name: row.name as string, namespace, uid: row.uid };
        if (kind === 'tokens') {
          const node = rowLabels['xcsh-ce-node'];
          if (typeof node !== 'string' || !nodes.has(node)) throw new Error('Unknown token node');
          selected.node = node;
          selected.siteName = nodes.get(node);
        }
        if (kind === 'bgps' || kind === 'bgp_routing_policys' || kind === 'external_connectors') {
          const siteName = rowLabels['xcsh-ce-site'],
            siteUid = rowLabels['xcsh-ce-site-uid'];
          if (
            typeof siteName !== 'string' ||
            !identities.some((site) => site.siteName === siteName && site.siteUid === siteUid)
          )
            throw new Error('Routing site binding differs');
          selected.siteName = siteName;
          selected.siteUid = String(siteUid);
        }
        if (kind === 'http_loadbalancers') {
          const id = rowLabels['xcsh-ce-ingress-plan'];
          if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) throw new Error('Listener plan identity missing');
          selected.ingressPlanId = id;
        }
        seen.add(key);
        uids.add(row.uid);
        resources.push(selected);
      }
    }
    for (const [bindingIndex, binding] of bindings.entries())
      if (
        (await readSite(binding, false)) !== identities[bindingIndex].siteUid ||
        (await readSite(binding, true)) !== identities[bindingIndex].physicalSiteUid
      )
        throw new Error('Site identity changed during inventory');
    return {
      ...base,
      status: 'observed' as const,
      resources,
      sites: identities,
      sources,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown' as const,
      reason: error instanceof CeApiError ? error.category : 'ownership-or-collection-incomplete',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}

/** Separate pre-registration evidence. Absence never supplies a fabricated registered identity.
 * Any object at an expected site locator, or any selected platform resource, blocks this path.
 */
export async function collectCeUnregisteredAbsence(
  port: Port,
  input: SiteBinding[],
  namespaces: string[],
  contracts: { site: string; ingress: string },
  signal?: AbortSignal,
) {
  const bindings = structuredClone(input);
  namespaces = structuredClone(namespaces);
  contracts = structuredClone(contracts);
  const { owner } = validateScope(bindings, namespaces, contracts);
  signal?.throwIfAborted();
  const sources: string[] = [];
  const base = {
    owner,
    siteContractFingerprint: contracts.site,
    ingressContractFingerprint: contracts.ingress,
    startedAt: new Date().toISOString(),
  };
  const read = async (path: string) => {
    signal?.throwIfAborted();
    sources.push(path);
    return object(await port.request(path, {}, signal));
  };
  const empty = (value: Json) => {
    if (
      !Array.isArray(value.items) ||
      value.items.length ||
      (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length)) ||
      Object.keys(value).some((key) => !['items', 'errors'].includes(key))
    )
      throw new Error('Unregistered collection is present or incomplete');
  };
  try {
    // Recheck the entire scope: a registration or resource appearing during collection blocks cleanup.
    for (let pass = 0; pass < 2; pass++) {
      for (const binding of bindings) {
        for (const kind of ['securemesh_site_v2s', 'sites']) {
          try {
            await read(`/api/config/namespaces/system/${kind}/${binding.siteName}`);
          } catch (error) {
            if (error instanceof CeApiError && error.category === 'not-found') continue;
            throw error;
          }
          throw new Error('Site is present; registered retirement identity is required');
        }
        empty(await read(`/api/register/namespaces/system/registrations_by_site/${binding.siteName}`));
      }
      const collections = [
        { prefix: 'register', namespace: 'system', kind: 'tokens' },
        ...['bgps', 'bgp_routing_policys', 'external_connectors'].map((kind) => ({
          prefix: 'config',
          namespace: 'system',
          kind,
        })),
        ...namespaces.flatMap((namespace) =>
          ['http_loadbalancers', 'origin_pools'].map((kind) => ({ prefix: 'config', namespace, kind })),
        ),
      ];
      const query = new URLSearchParams({ label_filter: `xcsh-ce-deployment=${owner.deploymentId}` });
      for (const { prefix, namespace, kind } of collections)
        empty(await read(`/api/${prefix}/namespaces/${namespace}/${kind}?${query}`));
    }
    return { ...base, status: 'absent' as const, sources, observedAt: new Date().toISOString() };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown' as const,
      reason: error instanceof CeApiError ? error.category : 'presence-or-collection-incomplete',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}

/** Read-only pre-admission identities. Physical registration requires the registered contract. */
export async function collectCePendingAdmissionInventory(
  port: Port,
  input: SiteBinding[],
  namespaces: string[],
  contracts: { site: string; ingress: string },
  signal?: AbortSignal,
) {
  return collectPendingInventory(port, input, namespaces, contracts, false, signal);
}
/** Separate pre-registration contract for an owned generated physical site with no nodes. */
export async function collectCePreRegistrationInventory(
  port: Port,
  input: SiteBinding[],
  namespaces: string[],
  contracts: { site: string; ingress: string },
  signal?: AbortSignal,
) {
  return collectPendingInventory(port, input, namespaces, contracts, true, signal);
}
async function collectPendingInventory(
  port: Port,
  input: SiteBinding[],
  namespaces: string[],
  contracts: { site: string; ingress: string },
  allowGeneratedPhysical: boolean,
  signal?: AbortSignal,
) {
  const bindings = structuredClone(input);
  namespaces = structuredClone(namespaces);
  contracts = structuredClone(contracts);
  const { owner, labels, nodes } = validateScope(bindings, namespaces, contracts);
  signal?.throwIfAborted();
  const sources: string[] = [];
  const base = {
    owner,
    siteContractFingerprint: contracts.site,
    ingressContractFingerprint: contracts.ingress,
    startedAt: new Date().toISOString(),
  };
  const read = async (path: string) => {
    signal?.throwIfAborted();
    sources.push(path);
    return object(await port.request(path, {}, signal));
  };
  const owned = (value: unknown) => {
    const row = object(value);
    if (Object.entries(labels).some(([key, value]) => row[key] !== value))
      throw new Error('Pending admission ownership differs');
    return row;
  };
  const collection = (value: Json) => {
    if (
      !Array.isArray(value.items) ||
      value.items.length > 10000 ||
      (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length)) ||
      Object.keys(value).some((key) => !['items', 'errors'].includes(key))
    )
      throw new Error('Incomplete pending admission collection');
    return value.items;
  };
  const physicalIdentity = async (path: string): Promise<string | null> => {
    let value: Json;
    try {
      value = await read(path);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return null;
      throw error;
    }
    if (!allowGeneratedPhysical) throw new Error('Physical site is present');
    const metadata = object(value.metadata),
      system = object(value.system_metadata),
      spec = object(value.spec);
    owned(metadata.labels);
    if (
      metadata.namespace !== 'system' ||
      path !== `/api/config/namespaces/system/sites/${metadata.name}` ||
      !text(system.uid) ||
      system.creator_class !== 'akar' ||
      spec.site_type !== 'CUSTOMER_EDGE' ||
      spec.site_state !== 'WAITING_FOR_REGISTRATION' ||
      !Array.isArray(spec.main_nodes) ||
      spec.main_nodes.length
    )
      throw new Error('Pre-registration physical identity differs');
    return system.uid;
  };
  const snapshot = async () => {
    const sites: Array<{ siteName: string; siteUid: string | null; physicalSiteUid: string | null }> = [];
    const resources: CeTeardownResource[] = [];
    const uids = new Set<string>(),
      names = new Set<string>();
    for (const binding of bindings) {
      let siteUid: string | null = null;
      let value: Json | undefined;
      try {
        value = await read(`/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`);
      } catch (error) {
        if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
      }
      if (value) {
        const metadata = object(value.metadata),
          uid = object(value.system_metadata).uid;
        owned(metadata.labels);
        if (metadata.name !== binding.siteName || metadata.namespace !== 'system' || !text(uid) || uids.has(uid))
          throw new Error('Pending logical site identity differs');
        siteUid = uid;
        uids.add(uid);
      }
      const physicalSiteUid = await physicalIdentity(`/api/config/namespaces/system/sites/${binding.siteName}`);
      if (physicalSiteUid !== null) {
        if (uids.has(physicalSiteUid)) throw new Error('Duplicate pre-registration physical UID');
        uids.add(physicalSiteUid);
      }
      sites.push({ siteName: binding.siteName, siteUid, physicalSiteUid });
      if (collection(await read(`/api/register/namespaces/system/registrations_by_site/${binding.siteName}`)).length)
        throw new Error('Registration is present');
    }
    const query = new URLSearchParams({ label_filter: `xcsh-ce-deployment=${owner.deploymentId}` });
    const tokens = collection(await read(`/api/register/namespaces/system/tokens?${query}`));
    for (const item of tokens) {
      const row = object(item),
        rowLabels = owned(row.labels),
        node = rowLabels['xcsh-ce-node'];
      if (
        !name(row.name) ||
        row.namespace !== 'system' ||
        !text(row.uid) ||
        names.has(String(row.name)) ||
        uids.has(row.uid) ||
        typeof node !== 'string' ||
        !nodes.has(node)
      )
        throw new Error('Pending token identity differs');
      const metadata = row.metadata == null ? {} : object(row.metadata);
      const system = row.system_metadata == null ? {} : object(row.system_metadata);
      if (
        ['name', 'namespace'].some(
          (key) => metadata[key] !== undefined && metadata[key] !== '' && metadata[key] !== row[key],
        ) ||
        (system.uid !== undefined && system.uid !== '' && system.uid !== row.uid)
      )
        throw new Error('Conflicting pending token identities');
      if (metadata.labels !== undefined && Object.keys(object(metadata.labels)).length) {
        const nested = owned(metadata.labels);
        if (nested['xcsh-ce-node'] !== node) throw new Error('Conflicting pending token node');
      }
      resources.push({
        kind: 'tokens',
        name: row.name as string,
        namespace: 'system',
        uid: row.uid,
        node,
        siteName: nodes.get(node),
      });
      names.add(String(row.name));
      uids.add(row.uid);
    }
    const collections = [
      ...['bgps', 'bgp_routing_policys', 'external_connectors'].map((kind) => ({ namespace: 'system', kind })),
      ...namespaces.flatMap((namespace) => ['http_loadbalancers', 'origin_pools'].map((kind) => ({ namespace, kind }))),
    ];
    for (const { namespace, kind } of collections)
      if (collection(await read(`/api/config/namespaces/${namespace}/${kind}?${query}`)).length)
        throw new Error('Post-admission resource is present');
    sites.sort((a, b) => a.siteName.localeCompare(b.siteName));
    resources.sort((a, b) => a.name.localeCompare(b.name));
    return { sites, resources };
  };
  try {
    const first = await snapshot(),
      second = await snapshot();
    if (JSON.stringify(first) !== JSON.stringify(second))
      throw new Error('Pending inventory changed during collection');
    return { ...base, status: 'observed' as const, ...second, sources, observedAt: new Date().toISOString() };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown' as const,
      reason: error instanceof CeApiError ? error.category : 'ownership-or-collection-incomplete',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}
