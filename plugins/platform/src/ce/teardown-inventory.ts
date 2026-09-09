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
