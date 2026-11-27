// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { canonicalStringify, sha256Hex } from './runtime-6j4b2rhv.js';
import {
  AZURE_CE_SCHEMA_VERSION,
  AZURE_CE_SHARED_CONTRACT_URL,
  classifyAzureImageHardwareCompatibility,
  readAzureImageHardware,
  readAzureSkuHardware,
} from './runtime-34064jyj.js';

// plugins/azure/src/ce/discovery.ts
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var SAFE_IMAGE_PART = /^[a-zA-Z0-9._-]+$/;
var RESOURCE_ID = /^\/subscriptions\/([^/]+)\//i;
var F5_CE_PUBLISHER = 'f5-networks';
var F5_CE_OFFER = 'f5xc_customer_edge';
var OFFICIAL_SOURCES = [
  'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-az-clickops',
  'https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage',
  'https://learn.microsoft.com/en-us/cli/azure/vm#az-vm-list-skus',
];
function normalizeResearchDocument(body) {
  let source = body
    .replace(/^\uFEFF/, '')
    .replace(
      /\r\n?/g,
      `
`,
    )
    .normalize('NFC');
  if (/<html(?:\s|>)/i.test(source)) {
    const open = /<main\b[^>]*>/i.exec(source);
    const close = open ? source.toLowerCase().indexOf('</main>', open.index + open[0].length) : -1;
    if (!open || close < 0) throw new Error('Official HTML research document has no complete main content');
    source = source
      .slice(open.index + open[0].length, close)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(
        /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi,
        (_tag, _quote, href) => `
link:${href}
`,
      )
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const source = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
        const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
        return `
image:${source}:${alt}
`;
      })
      .replace(
        /<[^>]+>/g,
        `
`,
      )
      .split(`
`)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(`
`);
  }
  const normalized = source
    .split(`
`)
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join(`
`)
    .trimEnd();
  return `${normalized}
`;
}
async function verifyOfficialSources(fetcher) {
  const sourceUrls = [...OFFICIAL_SOURCES, AZURE_CE_SHARED_CONTRACT_URL];
  const sourceReceipts = await Promise.all(
    sourceUrls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'xcsh-azure-ce-research/3' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        if (body.trim().length < 100) throw new Error('response was empty');
        const normalized = normalizeResearchDocument(body);
        if (
          url === AZURE_CE_SHARED_CONTRACT_URL &&
          (!/^contract_id: f5xc-ce-automation-policy$/m.test(normalized) ||
            !/^contract_version: v2$/m.test(normalized) ||
            !normalized.includes('f5xc-ce-automation-policy/v2'))
        )
          throw new Error('document did not advertise f5xc-ce-automation-policy/v2');
        return { url, normalizedSha256: sha256Hex(normalized) };
      } catch (error) {
        throw new Error(
          `Official CE research failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  sourceReceipts.sort((left, right) => left.url.localeCompare(right.url));
  const contract = sourceReceipts.find((receipt) => receipt.url === AZURE_CE_SHARED_CONTRACT_URL);
  if (!contract) throw new Error('Shared Customer Edge automation contract receipt is unavailable');
  return {
    method: 'azure-cli-live',
    officialSourceRetrieval: 'live',
    catalogRegion: '',
    commands: [],
    officialSources: [...OFFICIAL_SOURCES],
    sourceReceipts,
    sharedContract: {
      url: AZURE_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation-policy',
      contractVersion: 'v2',
      normalizedSha256: contract.normalizedSha256,
    },
  };
}
function normalizeLocation(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
async function json(api, args) {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`Azure discovery command failed: az ${args.join(' ')}: ${result.stderr}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Azure discovery returned invalid JSON for: az ${args.join(' ')}`);
  }
}
async function quotaAvailable(api, region, subscriptionId) {
  const result = await api.exec('az', [
    'vm',
    'list-usage',
    '--location',
    region,
    '--subscription',
    subscriptionId,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) return;
  try {
    const usages = JSON.parse(result.stdout);
    const cores = usages.find((usage) => String(usage.name?.value ?? '').toLowerCase() === 'cores');
    const limit = Number(cores?.limit);
    const current = Number(cores?.currentValue);
    return Number.isFinite(limit) && Number.isFinite(current) ? Math.max(0, limit - current) : undefined;
  } catch {
    return;
  }
}
async function imageAvailable(api, region, urn, subscriptionId, hardware) {
  const result = await api.exec('az', [
    'vm',
    'image',
    'show',
    '--location',
    region,
    '--urn',
    urn,
    '--subscription',
    subscriptionId,
    '--output',
    'json',
  ]);
  if (result.exitCode === 0) {
    try {
      const observed = readAzureImageHardware(JSON.parse(result.stdout), { subscriptionId, region, urn });
      if (observed.architecture === 'unknown' || observed.hyperVGeneration === 'unknown') return;
      return observed.architecture === hardware.architecture && observed.hyperVGeneration === hardware.hyperVGeneration
        ? true
        : undefined;
    } catch {
      return;
    }
  }
  if (/not found|could not be found|invalid image reference|platform image/i.test(result.stderr)) return false;
  return;
}
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
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
function versionParts(version) {
  return version.split(/[._-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}
function compareVersionDescending(left, right) {
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
function exactName(items, expected) {
  return items
    .map((item) => String(item.name ?? ''))
    .filter((name) => name.toLowerCase() === expected.toLowerCase())
    .sort((left, right) => left.localeCompare(right))[0];
}
async function resolveMarketplaceImage(api, regions, subscriptionId, input) {
  const requestedPublisher = input.publisher ?? F5_CE_PUBLISHER;
  const requestedOffer = input.offer ?? F5_CE_OFFER;
  for (const region of regions) {
    let publishers;
    try {
      publishers = await json(api, [
        'vm',
        'image',
        'list-publishers',
        '--location',
        region,
        '--subscription',
        subscriptionId,
      ]);
    } catch {
      continue;
    }
    const publisher = exactName(publishers, requestedPublisher);
    if (!publisher) continue;
    const offers = await json(api, [
      'vm',
      'image',
      'list-offers',
      '--location',
      region,
      '--publisher',
      publisher,
      '--subscription',
      subscriptionId,
    ]);
    const offer = exactName(offers, requestedOffer);
    if (!offer) continue;
    const rawPlans = await json(api, [
      'vm',
      'image',
      'list-skus',
      '--location',
      region,
      '--publisher',
      publisher,
      '--offer',
      offer,
      '--subscription',
      subscriptionId,
    ]);
    const plans = rawPlans
      .map((item) => String(item.name ?? ''))
      .filter(Boolean)
      .filter((name) => (input.plan ? name.toLowerCase() === input.plan.toLowerCase() : /crt-/i.test(name)))
      .sort(compareVersionDescending);
    for (const plan of plans) {
      const images = await json(api, [
        'vm',
        'image',
        'list',
        '--location',
        region,
        '--publisher',
        publisher,
        '--offer',
        offer,
        '--sku',
        plan,
        '--all',
        '--subscription',
        subscriptionId,
      ]);
      const selected = images
        .filter((image) => String(image.version).toLowerCase() !== 'latest')
        .filter((image) => !input.version || String(image.version) === input.version)
        .sort(
          (left, right) =>
            compareVersionDescending(String(left.version), String(right.version)) ||
            canonicalStringify(left).localeCompare(canonicalStringify(right)),
        )[0];
      if (!selected) continue;
      const version = String(selected.version);
      return {
        catalogRegion: region,
        publisher: String(selected.publisher ?? publisher),
        offer: String(selected.offer ?? offer),
        plan: String(selected.sku ?? plan),
        version,
        urn: String(selected.urn ?? `${publisher}:${offer}:${plan}:${version}`),
        locations: Array.isArray(selected.locations) ? selected.locations : [],
      };
    }
  }
  throw new Error('No live F5 CE Marketplace image matched the requested hints in any permitted AzureCloud region');
}
function capability(raw, name) {
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  return capabilities.find((item) => String(item.name).toLowerCase() === name.toLowerCase())?.value;
}
function compareVmSize(left, right) {
  return (
    Number(left.restricted) - Number(right.restricted) ||
    left.vCpus - right.vCpus ||
    left.memoryGb - right.memoryGb ||
    left.maxNics - right.maxNics ||
    left.name.localeCompare(right.name)
  );
}
function skusForRegion(rawSkus, requestedSize, region) {
  const byName = new Map();
  for (const sku of rawSkus) {
    const name = String(sku.name ?? '');
    if (!name || String(sku.resourceType).toLowerCase() !== 'virtualmachines') continue;
    if (requestedSize && name.toLowerCase() !== requestedSize.toLowerCase()) continue;
    const info = (Array.isArray(sku.locationInfo) ? sku.locationInfo : []).find(
      (item) => normalizeLocation(item.location) === region,
    );
    if (!info) continue;
    const restrictions = Array.isArray(sku.restrictions) ? sku.restrictions : [];
    const restricted = restrictions.some((restriction) => {
      const locations = restriction.restrictionInfo?.locations ?? restriction.locations;
      return (
        !Array.isArray(locations) ||
        locations.length === 0 ||
        locations.some((location) => normalizeLocation(location) === region)
      );
    });
    const observation = {
      name,
      ...readAzureSkuHardware(sku),
      maxNics: Number(capability(sku, 'MaxNetworkInterfaces') ?? 0),
      vCpus: Number(capability(sku, 'vCPUs') ?? capability(sku, 'vCPUsAvailable') ?? 0),
      memoryGb: Number(capability(sku, 'MemoryGB') ?? 0),
      zones: (Array.isArray(info.zones) ? info.zones : []).map(String).sort(),
      restricted,
    };
    const existing = byName.get(name.toLowerCase());
    if (
      existing &&
      canonicalStringify({ architecture: existing.architecture, hyperVGenerations: existing.hyperVGenerations }) !==
        canonicalStringify(readAzureSkuHardware(sku))
    ) {
      byName.set(name.toLowerCase(), { ...existing, architecture: 'unknown', hyperVGenerations: undefined });
      continue;
    }
    if (!existing || canonicalStringify(observation).localeCompare(canonicalStringify(existing)) < 0)
      byName.set(name.toLowerCase(), observation);
  }
  return [...byName.values()].sort(compareVmSize);
}
function safeResourceState(raw) {
  const properties = raw.properties ?? {};
  const type = String(raw.type ?? '').toLowerCase();
  if (type.endsWith('/routetables')) {
    return { routes: Array.isArray(properties.routes) ? properties.routes : [] };
  }
  if (type.endsWith('/subnets')) {
    return { routeTable: properties.routeTable ?? null, networkSecurityGroup: properties.networkSecurityGroup ?? null };
  }
  return { provisioningState: properties.provisioningState ?? null };
}
async function observeResource(api, id, subscriptionId) {
  const groupMatch = /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)$/i.exec(id);
  const result = await api.exec(
    'az',
    groupMatch
      ? ['group', 'show', '--name', groupMatch[1], '--subscription', subscriptionId, '--output', 'json']
      : ['resource', 'show', '--ids', id, '--subscription', subscriptionId, '--output', 'json'],
  );
  if (result.exitCode !== 0) {
    if (/not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return { id: id.toLowerCase(), exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`Azure resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout);
  const tags = raw.tags ?? {};
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
function validateInput(input) {
  if (!UUID.test(input.subscriptionId)) throw new Error('subscriptionId must be a valid UUID');
  for (const [label, value] of [
    ['publisher', input.publisher],
    ['offer', input.offer],
    ['plan', input.plan],
    ['vmSize', input.vmSize],
  ]) {
    if (value !== undefined && !SAFE_IMAGE_PART.test(value))
      throw new Error(`${label} contains unsupported characters`);
  }
  if (input.version?.toLowerCase() === 'latest') throw new Error('The image version latest is forbidden');
  if (input.requiredNics < 1 || input.requiredNics > 8) throw new Error('requiredNics must be between 1 and 8');
  if (input.nodeCount !== 1 && input.nodeCount !== 3) throw new Error('nodeCount must be one or three');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(input.deploymentName))
    throw new Error('deploymentName contains unsupported characters');
  if (!/^[a-zA-Z0-9._()-]+$/.test(input.resourceGroup))
    throw new Error('resourceGroup contains unsupported characters');
  for (const id of input.brownfieldResourceIds) {
    const match = RESOURCE_ID.exec(id);
    if (!match) throw new Error(`Invalid Azure resource ID: ${id}`);
    if (match[1].toLowerCase() !== input.subscriptionId.toLowerCase())
      throw new Error(`Brownfield resource is in a different subscription: ${id}`);
  }
}
async function discoverAzureCompute(input, api, fetcher = fetch) {
  input = {
    ...input,
    publisher: input.publisher || undefined,
    offer: input.offer || undefined,
    plan: input.plan || undefined,
    version: input.version || undefined,
    vmSize: input.vmSize || undefined,
  };
  validateInput(input);
  const subscriptionId = input.subscriptionId.toLowerCase();
  const research = await verifyOfficialSources(fetcher);
  const [account, locations, rawSkus, provider, policies] = await Promise.all([
    json(api, ['account', 'show', '--subscription', subscriptionId]),
    json(api, [
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`,
    ]),
    json(api, ['vm', 'list-skus', '--all', '--subscription', subscriptionId]),
    json(api, ['provider', 'show', '--namespace', 'Microsoft.Network', '--subscription', subscriptionId]),
    json(api, ['policy', 'state', 'list', '--subscription', subscriptionId]),
  ]);
  if (String(account.id).toLowerCase() !== subscriptionId)
    throw new Error('Azure CLI returned a different subscription');
  if (String(account.environmentName) !== 'AzureCloud') throw new Error('Only AzureCloud subscriptions are supported');
  const physicalRegions = (locations.value ?? [])
    .filter((location) => String(location.metadata?.regionType ?? 'Physical') === 'Physical')
    .map((location) => normalizeLocation(location.name))
    .filter(Boolean)
    .sort();
  const selected = await resolveMarketplaceImage(api, physicalRegions, subscriptionId, input);
  const urn = selected.urn;
  const hardware = readAzureImageHardware(
    await json(api, [
      'vm',
      'image',
      'show',
      '--location',
      selected.catalogRegion,
      '--urn',
      urn,
      '--subscription',
      subscriptionId,
    ]),
    { subscriptionId, region: selected.catalogRegion, urn },
  );
  const terms = await json(api, ['vm', 'image', 'terms', 'show', '--urn', urn, '--subscription', subscriptionId]);
  const routeServerLocations = new Set();
  const resourceTypes = Array.isArray(provider.resourceTypes) ? provider.resourceTypes : [];
  for (const type of resourceTypes) {
    if (!['virtualhubs', 'routeservers'].includes(String(type.resourceType).toLowerCase())) continue;
    for (const location of Array.isArray(type.locations) ? type.locations : [])
      routeServerLocations.add(normalizeLocation(location));
  }
  const imageLocations = new Set(selected.locations.map(normalizeLocation));
  const imageAvailability = new Map();
  if (imageLocations.size === 0) {
    const availabilityPairs = await mapLimit(physicalRegions, 8, async (region) => [
      region,
      await imageAvailable(api, region, urn, subscriptionId, hardware),
    ]);
    for (const [region, available] of availabilityPairs) imageAvailability.set(region, available);
  }
  const quotaPairs = await mapLimit(physicalRegions, 8, async (region) => [
    region,
    await quotaAvailable(api, region, subscriptionId),
  ]);
  const quotas = new Map(quotaPairs);
  const resourceGroupId = `/subscriptions/${subscriptionId}/resourceGroups/${input.resourceGroup}`;
  const observedIds = [...new Set([...input.brownfieldResourceIds, resourceGroupId])].sort();
  const resourceObservations = await Promise.all(observedIds.map((id) => observeResource(api, id, subscriptionId)));
  const ownedRaw = await json(api, [
    'resource',
    'list',
    '--tag',
    `xcsh-deployment-id=${input.deploymentName}`,
    '--subscription',
    subscriptionId,
  ]);
  for (const raw of ownedRaw) {
    const tags = raw.tags ?? {};
    const item = {
      id: String(raw.id ?? '').toLowerCase(),
      location: typeof raw.location === 'string' ? normalizeLocation(raw.location) : undefined,
      exists: true,
      etag: typeof raw.etag === 'string' ? raw.etag : undefined,
      owned: tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === input.deploymentName,
      tags,
      state: safeResourceState(raw),
    };
    if (item.id && !resourceObservations.some((resource) => resource.id === item.id)) resourceObservations.push(item);
  }
  const proximity = new Map();
  for (const resource of resourceObservations) {
    if (resource.location && input.brownfieldResourceIds.some((id) => id.toLowerCase() === resource.id)) {
      proximity.set(resource.location, (proximity.get(resource.location) ?? 0) + 1);
    }
  }
  const preliminary = physicalRegions.map((region) => {
    const availableVmSizes = skusForRegion(rawSkus, input.vmSize, region);
    const eligibleVmSizes = availableVmSizes.filter(
      (size) =>
        !size.restricted &&
        size.maxNics >= input.requiredNics &&
        size.vCpus >= 8 &&
        size.memoryGb >= 32 &&
        classifyAzureImageHardwareCompatibility(hardware, size) === 'compatible',
    );
    const vmSize = eligibleVmSizes[0] ?? availableVmSizes[0];
    const policyDenied = policies.some(
      (policy) =>
        String(policy.complianceState).toLowerCase() === 'noncompliant' &&
        String(policy.policyDefinitionAction ?? policy.effect).toLowerCase() === 'deny' &&
        (!policy.resourceLocation || normalizeLocation(policy.resourceLocation) === region),
    );
    const reasons = [];
    const blockers = [];
    if (imageLocations.size > 0 && !imageLocations.has(region)) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === false) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === undefined)
      blockers.push('image-observation-failed');
    if (!vmSize) blockers.push('vm-size-unavailable');
    else if (eligibleVmSizes.length === 0) {
      if (availableVmSizes.every((size) => size.restricted)) blockers.push('sku-restricted');
      if (availableVmSizes.every((size) => size.maxNics < input.requiredNics)) blockers.push('nic-limit');
      if (availableVmSizes.every((size) => size.vCpus < 8 || size.memoryGb < 32)) blockers.push('ce-minimum-size');
      if (availableVmSizes.some((size) => classifyAzureImageHardwareCompatibility(hardware, size) === 'incompatible'))
        blockers.push('vm-image-incompatible');
      if (availableVmSizes.some((size) => classifyAzureImageHardwareCompatibility(hardware, size) === 'unknown'))
        blockers.push('vm-image-compatibility-unverified');
      if (blockers.length === 0) blockers.push('no-compatible-vm-size');
    } else if (input.nodeCount === 3 && vmSize.zones.length < 3) {
      reasons.push('fewer-than-three-zones');
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
      vmSizes: (eligibleVmSizes.length > 0 ? eligibleVmSizes : availableVmSizes).slice(0, 24),
      proximity: proximity.get(region) ?? 0,
    };
  });
  preliminary.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      (b.proximity ?? 0) - (a.proximity ?? 0) ||
      a.reasons.length - b.reasons.length ||
      a.name.localeCompare(b.name),
  );
  preliminary.forEach((region, index) => {
    region.rank = index + 1;
  });
  return {
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    subscription: { id: subscriptionId, tenantId: String(account.tenantId ?? ''), cloud: 'AzureCloud' },
    image: {
      publisher: selected.publisher,
      offer: selected.offer,
      plan: String(terms.plan ?? selected.plan),
      version: selected.version,
      urn,
      termsAccepted: Boolean(terms.accepted),
      ...hardware,
    },
    regions: preliminary,
    resources: resourceObservations,
    research: {
      ...research,
      catalogRegion: selected.catalogRegion,
      commands: [
        'az vm image list-publishers',
        'az vm image list-offers',
        'az vm image list-skus',
        'az vm image list',
        'az vm image terms show',
        'az vm list-skus --all',
      ],
    },
  };
}

export { discoverAzureCompute };
