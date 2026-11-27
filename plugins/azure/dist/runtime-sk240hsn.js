// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/azure/src/ce/inventory.ts
import { createHash } from 'node:crypto';
import { canonicalSha256, canonicalStringify } from './runtime-6j4b2rhv.js';
import {
  buildActivityLogArgs2,
  buildResourceGraphArgs2,
  detectAzError,
  detectErrorType,
  makeExecApi,
  normalizeActivityLogPayload2,
  parseAzJsonOutput,
  RESOURCE_GRAPH_ENV2,
  RESOURCE_GRAPH_REQUIRED_FLAGS,
  SUBSCRIPTION_ID_PATTERN,
} from './runtime-2139fbqg.js';

var AZURE_CE_INVENTORY_SCHEMA_VERSION = 1;
var AZURE_CE_INVENTORY_QUERY = `resourcecontainers
| where type =~ 'microsoft.resources/subscriptions/resourcegroups'
| project inventoryKind='resourceGroup', id, name, type, resourceGroup=name, location, tags,
    provisioningState=tostring(properties.provisioningState), imagePublisher='', imageOffer='', imageSku='',
    computerName='', networkInterfaceIds=dynamic([]), diskIds=dynamic([]), macAddress='', primary=false,
    vmId='', subnetIds=dynamic([]), networkSecurityGroupId='', publicIpResourceIds=dynamic([]),
    routeTableId='', routeNames=dynamic([]), bgpPeerStates=dynamic([])
| union (Resources
  | where type in~ (
      'microsoft.compute/virtualmachines', 'microsoft.compute/disks',
      'microsoft.network/networkinterfaces', 'microsoft.network/networksecuritygroups',
      'microsoft.network/routetables', 'microsoft.network/virtualhubs',
      'microsoft.network/virtualhubs/bgpconnections', 'microsoft.network/loadbalancers',
      'microsoft.network/bastionhosts', 'microsoft.network/publicipaddresses',
      'microsoft.network/natgateways', 'microsoft.network/azurefirewalls',
      'microsoft.network/applicationgateways', 'microsoft.network/virtualnetworks')
  | project inventoryKind='resource', id, name, type, resourceGroup, location, tags,
      provisioningState=tostring(properties.provisioningState),
      imagePublisher=tostring(properties.storageProfile.imageReference.publisher),
      imageOffer=tostring(properties.storageProfile.imageReference.offer),
      imageSku=tostring(properties.storageProfile.imageReference.sku),
      computerName=tostring(properties.osProfile.computerName),
      networkInterfaceIds=properties.networkProfile.networkInterfaces.id,
      diskIds=array_concat(pack_array(tostring(properties.storageProfile.osDisk.managedDisk.id)), properties.storageProfile.dataDisks.managedDisk.id),
      macAddress=tostring(properties.macAddress), primary=tobool(properties.primary),
      vmId=tostring(properties.virtualMachine.id), subnetIds=properties.ipConfigurations.properties.subnet.id,
      networkSecurityGroupId=tostring(properties.networkSecurityGroup.id),
      publicIpResourceIds=array_concat(properties.ipConfigurations.properties.publicIPAddress.id, properties.frontendIPConfigurations.properties.publicIPAddress.id),
      routeTableId=tostring(properties.routeTable.id), routeNames=properties.routes.name,
      bgpPeerStates=properties.bgpConnections.properties.peerState)
| order by tolower(resourceGroup) asc, tolower(type) asc, tolower(name) asc, tolower(id) asc`;

class AzureCeInventoryFailure extends Error {
  failureStage;
  errorType;
  constructor(failureStage, errorType) {
    super('Azure CE inventory failed.');
    this.failureStage = failureStage;
    this.errorType = errorType;
    this.name = 'AzureCeInventoryFailure';
  }
}
function failure(stage, errorType) {
  return new AzureCeInventoryFailure(stage, errorType);
}
function cliErrorType(stderr, stdout, exitCode) {
  return detectErrorType(detectAzError(stderr || stdout, exitCode));
}
async function execAtStage(api, stage, args, options) {
  try {
    return await api.exec('az', args, options);
  } catch {
    throw failure(stage, 'exec_error');
  }
}
var CONTROL = /[\u0000-\u001F\u007F]/g;
var HAS_CONTROL = /[\u0000-\u001F\u007F]/;
var IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g;
var IPV6 = /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+(?:\/\d{1,3})?\b/gi;
var CE_SIGNAL =
  /\bcustomer[ _-]?edge\b|\bsecure[ _-]?mesh\b|\bf5xc\b|\bdistributed[ _-]?cloud\b|(?:^|[-_])(?:xc|ce)(?:[-_]|$)/i;
var ROUTING_TYPES = new Set([
  'microsoft.network/routetables',
  'microsoft.network/virtualhubs',
  'microsoft.network/virtualhubs/bgpconnections',
]);
var DEPENDENCY_KINDS = {
  'microsoft.compute/disks': 'disk',
  'microsoft.network/networkinterfaces': 'network-interface',
  'microsoft.network/networksecuritygroups': 'network-security-group',
  'microsoft.network/routetables': 'route-table',
  'microsoft.network/virtualhubs': 'route-server',
  'microsoft.network/virtualhubs/bgpconnections': 'bgp-peer',
  'microsoft.network/loadbalancers': 'load-balancer',
  'microsoft.network/bastionhosts': 'bastion',
  'microsoft.network/publicipaddresses': 'public-ip',
  'microsoft.network/natgateways': 'nat-gateway',
  'microsoft.network/azurefirewalls': 'firewall',
  'microsoft.network/applicationgateways': 'proxy-egress',
  'microsoft.network/virtualnetworks': 'virtual-network',
};
function safe(value, max = 2048) {
  return String(value ?? '')
    .replace(CONTROL, '')
    .replace(IPV4, '[redacted-network]')
    .replace(IPV6, '[redacted-network]')
    .slice(0, max);
}
function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US');
}
function strings(value) {
  const result = [];
  const visit = (entry) => {
    if (typeof entry === 'string') result.push(entry);
    else if (Array.isArray(entry)) for (const child of entry) visit(child);
    else if (entry && typeof entry === 'object') {
      const record = entry;
      if (typeof record.id === 'string') result.push(record.id);
      else for (const child of Object.values(record)) visit(child);
    }
  };
  visit(value);
  return [...new Set(result.filter(Boolean).map((entry) => safe(entry)))].sort((a, b) =>
    normalizeKey(a).localeCompare(normalizeKey(b)),
  );
}
function tags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [normalizeKey(key), String(item ?? '')]));
}
function imageFamily(row) {
  const publisher = normalizeKey(row.imagePublisher);
  const offer = normalizeKey(row.imageOffer);
  const sku = normalizeKey(row.imageSku);
  if (publisher !== 'f5-networks') return;
  if (offer === 'f5xc_customer_edge' && sku.startsWith('f5xc-ce-crt')) return 'legacy-crt';
  if (offer === 'f5xc-customer-edge' && sku === 'f5xc-ce') return 'current-ce';
}
function hasTagSignal(value) {
  return Boolean(
    value['xcsh-deployment-id'] ||
      normalizeKey(value['xcsh-managed-by']) === 'azure-ce' ||
      value['f5xc-site-name'] ||
      value['ves.io/site-name'] ||
      normalizeKey(value['f5xc-managed-by']) === 'azure-ce',
  );
}
function normalizeResource(row) {
  const normalizedTags = tags(row.tags);
  const family = imageFamily(row);
  const signalText = [row.name, ...Object.entries(normalizedTags).flat()].map(String).join(' ');
  return {
    id: safe(row.id),
    name: safe(row.name, 256),
    type: normalizeKey(row.type),
    resourceGroup: safe(row.resourceGroup || row.name, 256),
    location: safe(row.location, 128),
    provisioningState: safe(row.provisioningState, 128),
    tags: normalizedTags,
    imagePublisher: safe(row.imagePublisher, 128),
    imageOffer: safe(row.imageOffer, 128),
    imageSku: safe(row.imageSku, 128),
    computerName: safe(row.computerName, 256),
    networkInterfaceIds: strings(row.networkInterfaceIds),
    diskIds: strings(row.diskIds),
    macAddress: String(row.macAddress ?? ''),
    primary: row.primary === true,
    vmId: safe(row.vmId),
    subnetIds: strings(row.subnetIds),
    networkSecurityGroupId: safe(row.networkSecurityGroupId),
    publicIpResourceIds: strings(row.publicIpResourceIds),
    routeTableId: safe(row.routeTableId),
    routeNames: strings(row.routeNames).map((item) => safe(item, 256)),
    bgpPeerStates: strings(row.bgpPeerStates).map((item) => safe(item, 128)),
    kind: String(row.inventoryKind ?? row.kind ?? 'resource'),
    deploymentId: safe(normalizedTags['xcsh-deployment-id'], 256),
    candidate: Boolean(family) || hasTagSignal(normalizedTags) || CE_SIGNAL.test(signalText),
    ...(family ? { imageFamily: family } : {}),
  };
}
function normalizeMac(value) {
  const normalized = value.replace(/[^a-f0-9]/gi, '').toLowerCase();
  return /^[a-f0-9]{12}$/.test(normalized) ? normalized : undefined;
}
function hashMac(value) {
  const normalized = normalizeMac(value);
  return normalized ? createHash('sha256').update(normalized, 'utf8').digest('hex') : undefined;
}
function siteKey(site) {
  return `${normalizeKey(site.namespace || '_default')}/${normalizeKey(site.name)}`;
}
function runtimeState(value) {
  const normalized = normalizeKey(value).replace(/^powerstate\//, '');
  if (normalized === 'running') return 'running';
  if (normalized === 'stopped' || normalized === 'deallocated') return normalized;
  return 'unknown';
}
function aggregateRuntime(nodes) {
  if (nodes.length === 0) return 'absent';
  const values = new Set(nodes.map((node) => node.runtimeState));
  if (values.size === 1 && values.has('running')) return 'running';
  if ([...values].every((value) => value === 'stopped' || value === 'deallocated')) return 'stopped';
  if (values.has('unknown')) return values.size === 1 ? 'unknown' : 'mixed';
  return 'mixed';
}
function dependencyKind(type) {
  return DEPENDENCY_KINDS[type] ?? 'resource';
}
function callerTargets(input, collected) {
  return new Set(
    [input.caller?.objectId, input.caller?.userPrincipalName, input.caller ? undefined : collected.observedCaller]
      .map(normalizeKey)
      .filter(Boolean),
  );
}
function association(value, targets) {
  if (!value || targets.size === 0) return 'unknown';
  return targets.has(normalizeKey(value)) ? 'matches-caller' : 'different-caller';
}
function evidenceFor(resources, _group, activity, sites, input, collected) {
  const result = [];
  const targets = callerTargets(input, collected);
  const ids = new Set(resources.map((resource) => normalizeKey(resource.id)));
  for (const event of activity?.events ?? []) {
    if (
      event.evidenceType !== 'created' ||
      (!ids.has(normalizeKey(event.resourceId)) && event.scopeType !== 'resource_group')
    )
      continue;
    result.push({
      source: 'activity-log',
      association: association(event.callerComparison, targets),
      confidence: event.confidence === 'none' ? 'unknown' : event.confidence,
      reasonCode: event.reasonCode,
      resourceId: safe(event.resourceId),
    });
  }
  if (!result.some((item) => item.source === 'activity-log')) {
    result.push({
      source: 'activity-log',
      association: 'unknown',
      confidence: 'unknown',
      reasonCode: activity?.scopeEvidence.reasonCode ?? 'activity_evidence_unavailable',
    });
  }
  for (const resource of resources) {
    for (const key of ['owner', 'createdby', 'xcsh-managed-by']) {
      const value = resource.tags[key];
      if (!value) continue;
      result.push({
        source: 'tag',
        association: association(value, targets),
        confidence: 'medium',
        reasonCode: `explicit_${key.replace(/[^a-z0-9]+/g, '_')}_tag`,
        resourceId: resource.id,
      });
    }
    if (resource.candidate && !resource.imageFamily && !hasTagSignal(resource.tags)) {
      result.push({
        source: 'candidate-signal',
        association: 'unknown',
        confidence: 'low',
        reasonCode: 'name_or_tag_candidate_signal',
        resourceId: resource.id,
      });
    }
  }
  for (const site of sites) {
    if (!site.creator) continue;
    result.push({
      source: 'platform',
      association: association(site.creator, targets),
      confidence: 'medium',
      reasonCode: 'correlated_platform_site_creator',
    });
  }
  return result.sort((a, b) =>
    `${a.source}|${a.resourceId ?? ''}|${a.reasonCode}`.localeCompare(
      `${b.source}|${b.resourceId ?? ''}|${b.reasonCode}`,
    ),
  );
}
function classify(nodes, dependencies, platform, runtime, evidence, empty) {
  const associations = new Set(evidence.map((item) => item.association).filter((item) => item !== 'unknown'));
  if (platform === 'ambiguous' || associations.size > 1)
    return { classification: 'ambiguous', confidence: 'unknown', reasonCodes: ['conflicting_or_ambiguous_evidence'] };
  if (empty)
    return {
      classification: 'empty-candidate-group',
      confidence: 'low',
      reasonCodes: ['candidate_group_has_no_resources'],
    };
  if (nodes.length === 0 && dependencies.length > 0)
    return { classification: 'azure-remnant', confidence: 'low', reasonCodes: ['dependencies_without_ce_nodes'] };
  if (platform === 'unavailable')
    return {
      classification: 'azure-platform-unknown',
      confidence: 'unknown',
      reasonCodes: ['platform_evidence_unavailable'],
    };
  if (platform === 'online' && runtime === 'running')
    return {
      classification: 'azure-platform-active',
      confidence: 'high',
      reasonCodes: ['correlated_platform_online_and_nodes_running'],
    };
  if (platform === 'online' || platform === 'non-online')
    return {
      classification: 'azure-platform-inactive',
      confidence: 'medium',
      reasonCodes: ['correlated_platform_or_runtime_not_active'],
    };
  if (runtime === 'running')
    return {
      classification: 'azure-only-running',
      confidence: 'medium',
      reasonCodes: ['running_without_platform_match'],
    };
  if (runtime === 'stopped')
    return {
      classification: 'azure-only-stopped',
      confidence: 'medium',
      reasonCodes: ['stopped_without_platform_match'],
    };
  return {
    classification: 'azure-only-mixed',
    confidence: 'low',
    reasonCodes: ['mixed_or_unknown_runtime_without_platform_match'],
  };
}
function groupRows(rows) {
  const byGroup = new Map();
  for (const row of rows) {
    const key = normalizeKey(row.resourceGroup);
    const items = byGroup.get(key) ?? [];
    items.push(row);
    byGroup.set(key, items);
  }
  const groups = [];
  for (const [key, items] of [...byGroup].sort(([left], [right]) => left.localeCompare(right))) {
    const groupRows = items.filter((item) => item.kind === 'resourceGroup');
    const resources = items.filter((item) => item.kind !== 'resourceGroup');
    if (!items.some((item) => item.candidate)) continue;
    if (resources.length === 0) {
      groups.push({
        id: `${key}/empty`,
        resourceGroup: safe(groupRows[0]?.resourceGroup ?? key),
        resources: [],
        empty: true,
      });
      continue;
    }
    const ids = [...new Set(resources.map((item) => normalizeKey(item.deploymentId)).filter(Boolean))].sort();
    if (ids.length <= 1) {
      groups.push({
        id: ids[0] || `${key}/inferred`,
        resourceGroup: safe(resources[0]?.resourceGroup ?? key),
        resources,
        empty: false,
      });
      continue;
    }
    for (const id of ids) {
      const selected = resources.filter((item) => normalizeKey(item.deploymentId) === id);
      groups.push({ id, resourceGroup: safe(selected[0]?.resourceGroup ?? key), resources: selected, empty: false });
    }
    const unassigned = resources.filter((item) => !item.deploymentId);
    if (unassigned.some((item) => item.candidate))
      groups.push({
        id: `${key}/inferred`,
        resourceGroup: safe(unassigned[0]?.resourceGroup ?? key),
        resources: unassigned,
        empty: false,
      });
  }
  return groups.sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
}
function platformCorrelations(nodes, sites) {
  const normalizedSites = sites
    .map((site) => ({
      input: site,
      key: siteKey(site),
      nodes: (site.nodes ?? []).map((node) => ({
        hostname: normalizeKey(node.hostname),
        macs: new Set((node.macAddresses ?? []).map((mac) => hashMac(mac)).filter((value) => Boolean(value))),
      })),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const matched = new Set();
  let ambiguous = false;
  for (const node of nodes) {
    const macs = new Set(node.nics.map((nic) => nic.macSha256).filter((value) => Boolean(value)));
    const macSites = normalizedSites.filter((site) =>
      site.nodes.some((candidate) => [...candidate.macs].some((mac) => macs.has(mac))),
    );
    if (macSites.length === 1) {
      node.correlation = { siteKey: macSites[0].key, matchedBy: 'mac' };
      matched.add(macSites[0].key);
      continue;
    }
    if (macSites.length > 1) {
      ambiguous = true;
      for (const site of macSites) matched.add(site.key);
      continue;
    }
    const hostname = normalizeKey(node.name);
    const hostSites = normalizedSites.filter((site) => site.nodes.some((candidate) => candidate.hostname === hostname));
    if (hostSites.length === 1) {
      node.correlation = { siteKey: hostSites[0].key, matchedBy: 'hostname' };
      matched.add(hostSites[0].key);
    } else if (hostSites.length > 1) {
      ambiguous = true;
      for (const site of hostSites) matched.add(site.key);
    }
  }
  return { normalizedSites, matched, ambiguous };
}
function nodeFor(vm, resources, runtimeByVmId) {
  const nics = resources.filter(
    (item) =>
      item.type === 'microsoft.network/networkinterfaces' &&
      (normalizeKey(item.vmId) === normalizeKey(vm.id) ||
        vm.networkInterfaceIds.map(normalizeKey).includes(normalizeKey(item.id))),
  );
  nics.sort((a, b) => Number(b.primary) - Number(a.primary) || normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
  return {
    id: vm.id,
    name: vm.name,
    imageFamily: vm.imageFamily ?? 'signal-only',
    provisioningState: vm.provisioningState || 'unknown',
    runtimeState: runtimeState(runtimeByVmId[vm.id] ?? runtimeByVmId[normalizeKey(vm.id)]),
    disks: vm.diskIds,
    nics: nics.map((nic, order) => {
      const subnetId = nic.subnetIds[0];
      const vnetId = subnetId?.replace(/\/subnets\/[^/]+$/i, '');
      return {
        id: nic.id,
        name: nic.name,
        order,
        primary: nic.primary,
        ...(hashMac(nic.macAddress) ? { macSha256: hashMac(nic.macAddress) } : {}),
        ...(subnetId ? { subnetId } : {}),
        ...(vnetId ? { vnetId } : {}),
        ...(nic.networkSecurityGroupId ? { networkSecurityGroupId: nic.networkSecurityGroupId } : {}),
        publicIpPresent: nic.publicIpResourceIds.length > 0,
      };
    }),
  };
}
function dependencyFor(resource) {
  const dependency = {
    id: resource.id,
    name: resource.name,
    kind: dependencyKind(resource.type),
    provisioningState: resource.provisioningState || 'unknown',
  };
  if (resource.type === 'microsoft.network/loadbalancers')
    dependency.publicIpPresenceCount = resource.publicIpResourceIds.length;
  if (resource.type === 'microsoft.network/publicipaddresses') dependency.publicIpPresenceCount = 1;
  if (resource.routeNames.length) dependency.routeNames = resource.routeNames;
  if (resource.bgpPeerStates.length) dependency.bgpPeerStates = resource.bgpPeerStates;
  return dependency;
}
function buildAzureCeInventoryEnvelope(input, collected, now) {
  const rows = collected.rows.map(normalizeResource);
  const sites = [...(input.platformSites ?? [])].sort((a, b) => siteKey(a).localeCompare(siteKey(b)));
  const matchedSites = new Set();
  const deployments = groupRows(rows).map((group) => {
    const nodes = group.resources
      .filter((item) => item.type === 'microsoft.compute/virtualmachines' && item.candidate)
      .map((item) => nodeFor(item, group.resources, collected.runtimeByVmId))
      .sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
    const dependencies = group.resources
      .filter((item) => item.type !== 'microsoft.compute/virtualmachines')
      .map(dependencyFor)
      .sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
    const correlations = platformCorrelations(nodes, sites);
    for (const key of correlations.matched) matchedSites.add(key);
    const correlatedSites = correlations.normalizedSites
      .filter((site) => correlations.matched.has(site.key))
      .map((site) => {
        const matchedBy =
          nodes.find((node) => node.correlation?.siteKey === site.key)?.correlation?.matchedBy ?? 'hostname';
        return {
          key: site.key,
          name: safe(site.input.name, 256),
          ...(site.input.namespace ? { namespace: safe(site.input.namespace, 256) } : {}),
          state: safe(site.input.siteState || 'unknown', 80),
          matchedBy,
        };
      });
    const runtime = aggregateRuntime(nodes);
    const platform =
      input.platformSites === undefined
        ? 'unavailable'
        : correlations.ambiguous
          ? 'ambiguous'
          : correlatedSites.length === 0
            ? 'absent'
            : correlatedSites.every((site) => normalizeKey(site.state) === 'online')
              ? 'online'
              : 'non-online';
    const provisioningValues = new Set(
      [
        ...nodes.map((node) => normalizeKey(node.provisioningState)),
        ...dependencies.map((item) => normalizeKey(item.provisioningState)),
      ].filter(Boolean),
    );
    const provisioning =
      provisioningValues.size === 0 ? 'unknown' : provisioningValues.size === 1 ? [...provisioningValues][0] : 'mixed';
    const routing = group.resources.some((item) => ROUTING_TYPES.has(item.type)) ? 'observed' : 'not-observed';
    const creatorEvidence = evidenceFor(
      group.resources,
      group.resourceGroup,
      collected.activityByResourceGroup[normalizeKey(group.resourceGroup)],
      correlatedSites.map((item) => sites.find((site) => siteKey(site) === item.key)).filter((site) => Boolean(site)),
      input,
      collected,
    );
    const result = classify(nodes, dependencies, platform, runtime, creatorEvidence, group.empty);
    const evidenceReferences = [
      ...new Set([
        ...group.resources.filter((item) => item.imageFamily).map((item) => `image:${item.id}`),
        ...creatorEvidence.map((item) => `${item.source}:${item.reasonCode}:${item.resourceId ?? group.resourceGroup}`),
        ...nodes.flatMap((node) =>
          node.correlation ? [`correlation:${node.id}:${node.correlation.matchedBy}:${node.correlation.siteKey}`] : [],
        ),
      ]),
    ].sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)));
    return {
      id: safe(group.id, 256),
      resourceGroup: group.resourceGroup,
      ...result,
      evidenceReferences,
      nodes,
      dependencies,
      platformSites: correlatedSites.sort((a, b) => a.key.localeCompare(b.key)),
      creatorEvidence,
      dimensions: {
        provisioning,
        runtime,
        platform,
        routing,
        trafficHealth: input.platformSites === undefined ? 'evidence-unavailable' : 'not-tested',
      },
    };
  });
  const platformOnly = sites
    .filter((site) => !matchedSites.has(siteKey(site)))
    .map((site) => ({
      name: safe(site.name, 256),
      ...(site.namespace ? { namespace: safe(site.namespace, 256) } : {}),
      state: safe(site.siteState || 'unknown', 80),
      classification: 'platform-only',
      reasonCodes: ['no_azure_node_correlation'],
    }));
  const inventory = {
    schemaVersion: AZURE_CE_INVENTORY_SCHEMA_VERSION,
    subscriptionId: safe(input.subscriptionId, 64),
    observedAt: now.toISOString(),
    callerSource: input.caller ? 'provided' : collected.observedCaller ? 'observed' : 'unavailable',
    platformEvidence: input.platformSites === undefined ? 'unavailable' : 'available',
    coverage: {
      resourceGraphPages: collected.resourceGraphPages,
      activityLookbackDays: 89,
      complete: Object.values(collected.activityByResourceGroup).every((activity) => activity.coverage.complete),
    },
    counts: {
      logicalDeployments: deployments.length,
      platformSites: sites.length,
      azureNodes: deployments.reduce((sum, item) => sum + item.nodes.length, 0),
    },
    deployments,
    platformOnly,
  };
  const canonicalInventory = JSON.parse(canonicalStringify(inventory));
  return JSON.parse(
    canonicalStringify({
      kind: 'azure-ce-inventory',
      digestSha256: canonicalSha256(canonicalInventory),
      inventory: canonicalInventory,
    }),
  );
}
function validateInput(input) {
  if (!SUBSCRIPTION_ID_PATTERN.test(input.subscriptionId)) throw failure('input_validation', 'invalid_input');
  if (input.caller) {
    const { objectId, userPrincipalName } = input.caller;
    if (objectId === undefined && userPrincipalName === undefined) throw failure('input_validation', 'invalid_input');
    if (objectId !== undefined && !SUBSCRIPTION_ID_PATTERN.test(objectId))
      throw failure('input_validation', 'invalid_input');
    if (
      userPrincipalName !== undefined &&
      (!userPrincipalName.trim() || userPrincipalName.length > 320 || HAS_CONTROL.test(userPrincipalName))
    )
      throw failure('input_validation', 'invalid_input');
  }
  for (const site of input.platformSites ?? []) {
    if (!site.name?.trim() || HAS_CONTROL.test(site.name)) throw failure('input_validation', 'invalid_input');
    for (const mac of site.nodes?.flatMap((node) => node.macAddresses ?? []) ?? [])
      if (!normalizeMac(mac)) throw failure('input_validation', 'invalid_input');
  }
}
function parseGraphPage(stdout) {
  const parsed = parseAzJsonOutput(stdout);
  const envelope = Array.isArray(parsed) ? { data: parsed } : parsed;
  if (!Array.isArray(envelope.data)) throw new Error('Azure CE inventory Resource Graph response was invalid.');
  if (envelope.data.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
    throw new Error('Azure CE inventory Resource Graph response was invalid.');
  const rawToken = envelope.skipToken ?? envelope.skip_token;
  return {
    data: envelope.data,
    ...(typeof rawToken === 'string' && rawToken ? { skipToken: rawToken } : {}),
  };
}
async function collectAzureCeInventory(input, api, now = () => new Date(), signal) {
  validateInput(input);
  const options = { signal, env: RESOURCE_GRAPH_ENV2 };
  const extension = await execAtStage(
    api,
    'setup',
    ['extension', 'show', '--name', 'resource-graph', '--output', 'json'],
    options,
  );
  if (extension.exitCode !== 0) {
    const errorType = cliErrorType(extension.stderr, extension.stdout, extension.exitCode);
    throw failure('setup', errorType === 'exec_error' ? 'unsupported_extension' : errorType);
  }
  const help = await execAtStage(api, 'setup', ['graph', 'query', '--help'], options);
  const helpText = `${help.stdout}
${help.stderr}`;
  if (help.exitCode !== 0) {
    const errorType = cliErrorType(help.stderr, help.stdout, help.exitCode);
    throw failure('setup', errorType === 'exec_error' ? 'unsupported_extension' : errorType);
  }
  if (RESOURCE_GRAPH_REQUIRED_FLAGS.some((flag) => !helpText.includes(flag)))
    throw failure('setup', 'unsupported_extension');
  let observedCaller;
  if (!input.caller) {
    try {
      const account = await api.exec(
        'az',
        ['account', 'show', '--subscription', input.subscriptionId, '--query', '{user:user}', '--output', 'json'],
        { signal },
      );
      if (account.exitCode === 0) {
        const parsed = parseAzJsonOutput(account.stdout);
        const user = parsed.user;
        observedCaller = typeof user?.name === 'string' ? user.name : undefined;
      }
    } catch {}
  }
  const rows = [];
  const seenTokens = new Set();
  let skipToken;
  let resourceGraphPages = 0;
  do {
    const args = buildResourceGraphArgs2({
      query: AZURE_CE_INVENTORY_QUERY,
      subscriptions: [input.subscriptionId],
      first: 1000,
      ...(skipToken ? { skip_token: skipToken } : {}),
    });
    const result = await execAtStage(api, 'resource_graph', args, options);
    if (result.exitCode !== 0 || /partial scope|inaccessible scope|not authorized for all/i.test(result.stderr))
      throw failure('resource_graph', cliErrorType(result.stderr, result.stdout, result.exitCode || 1));
    let page;
    try {
      page = parseGraphPage(result.stdout);
    } catch {
      throw failure('resource_graph', 'invalid_response');
    }
    rows.push(...page.data);
    resourceGraphPages += 1;
    skipToken = page.skipToken;
    if (skipToken && seenTokens.has(skipToken)) throw failure('resource_graph', 'paging_error');
    if (skipToken) seenTokens.add(skipToken);
  } while (skipToken);
  const normalized = rows.map(normalizeResource);
  const candidateGroups = new Set(
    normalized.filter((item) => item.candidate).map((item) => normalizeKey(item.resourceGroup)),
  );
  const candidateVms = normalized.filter((item) => item.type === 'microsoft.compute/virtualmachines' && item.candidate);
  const runtimeByVmId = {};
  for (const vm of candidateVms.sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)))) {
    const result = await execAtStage(
      api,
      'vm_runtime',
      [
        'vm',
        'get-instance-view',
        '--ids',
        vm.id,
        '--subscription',
        input.subscriptionId,
        '--query',
        "{powerState:instanceView.statuses[?starts_with(code, 'PowerState/')].code | [0]}",
        '--output',
        'json',
      ],
      { signal },
    );
    if (result.exitCode !== 0) throw failure('vm_runtime', cliErrorType(result.stderr, result.stdout, result.exitCode));
    try {
      const payload = parseAzJsonOutput(result.stdout);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw failure('vm_runtime', 'invalid_response');
      if (payload.powerState !== undefined && payload.powerState !== null && typeof payload.powerState !== 'string')
        throw failure('vm_runtime', 'invalid_response');
      runtimeByVmId[vm.id] = payload.powerState ?? 'unknown';
    } catch {
      throw failure('vm_runtime', 'invalid_response');
    }
  }
  const activityByResourceGroup = {};
  for (const group of [...candidateGroups].sort()) {
    const display = normalized.find((item) => normalizeKey(item.resourceGroup) === group)?.resourceGroup ?? group;
    const params = {
      subscription: input.subscriptionId,
      resource_group: display,
      status: 'succeeded',
      operation_family: 'write',
      max_events: 1000,
      lookback_days: 89,
    };
    const result = await execAtStage(api, 'activity_log', buildActivityLogArgs2(params), { signal });
    if (result.exitCode !== 0)
      throw failure('activity_log', cliErrorType(result.stderr, result.stdout, result.exitCode));
    try {
      const parsed = parseAzJsonOutput(result.stdout);
      const payload = Array.isArray(parsed) ? parsed : Array.isArray(parsed.value) ? parsed.value : undefined;
      if (!payload) throw new Error('bad payload');
      activityByResourceGroup[group] = normalizeActivityLogPayload2(params, payload, now());
    } catch {
      throw failure('activity_log', 'invalid_response');
    }
  }
  try {
    return buildAzureCeInventoryEnvelope(
      input,
      { rows, runtimeByVmId, activityByResourceGroup, resourceGraphPages, observedCaller },
      now(),
    );
  } catch {
    throw failure('envelope_serialization', 'serialization_error');
  }
}
function formatAzureCeInventory(envelope, artifactId) {
  const { inventory } = envelope;
  const classifications = inventory.deployments.reduce((result, deployment) => {
    result[deployment.classification] = (result[deployment.classification] ?? 0) + 1;
    return result;
  }, {});
  const lines = [
    'Azure Customer Edge inventory (read-only)',
    `Logical deployments: ${inventory.counts.logicalDeployments}`,
    `Azure nodes: ${inventory.counts.azureNodes}`,
    `Platform sites: ${inventory.counts.platformSites}`,
    `Platform evidence: ${inventory.platformEvidence}`,
    `Classifications: ${
      Object.entries(classifications)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}=${count}`)
        .join(', ') || 'none'
    }`,
    `Digest: ${envelope.digestSha256}`,
    `Inventory artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
  ];
  return lines.join(`
`);
}

// plugins/azure/src/prompts/azure-ce-inventory.md
var azure_ce_inventory_default = `# Azure Customer Edge Inventory

Build a deterministic, read-only inventory of existing F5 Customer Edge resources across one Azure
subscription. The tool owns Resource Graph paging, VM instance-view collection, Activity Log evidence,
privacy filtering, platform correlation, classification, canonicalization, and artifact persistence.

Pass the subscription UUID. Caller identity and non-secret platform-site evidence are optional. The result
keeps provisioning, runtime, platform, routing, and traffic-health evidence separate. Caller association is
historical evidence, never an ownership claim. Public and private addresses, prefixes, public-resource FQDNs,
bootstrap data, secrets, arbitrary tags, raw events, and continuation tokens are excluded. Do not substitute
generic \`az_exec\`, deployment discovery, planning, mutation, or web research for this inventory operation.
`;

// plugins/azure/src/tools/azure-ce-inventory.ts
function failureResult(failureStage, errorType) {
  const authenticationFailure = errorType === 'auth_required' || errorType === 'session_expired';
  return {
    content: [
      {
        type: 'text',
        text:
          errorType === 'invalid_input'
            ? 'Azure CE inventory input is invalid.'
            : 'Azure CE inventory failed without returning partial resource data.',
      },
    ],
    isError: true,
    details: {
      tool: 'azure_ce_inventory',
      outcome: authenticationFailure
        ? 'authentication_failure'
        : errorType === 'invalid_input'
          ? 'invalid_input'
          : 'execution_failure',
      failureStage,
      errorType,
    },
  };
}
function createAzureCeInventoryTool(pi, makeApi = makeExecApi, now = () => new Date()) {
  const { Type } = pi.typebox;
  const platformNode = Type.Object({
    hostname: Type.Optional(Type.String()),
    macAddresses: Type.Optional(Type.Array(Type.String())),
  });
  const platformSite = Type.Object({
    namespace: Type.Optional(Type.String()),
    name: Type.String(),
    siteState: Type.Optional(Type.String()),
    creator: Type.Optional(Type.String()),
    nodes: Type.Optional(Type.Array(platformNode)),
  });
  return {
    name: 'azure_ce_inventory',
    label: 'Inventory Azure Customer Edge',
    description: azure_ce_inventory_default,
    parameters: Type.Object({
      subscriptionId: Type.String({ description: 'Azure subscription UUID' }),
      caller: Type.Optional(
        Type.Object(
          {
            objectId: Type.Optional(Type.String({ pattern: SUBSCRIPTION_ID_PATTERN.source })),
            userPrincipalName: Type.Optional(
              Type.String({ minLength: 1, maxLength: 320, pattern: '^[^\\u0000-\\u001F\\u007F]+$' }),
            ),
          },
          { minProperties: 1 },
        ),
      ),
      platformSites: Type.Optional(Type.Array(platformSite)),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let envelope;
      try {
        envelope = await collectAzureCeInventory(params, makeApi(ctx.cwd), now, signal);
      } catch (error) {
        if (error instanceof AzureCeInventoryFailure) return failureResult(error.failureStage, error.errorType);
        return failureResult('collector', 'unexpected_error');
      }
      let serialized;
      try {
        serialized = canonicalStringify(envelope);
      } catch {
        return failureResult('envelope_serialization', 'serialization_error');
      }
      let artifactId;
      try {
        artifactId = await ctx.sessionManager.saveArtifact(serialized, 'azure-ce-inventory');
      } catch {
        return failureResult('artifact_persistence', 'persistence_error');
      }
      return {
        content: [{ type: 'text', text: formatAzureCeInventory(envelope, artifactId) }],
        details: {
          tool: 'azure_ce_inventory',
          outcome: 'success',
          artifactId,
          digestSha256: envelope.digestSha256,
          inventory: envelope.inventory,
        },
      };
    },
  };
}

export { createAzureCeInventoryTool };
