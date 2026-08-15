import type { AzExecApi } from '../az/exec';
import { canonicalStringify } from './canonical';
import type {
  AzureCeObservation,
  AzureCeRegionObservation,
  AzureCeResourceObservation,
  AzureCeVmSizeObservation,
} from './types';

export interface AzureComputeDiscoveryInput {
  subscriptionId: string;
  publisher: string;
  offer: string;
  plan: string;
  version?: string;
  vmSize: string;
  requiredNics: number;
  nodeCount: 1 | 3;
  requireRouteServer?: boolean;
  deploymentName: string;
  resourceGroup: string;
  brownfieldResourceIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IMAGE_PART = /^[a-zA-Z0-9._-]+$/;
const RESOURCE_ID = /^\/subscriptions\/([^/]+)\//i;

function normalizeLocation(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function json<T>(api: AzExecApi, args: string[]): Promise<T> {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`Azure discovery command failed: az ${args.join(' ')}: ${result.stderr}`);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`Azure discovery returned invalid JSON for: az ${args.join(' ')}`);
  }
}

async function quotaAvailable(api: AzExecApi, region: string, subscriptionId: string): Promise<number | undefined> {
  const result = await api.exec('az', ['vm', 'list-usage', '--location', region, '--subscription', subscriptionId, '--output', 'json']);
  if (result.exitCode !== 0) return undefined;
  try {
    const usages = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    const cores = usages.find((usage) => String((usage.name as Record<string, unknown> | undefined)?.value ?? '').toLowerCase().includes('cores'));
    return Math.max(0, Number(cores?.limit ?? 0) - Number(cores?.currentValue ?? 0));
  } catch {
    return undefined;
  }
}

async function imageAvailable(api: AzExecApi, region: string, urn: string, subscriptionId: string): Promise<boolean | undefined> {
  const result = await api.exec('az', ['vm', 'image', 'show', '--location', region, '--urn', urn, '--subscription', subscriptionId, '--output', 'json']);
  if (result.exitCode === 0) return true;
  if (/not found|could not be found|invalid image reference|platform image/i.test(result.stderr)) return false;
  return undefined;
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function versionParts(version: string): Array<number | string> {
  return version.split(/[._-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function compareVersionDescending(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(bv).localeCompare(String(av));
  }
  return 0;
}

function capability(raw: Record<string, unknown>, name: string): string | undefined {
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities as Array<Record<string, unknown>> : [];
  return capabilities.find((item) => String(item.name).toLowerCase() === name.toLowerCase())?.value as string | undefined;
}

function skuForRegion(rawSkus: Array<Record<string, unknown>>, vmSize: string, region: string): AzureCeVmSizeObservation | undefined {
  let sku: Record<string, unknown> | undefined;
  let info: Record<string, unknown> | undefined;
  for (const candidate of rawSkus) {
    if (String(candidate.name).toLowerCase() !== vmSize.toLowerCase() || String(candidate.resourceType).toLowerCase() !== 'virtualmachines') continue;
    const candidateInfo = (Array.isArray(candidate.locationInfo) ? candidate.locationInfo as Array<Record<string, unknown>> : [])
      .find((item) => normalizeLocation(item.location) === region);
    if (candidateInfo) {
      sku = candidate;
      info = candidateInfo;
      break;
    }
  }
  if (!sku || !info) return undefined;
  const restrictions = Array.isArray(sku.restrictions) ? sku.restrictions as Array<Record<string, unknown>> : [];
  const restricted = restrictions.some((restriction) => {
    const locations = ((restriction.restrictionInfo as Record<string, unknown> | undefined)?.locations ?? restriction.locations) as unknown;
    return !Array.isArray(locations) || locations.length === 0 || locations.some((location) => normalizeLocation(location) === region);
  });
  return {
    name: String(sku.name),
    maxNics: Number(capability(sku, 'MaxNetworkInterfaces') ?? 0),
    vCpus: Number(capability(sku, 'vCPUs') ?? capability(sku, 'vCPUsAvailable') ?? 0),
    memoryGb: Number(capability(sku, 'MemoryGB') ?? 0),
    zones: (Array.isArray(info.zones) ? info.zones : []).map(String).sort(),
    restricted,
  };
}

function safeResourceState(raw: Record<string, unknown>): Record<string, unknown> {
  const properties = (raw.properties as Record<string, unknown> | undefined) ?? {};
  const type = String(raw.type ?? '').toLowerCase();
  if (type.endsWith('/routetables')) {
    return { routes: Array.isArray(properties.routes) ? properties.routes : [] };
  }
  if (type.endsWith('/subnets')) {
    return { routeTable: properties.routeTable ?? null, networkSecurityGroup: properties.networkSecurityGroup ?? null };
  }
  return { provisioningState: properties.provisioningState ?? null };
}

async function observeResource(api: AzExecApi, id: string, subscriptionId: string): Promise<AzureCeResourceObservation> {
  const groupMatch = /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)$/i.exec(id);
  const result = await api.exec('az', groupMatch
    ? ['group', 'show', '--name', groupMatch[1], '--subscription', subscriptionId, '--output', 'json']
    : ['resource', 'show', '--ids', id, '--subscription', subscriptionId, '--output', 'json']);
  if (result.exitCode !== 0) {
    if (/not found|could not be found|resourcegroupnotfound/i.test(result.stderr)) return { id: id.toLowerCase(), exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`Azure resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout) as Record<string, unknown>;
  const tags = (raw.tags as Record<string, string> | undefined) ?? {};
  return {
    id: String(raw.id ?? id).toLowerCase(),
    location: typeof raw.location === 'string' ? normalizeLocation(raw.location) : undefined,
    exists: true,
    etag: typeof raw.etag === 'string' ? raw.etag : undefined,
    owned: tags['xcsh-managed-by'] === 'azure-ce',
    tags,
    state: safeResourceState(raw),
  };
}

function validateInput(input: AzureComputeDiscoveryInput): void {
  if (!UUID.test(input.subscriptionId)) throw new Error('subscriptionId must be a valid UUID');
  for (const [label, value] of [['publisher', input.publisher], ['offer', input.offer], ['plan', input.plan], ['vmSize', input.vmSize]] as const) {
    if (!SAFE_IMAGE_PART.test(value) || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains unsupported characters`);
  }
  if (input.version?.toLowerCase() === 'latest') throw new Error('The image version latest is forbidden');
  if (input.requiredNics < 1 || input.requiredNics > 8) throw new Error('requiredNics must be between 1 and 8');
  if (input.nodeCount !== 1 && input.nodeCount !== 3) throw new Error('nodeCount must be one or three');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(input.deploymentName)) throw new Error('deploymentName contains unsupported characters');
  if (!/^[a-zA-Z0-9._()-]+$/.test(input.resourceGroup)) throw new Error('resourceGroup contains unsupported characters');
  for (const id of input.brownfieldResourceIds) {
    const match = RESOURCE_ID.exec(id);
    if (!match) throw new Error(`Invalid Azure resource ID: ${id}`);
    if (match[1].toLowerCase() !== input.subscriptionId.toLowerCase()) throw new Error(`Brownfield resource is in a different subscription: ${id}`);
  }
}

export async function discoverAzureCompute(input: AzureComputeDiscoveryInput, api: AzExecApi): Promise<AzureCeObservation> {
  validateInput(input);
  const subscriptionId = input.subscriptionId.toLowerCase();
  const [account, locations, rawImages, rawSkus, provider, policies] = await Promise.all([
    json<Record<string, unknown>>(api, ['account', 'show', '--subscription', subscriptionId]),
    json<{ value?: Array<Record<string, unknown>> }>(api, ['rest', '--method', 'get', '--url', `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`]),
    json<Array<Record<string, unknown>>>(api, ['vm', 'image', 'list', '--publisher', input.publisher, '--offer', input.offer, '--sku', input.plan, '--all', '--subscription', subscriptionId]),
    json<Array<Record<string, unknown>>>(api, ['vm', 'list-skus', '--all', '--subscription', subscriptionId]),
    json<Record<string, unknown>>(api, ['provider', 'show', '--namespace', 'Microsoft.Network', '--subscription', subscriptionId]),
    json<Array<Record<string, unknown>>>(api, ['policy', 'state', 'list', '--subscription', subscriptionId]),
  ]);
  if (String(account.id).toLowerCase() !== subscriptionId) throw new Error('Azure CLI returned a different subscription');
  if (String(account.environmentName) !== 'AzureCloud') throw new Error('Only AzureCloud subscriptions are supported');

  const images = rawImages
    .filter((image) => String(image.version).toLowerCase() !== 'latest')
    .filter((image) => !input.version || String(image.version) === input.version)
    .sort((a, b) => compareVersionDescending(String(a.version), String(b.version)) || canonicalStringify(a).localeCompare(canonicalStringify(b)));
  const selected = images[0];
  if (!selected) throw new Error('No exact F5 CE image version is available for the requested publisher/offer/plan');
  const urn = String(selected.urn ?? `${input.publisher}:${input.offer}:${input.plan}:${String(selected.version)}`);
  const terms = await json<Record<string, unknown>>(api, ['vm', 'image', 'terms', 'show', '--urn', urn, '--subscription', subscriptionId]);

  const routeServerLocations = new Set<string>();
  const resourceTypes = Array.isArray(provider.resourceTypes) ? provider.resourceTypes as Array<Record<string, unknown>> : [];
  for (const type of resourceTypes) {
    if (!['virtualhubs', 'routeservers'].includes(String(type.resourceType).toLowerCase())) continue;
    for (const location of Array.isArray(type.locations) ? type.locations : []) routeServerLocations.add(normalizeLocation(location));
  }
  const physicalRegions = (locations.value ?? [])
    .filter((location) => String((location.metadata as Record<string, unknown> | undefined)?.regionType ?? 'Physical') === 'Physical')
    .map((location) => normalizeLocation(location.name))
    .filter(Boolean);
  const imageLocations = new Set<string>((Array.isArray(selected.locations) ? selected.locations : []).map(normalizeLocation));
  const imageAvailability = new Map<string, boolean | undefined>();
  if (imageLocations.size === 0) {
    const availabilityPairs = await mapLimit(physicalRegions, 8, async (region) => [region, await imageAvailable(api, region, urn, subscriptionId)] as const);
    for (const [region, available] of availabilityPairs) imageAvailability.set(region, available);
  }
  const quotaPairs = await mapLimit(physicalRegions, 8, async (region) => [region, await quotaAvailable(api, region, subscriptionId)] as const);
  const quotas = new Map(quotaPairs);

  const resourceGroupId = `/subscriptions/${subscriptionId}/resourceGroups/${input.resourceGroup}`;
  const observedIds = [...new Set([...input.brownfieldResourceIds, resourceGroupId])].sort();
  const resourceObservations = await Promise.all(observedIds.map((id) => observeResource(api, id, subscriptionId)));
  const ownedRaw = await json<Array<Record<string, unknown>>>(api, ['resource', 'list', '--tag', `xcsh-deployment-id=${input.deploymentName}`, '--subscription', subscriptionId]);
  for (const raw of ownedRaw) {
    const tags = (raw.tags as Record<string, string> | undefined) ?? {};
    const item: AzureCeResourceObservation = {
      id: String(raw.id ?? '').toLowerCase(), location: typeof raw.location === 'string' ? normalizeLocation(raw.location) : undefined,
      exists: true, etag: typeof raw.etag === 'string' ? raw.etag : undefined,
      owned: tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === input.deploymentName,
      tags, state: safeResourceState(raw),
    };
    if (item.id && !resourceObservations.some((resource) => resource.id === item.id)) resourceObservations.push(item);
  }
  const proximity = new Map<string, number>();
  for (const resource of resourceObservations) {
    if (resource.location && input.brownfieldResourceIds.some((id) => id.toLowerCase() === resource.id)) {
      proximity.set(resource.location, (proximity.get(resource.location) ?? 0) + 1);
    }
  }

  const preliminary: AzureCeRegionObservation[] = physicalRegions.map((region) => {
    const vmSize = skuForRegion(rawSkus, input.vmSize, region);
    const policyDenied = policies.some((policy) =>
      String(policy.complianceState).toLowerCase() === 'noncompliant'
      && String(policy.policyDefinitionAction ?? policy.effect).toLowerCase() === 'deny'
      && (!policy.resourceLocation || normalizeLocation(policy.resourceLocation) === region));
    const reasons: string[] = [];
    const blockers: string[] = [];
    if (imageLocations.size > 0 && !imageLocations.has(region)) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === false) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === undefined) blockers.push('image-observation-failed');
    if (!vmSize) blockers.push('vm-size-unavailable');
    else {
      if (vmSize.restricted) blockers.push('sku-restricted');
      if (vmSize.maxNics < input.requiredNics) blockers.push('nic-limit');
      if (vmSize.vCpus < 8 || vmSize.memoryGb < 32) blockers.push('ce-minimum-size');
      if (input.nodeCount === 3 && vmSize.zones.length < 3) reasons.push('fewer-than-three-zones');
    }
    const quota = quotas.get(region);
    if (quota === undefined) blockers.push('quota-observation-failed');
    else if (quota < (vmSize?.vCpus ?? 1) * input.nodeCount) blockers.push('quota');
    if (policyDenied) blockers.push('policy-deny');
    if (input.requireRouteServer && !routeServerLocations.has(region)) blockers.push('route-server-unavailable');
    reasons.unshift(...blockers);
    return {
      name: region,
      rank: 0,
      eligible: blockers.length === 0,
      reasons,
      zones: vmSize?.zones ?? [],
      routeServerSupported: routeServerLocations.has(region),
      quotaAvailable: quota ?? 0,
      policyAllowed: !policyDenied,
      vmSizes: vmSize ? [vmSize] : [],
      proximity: proximity.get(region) ?? 0,
    };
  });
  preliminary.sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.proximity ?? 0) - (a.proximity ?? 0) || a.reasons.length - b.reasons.length || a.name.localeCompare(b.name));
  preliminary.forEach((region, index) => { region.rank = index + 1; });
  return {
    schemaVersion: 1,
    subscription: { id: subscriptionId, tenantId: String(account.tenantId ?? ''), cloud: 'AzureCloud' },
    image: {
      publisher: input.publisher,
      offer: input.offer,
      plan: String(terms.plan ?? input.plan),
      version: String(selected.version),
      urn,
      termsAccepted: Boolean(terms.accepted),
    },
    regions: preliminary,
    resources: resourceObservations,
  };
}
