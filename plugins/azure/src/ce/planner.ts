import { canonicalSha256, fingerprintObservation } from './canonical';
import type {
  AzureCeAction,
  AzureCeIntent,
  AzureCeObservation,
  AzureCePlan,
  AzureCePlanDraft,
  AzureCeResourceObservation,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const RESOURCE_ID = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)(?:\/providers\/([^/]+)\/(.+))?$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CIDR = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\/\d{1,3}$/;
const PORT = /^(?:\*|\d{1,5}(?:-\d{1,5})?)$/;

function fail(message: string): never {
  throw new Error(`Azure CE plan validation failed: ${message}`);
}

function validateSafeString(label: string, value: string): string {
  const normalized = value.trim();
  if (!normalized || CONTROL.test(normalized)) fail(`${label} is empty or contains control characters`);
  return normalized;
}

function validateName(label: string, value: string): string {
  const normalized = validateSafeString(label, value);
  if (!SAFE_NAME.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}

function validateCidr(label: string, value: string): string {
  const normalized = validateSafeString(label, value);
  if (!CIDR.test(normalized)) fail(`${label} is not a CIDR`);
  return normalized;
}

function validateResourceId(id: string, subscriptionId: string): void {
  if (CONTROL.test(id)) fail('resource ID contains control characters');
  const match = RESOURCE_ID.exec(id);
  if (!match) fail(`invalid Azure resource ID: ${id}`);
  if (match[1].toLowerCase() !== subscriptionId.toLowerCase()) fail(`resource ID is in a different subscription: ${id}`);
}

function normalizeIntent(input: AzureCeIntent): AzureCeIntent {
  if (input.schemaVersion !== 1) fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (!UUID.test(input.subscriptionId)) fail('subscriptionId must be a UUID');
  if (input.nics.length < 1 || input.nics.length > 8) fail('NIC count must be between 1 and 8');
  if (input.nics[0]?.role !== 'slo') fail('NIC 0 must have role slo');
  if (input.nics.length > 1 && input.nics[1]?.role !== 'sli') fail('NIC 1 must have role sli when present');

  const subnetKeys = new Set<string>();
  const nics = input.nics.map((nic, index) => {
    const name = validateName(`NIC ${index} name`, nic.name);
    const vrf = nic.vrf ? validateName(`NIC ${index} VRF`, nic.vrf) : undefined;
    const subnet = { ...nic.subnet };
    if (subnet.mode === 'greenfield') {
      if (!subnet.cidr || !subnet.name) fail(`greenfield NIC ${index} requires subnet name and CIDR`);
      subnet.name = validateName(`NIC ${index} subnet name`, subnet.name);
      subnet.cidr = validateCidr(`NIC ${index} subnet CIDR`, subnet.cidr);
    } else {
      if (!subnet.resourceId) fail(`brownfield NIC ${index} requires subnet resourceId`);
      validateResourceId(subnet.resourceId, input.subscriptionId);
    }
    const subnetKey = (subnet.resourceId ?? subnet.cidr ?? '').toLowerCase();
    if (subnetKeys.has(subnetKey)) fail('every ordered NIC must use a unique subnet');
    subnetKeys.add(subnetKey);
    return { ...nic, name, vrf, subnet };
  });

  for (const id of input.brownfield.resourceIds) validateResourceId(id, input.subscriptionId);
  for (const change of input.brownfield.routeChanges) {
    validateResourceId(change.routeTableId, input.subscriptionId);
    validateResourceId(change.subnetId, input.subscriptionId);
    validateName('route name', change.routeName);
    validateCidr('route destination', change.destinationCidr);
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.routeTableId.toLowerCase())) fail('route table must be listed in brownfield.resourceIds');
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.subnetId.toLowerCase())) fail('route subnet must be listed in brownfield.resourceIds');
  }

  for (const rule of input.securityRules) {
    validateName('security rule name', rule.name);
    for (const cidr of [...rule.sourceCidrs, ...rule.destinationCidrs]) validateCidr(`security rule ${rule.name} CIDR`, cidr);
    for (const port of rule.destinationPorts) if (!PORT.test(validateSafeString(`security rule ${rule.name} port`, port))) fail(`security rule ${rule.name} has an invalid port range`);
    if (rule.purpose === 'management' && rule.sourceCidrs.some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0')) {
      // Warning is added later; this validation pass intentionally allows an explicitly approved broad rule.
    }
  }
  for (const [label, value] of [['image publisher', input.image.publisher], ['image offer', input.image.offer], ['image plan', input.image.plan], ['VM size', input.vm.size]] as const) validateName(label, value);
  for (const zone of input.vm.zones ?? []) if (!/^\d+$/.test(zone)) fail(`invalid availability zone ${zone}`);
  for (const [label, asn] of [['local ASN', input.routing.localAsn], ['peer ASN', input.routing.peerAsn]] as const) {
    if (asn !== undefined && (!Number.isInteger(asn) || asn < 1 || asn > 4_294_967_295)) fail(`${label} is invalid`);
  }

  return {
    ...input,
    subscriptionId: input.subscriptionId.toLowerCase(),
    deploymentName: validateName('deploymentName', input.deploymentName),
    siteName: validateName('siteName', input.siteName),
    namespace: validateName('namespace', input.namespace),
    resourceGroup: validateName('resourceGroup', input.resourceGroup),
    region: input.region?.trim().toLowerCase(),
    nics,
    routing: {
      ...input.routing,
      destinationCidrs: input.routing.destinationCidrs.map((cidr) => validateCidr('routing destination', cidr)).sort(),
    },
    securityRules: [...input.securityRules].sort((a, b) => a.name.localeCompare(b.name)),
    brownfield: {
      resourceIds: [...new Set(input.brownfield.resourceIds.map((id) => id.toLowerCase()))].sort(),
      routeChanges: [...input.brownfield.routeChanges].sort((a, b) =>
        `${a.routeTableId}/${a.routeName}/${a.subnetId}`.localeCompare(`${b.routeTableId}/${b.routeName}/${b.subnetId}`),
      ),
    },
  };
}

function resourceById(observation: AzureCeObservation, id: string): AzureCeResourceObservation | undefined {
  return observation.resources.find((resource) => resource.id.toLowerCase() === id.toLowerCase());
}

function actionFactory() {
  let sequence = 0;
  return (action: Omit<AzureCeAction, 'id'>): AzureCeAction => ({
    ...action,
    id: String(++sequence).padStart(3, '0'),
  });
}

function tagsArgs(deploymentName: string): string[] {
  return [
    'xcsh-managed-by=azure-ce',
    `xcsh-deployment-id=${deploymentName}`,
    'xcsh-plan-sha256=__PLAN_SHA256__',
  ];
}

function groupId(subscriptionId: string, resourceGroup: string): string {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
}

function managedId(subscriptionId: string, resourceGroup: string, providerPath: string): string {
  return `${groupId(subscriptionId, resourceGroup)}/providers/${providerPath}`;
}

function zoneArgs(zones: string[], node: number): string[] {
  const zone = zones[node - 1] ?? zones[0];
  return zone ? ['--zone', zone] : [];
}

function ipv4Range(cidr: string): [number, number] | undefined {
  const [address, prefixText] = cidr.split('/');
  const octets = address.split('.').map(Number);
  const prefix = Number(prefixText);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return undefined;
  const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  const size = 2 ** (32 - prefix);
  const start = Math.floor(value / size) * size;
  return [start, start + size - 1];
}

function routeServerSubnetCidr(intent: AzureCeIntent): string {
  const occupied = intent.nics.flatMap((nic) => nic.subnet.cidr ? [ipv4Range(nic.subnet.cidr)] : []).filter((range): range is [number, number] => Boolean(range));
  const base = (10 * 256 * 256 * 256) + (255 * 256 * 256);
  for (let offset = 0; offset < 65_536; offset += 64) {
    const candidate: [number, number] = [base + offset, base + offset + 63];
    if (occupied.every(([start, end]) => candidate[1] < start || candidate[0] > end)) {
      const third = Math.floor(offset / 256);
      const fourth = offset % 256;
      return `10.255.${third}.${fourth}/26`;
    }
  }
  fail('no non-overlapping /26 is available for RouteServerSubnet');
}

function routeTableParts(resourceId: string): { resourceGroup: string; name: string } {
  const match = /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/routeTables\/([^/]+)$/i.exec(resourceId);
  if (!match) fail(`invalid route table resource ID: ${resourceId}`);
  return { resourceGroup: match[1], name: match[2] };
}

function subnetParts(resourceId: string): { resourceGroup: string; vnet: string; name: string } {
  const match = /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/virtualNetworks\/([^/]+)\/subnets\/([^/]+)$/i.exec(resourceId);
  if (!match) fail(`invalid subnet resource ID: ${resourceId}`);
  return { resourceGroup: match[1], vnet: match[2], name: match[3] };
}

function buildDeployActions(
  intent: AzureCeIntent,
  region: string,
  zones: string[],
  routingMode: 'udr' | 'route-server',
  imageUrn: string,
  termsAccepted: boolean,
  routeServerCidr?: string,
  createResourceGroup = true,
): AzureCeAction[] {
  const next = actionFactory();
  const actions: AzureCeAction[] = [];
  const tags = tagsArgs(intent.deploymentName);
  const greenfield = intent.nics.some((nic) => nic.subnet.mode === 'greenfield');

  if (!termsAccepted) {
    actions.push(next({
      phase: 'terms', kind: 'marketplace-terms-accept', description: `Accept Marketplace terms for ${imageUrn}`,
      command: 'az', args: ['vm', 'image', 'terms', 'accept', '--urn', imageUrn, '--subscription', intent.subscriptionId],
      mutates: true, destructive: false,
    }));
  }
  if (greenfield) {
    const addressPrefixes = [...new Set([
      ...intent.nics.flatMap((nic) => nic.subnet.mode === 'greenfield' && nic.subnet.cidr ? [nic.subnet.cidr] : []),
      ...(routeServerCidr ? [routeServerCidr] : []),
    ])].sort();
    if (createResourceGroup) {
      actions.push(next({
        phase: 'prerequisites', kind: 'resource-group-create', description: `Create resource group ${intent.resourceGroup}`,
        command: 'az', args: ['group', 'create', '--name', intent.resourceGroup, '--location', region, '--subscription', intent.subscriptionId, '--tags', ...tags],
        resourceId: groupId(intent.subscriptionId, intent.resourceGroup),
        mutates: true, destructive: false,
      }));
    }
    actions.push(next({
      phase: 'prerequisites', kind: 'vnet-create', description: `Create virtual network ${intent.deploymentName}-vnet`,
      command: 'az', args: ['network', 'vnet', 'create', '--resource-group', intent.resourceGroup, '--name', `${intent.deploymentName}-vnet`, '--location', region, '--address-prefixes', ...addressPrefixes, '--subscription', intent.subscriptionId, '--tags', ...tags],
      resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet`),
      mutates: true, destructive: false,
    }));
    for (const nic of intent.nics) {
      if (nic.subnet.mode !== 'greenfield') continue;
      actions.push(next({
        phase: 'prerequisites', kind: 'subnet-create', description: `Create subnet ${nic.subnet.name}`,
        command: 'az', args: ['network', 'vnet', 'subnet', 'create', '--resource-group', intent.resourceGroup, '--vnet-name', `${intent.deploymentName}-vnet`, '--name', nic.subnet.name ?? '', '--address-prefixes', nic.subnet.cidr ?? '', '--subscription', intent.subscriptionId],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`),
        mutates: true, destructive: false,
      }));
    }
  }
  if (intent.securityRules.length > 0) {
    actions.push(next({
      phase: 'prerequisites', kind: 'nsg-create', description: `Create explicit CE network security group ${intent.deploymentName}-nsg`,
      command: 'az', args: ['network', 'nsg', 'create', '--resource-group', intent.resourceGroup, '--name', `${intent.deploymentName}-nsg`, '--location', region, '--subscription', intent.subscriptionId, '--tags', ...tags],
      resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg`),
      mutates: true, destructive: false,
    }));
    for (const [index, rule] of intent.securityRules.entries()) {
      actions.push(next({
        phase: 'prerequisites', kind: 'nsg-rule-create', description: `Create explicit ${rule.purpose} rule ${rule.name}`,
        command: 'az', args: ['network', 'nsg', 'rule', 'create', '--resource-group', intent.resourceGroup, '--nsg-name', `${intent.deploymentName}-nsg`, '--name', rule.name, '--priority', String(100 + index), '--direction', rule.direction, '--protocol', rule.protocol, '--source-address-prefixes', ...rule.sourceCidrs, '--destination-address-prefixes', ...rule.destinationCidrs, '--destination-port-ranges', ...rule.destinationPorts, '--access', 'Allow', '--subscription', intent.subscriptionId],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg/securityRules/${rule.name}`),
        mutates: true, destructive: false,
      }));
    }
  }

  const nodeCount = intent.topology.ha ? 3 : 1;
  for (let node = 1; node <= nodeCount; node++) {
    const nodeName = `${intent.deploymentName}-${node}`;
    if (intent.egress.mode === 'public-ip') {
      actions.push(next({
        phase: 'nodes', kind: 'public-ip-create', description: `Create Standard public IP for ${nodeName}`,
        command: 'az', args: ['network', 'public-ip', 'create', '--resource-group', intent.resourceGroup, '--name', `${nodeName}-pip`, '--sku', 'Standard', '--allocation-method', 'Static', ...zoneArgs(zones, node), '--subscription', intent.subscriptionId, '--tags', ...tags],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/publicIPAddresses/${nodeName}-pip`),
        node, mutates: true, destructive: false,
      }));
    }
    for (const [index, nic] of intent.nics.entries()) {
      const subnetArgs = nic.subnet.resourceId
        ? ['--subnet', nic.subnet.resourceId]
        : ['--vnet-name', `${intent.deploymentName}-vnet`, '--subnet', nic.subnet.name ?? ''];
      const publicIpArgs = intent.egress.mode === 'public-ip' && index === 0 ? ['--public-ip-address', `${nodeName}-pip`] : [];
      const nsgArgs = intent.securityRules.length > 0 ? ['--network-security-group', `${intent.deploymentName}-nsg`] : [];
      actions.push(next({
        phase: 'nodes', kind: 'nic-create', description: `Create ordered NIC ${index} (${nic.role}) for ${nodeName}`,
        command: 'az', args: ['network', 'nic', 'create', '--resource-group', intent.resourceGroup, '--name', `${nodeName}-nic${index}`, ...subnetArgs, ...publicIpArgs, ...nsgArgs, '--subscription', intent.subscriptionId, '--tags', ...tags],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/networkInterfaces/${nodeName}-nic${index}`),
        node, mutates: true, destructive: false,
      }));
    }
    const nicNames = ['--nics', ...intent.nics.map((_nic, index) => `${nodeName}-nic${index}`)];
    actions.push(next({
      phase: 'nodes', kind: 'vm-create', description: `Launch ${nodeName} from the pinned CE image`,
      command: 'az', args: ['vm', 'create', '--resource-group', intent.resourceGroup, '--name', nodeName, '--image', imageUrn, '--size', intent.vm.size, ...zoneArgs(zones, node), ...nicNames, '--plan-name', intent.image.plan, '--plan-product', intent.image.offer, '--plan-publisher', intent.image.publisher, '--os-disk-size-gb', '80', '--os-disk-delete-option', 'Delete', '--custom-data', '__BOOTSTRAP_FILE__', '--subscription', intent.subscriptionId, '--tags', ...tags],
      resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${nodeName}`),
      node, mutates: true, destructive: false, requiresBootstrap: true,
    }));
    actions.push(next({
      phase: 'registration', kind: 'health-gate', description: `Wait for ${nodeName} registration and health`, node,
      mutates: false, destructive: false,
    }));
  }

  if (routingMode === 'route-server') {
    const hostedSubnetId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/RouteServerSubnet`);
    actions.push(next({
      phase: 'routing', kind: 'subnet-create', description: 'Create dedicated /26 RouteServerSubnet without NSG or UDR',
      command: 'az', args: ['network', 'vnet', 'subnet', 'create', '--resource-group', intent.resourceGroup, '--vnet-name', `${intent.deploymentName}-vnet`, '--name', 'RouteServerSubnet', '--address-prefixes', routeServerCidr ?? '', '--subscription', intent.subscriptionId],
      resourceId: hostedSubnetId,
      mutates: true, destructive: false,
    }));
    actions.push(next({
      phase: 'routing', kind: 'public-ip-create', description: `Create Standard public IP for Route Server ${intent.deploymentName}-rs`,
      command: 'az', args: ['network', 'public-ip', 'create', '--resource-group', intent.resourceGroup, '--name', `${intent.deploymentName}-rs-pip`, '--sku', 'Standard', '--allocation-method', 'Static', '--subscription', intent.subscriptionId, '--tags', ...tags],
      resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/publicIPAddresses/${intent.deploymentName}-rs-pip`),
      mutates: true, destructive: false,
    }));
    actions.push(next({
      phase: 'routing', kind: 'route-server-create', description: `Create Route Server ${intent.deploymentName}-rs`,
      command: 'az', args: ['network', 'routeserver', 'create', '--resource-group', intent.resourceGroup, '--name', `${intent.deploymentName}-rs`, '--hosted-subnet', hostedSubnetId, '--public-ip-address', `${intent.deploymentName}-rs-pip`, '--subscription', intent.subscriptionId, '--tags', ...tags],
      resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs`),
      mutates: true, destructive: false,
    }));
    for (let node = 1; node <= nodeCount; node++) {
      actions.push(next({
        phase: 'routing', kind: 'route-server-peer-create', description: `Peer CE node ${node} with both Route Server instances`,
        command: 'az', args: ['network', 'routeserver', 'peering', 'create', '--resource-group', intent.resourceGroup, '--routeserver', `${intent.deploymentName}-rs`, '--name', `${intent.deploymentName}-${node}`, '--peer-ip', `__NODE_${node}_SLI_PRIVATE_IP__`, '--peer-asn', String(intent.routing.peerAsn ?? 65010), '--subscription', intent.subscriptionId],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs/bgpConnections/${intent.deploymentName}-${node}`),
        node, mutates: true, destructive: false,
      }));
    }
    actions.push(next({ phase: 'verify', kind: 'bgp-gate', description: 'Verify both Route Server BGP instances and learned routes', mutates: false, destructive: false }));
  } else {
    if (intent.brownfield.routeChanges.length > 0) {
      for (const change of intent.brownfield.routeChanges) {
        const table = routeTableParts(change.routeTableId);
        const subnet = subnetParts(change.subnetId);
        actions.push(next({
          phase: 'routing', kind: 'route-create', description: `Create approved brownfield route ${change.routeName}`,
          command: 'az', args: ['network', 'route-table', 'route', 'create', '--resource-group', table.resourceGroup, '--route-table-name', table.name, '--name', change.routeName, '--address-prefix', change.destinationCidr, '--next-hop-type', 'VirtualAppliance', '--next-hop-ip-address', '__NODE_1_DATA_PRIVATE_IP__', '--subscription', intent.subscriptionId],
          resourceId: change.routeTableId, mutates: true, destructive: false,
        }));
        actions.push(next({
          phase: 'routing', kind: 'route-association-update', description: `Associate only approved subnet ${change.subnetId}`,
          command: 'az', args: ['network', 'vnet', 'subnet', 'update', '--resource-group', subnet.resourceGroup, '--vnet-name', subnet.vnet, '--name', subnet.name, '--route-table', change.routeTableId, '--subscription', intent.subscriptionId],
          resourceId: change.subnetId, mutates: true, destructive: false,
        }));
      }
    } else {
      actions.push(next({
        phase: 'routing', kind: 'route-table-create', description: `Create route table ${intent.deploymentName}-rt`,
        command: 'az', args: ['network', 'route-table', 'create', '--resource-group', intent.resourceGroup, '--name', `${intent.deploymentName}-rt`, '--subscription', intent.subscriptionId, '--tags', ...tags],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/routeTables/${intent.deploymentName}-rt`),
        mutates: true, destructive: false,
      }));
      for (const [index, destination] of intent.routing.destinationCidrs.entries()) {
        actions.push(next({
          phase: 'routing', kind: 'route-create', description: `Route ${destination} through the CE data-plane private IP`,
          command: 'az', args: ['network', 'route-table', 'route', 'create', '--resource-group', intent.resourceGroup, '--route-table-name', `${intent.deploymentName}-rt`, '--name', `ce-route-${index + 1}`, '--address-prefix', destination, '--next-hop-type', 'VirtualAppliance', '--next-hop-ip-address', '__NODE_1_DATA_PRIVATE_IP__', '--subscription', intent.subscriptionId],
          resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/routeTables/${intent.deploymentName}-rt/routes/ce-route-${index + 1}`),
          mutates: true, destructive: false,
        }));
      }
    }
  }
  actions.push(next({ phase: 'verify', kind: 'traffic-gate', description: 'Verify end-to-end traffic, routes, and CE health', mutates: false, destructive: false }));
  return actions;
}

function buildLifecycleActions(intent: AzureCeIntent, observation: AzureCeObservation, zones: string[]): AzureCeAction[] {
  const next = actionFactory();
  const nodeCount = intent.topology.ha ? 3 : 1;
  const actions: AzureCeAction[] = [];
  const nodes = intent.operation === 'replace-node' && intent.replacementNode ? [intent.replacementNode] : Array.from({ length: nodeCount }, (_, index) => index + 1);
  const verbByOperation = {
    start: ['vm-start', ['vm', 'start']] as const,
    stop: ['vm-stop', ['vm', 'deallocate']] as const,
    resize: ['vm-resize', ['vm', 'resize', '--size', intent.vm.size]] as const,
  };
  if (intent.operation in verbByOperation) {
    const [kind, baseArgs] = verbByOperation[intent.operation as keyof typeof verbByOperation];
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      actions.push(next({
        phase: 'nodes', kind, description: `${intent.operation} ${name}`,
        command: 'az', args: [...baseArgs.slice(0, 2), '--resource-group', intent.resourceGroup, '--name', name, ...baseArgs.slice(2), '--subscription', intent.subscriptionId],
        resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`),
        node, mutates: true, destructive: intent.operation === 'replace-node',
      }));
      if (intent.topology.ha) actions.push(next({ phase: 'registration', kind: 'health-gate', description: `Gate node ${node} before continuing`, node, mutates: false, destructive: false }));
    }
    return actions;
  }
  if (intent.operation === 'replace-node') {
    if (!intent.replacementNode || intent.replacementNode < 1 || intent.replacementNode > nodeCount) fail(`replacementNode must be between 1 and ${nodeCount}`);
    const node = intent.replacementNode;
    const name = `${intent.deploymentName}-${node}`;
    const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
    actions.push(next({
      phase: 'nodes', kind: 'vm-delete', description: `Delete only owned node ${name}`,
      command: 'az', args: ['vm', 'delete', '--resource-group', intent.resourceGroup, '--name', name, '--yes', '--subscription', intent.subscriptionId],
      resourceId: vmId, node, mutates: true, destructive: true,
    }));
    const nicArgs = ['--nics', ...intent.nics.map((_nic, index) => `${name}-nic${index}`)];
    actions.push(next({
      phase: 'nodes', kind: 'vm-create', description: `Replace ${name} from the pinned CE image`,
      command: 'az', args: ['vm', 'create', '--resource-group', intent.resourceGroup, '--name', name, '--image', observation.image.urn, '--size', intent.vm.size, ...zoneArgs(zones, node), ...nicArgs, '--plan-name', intent.image.plan, '--plan-product', intent.image.offer, '--plan-publisher', intent.image.publisher, '--os-disk-size-gb', '80', '--os-disk-delete-option', 'Delete', '--custom-data', '__BOOTSTRAP_FILE__', '--subscription', intent.subscriptionId, '--tags', ...tagsArgs(intent.deploymentName)],
      resourceId: vmId, node, mutates: true, destructive: false, requiresBootstrap: true,
    }));
    actions.push(next({ phase: 'registration', kind: 'health-gate', description: `Verify replacement node ${node} registration, health, and routing`, node, mutates: false, destructive: false }));
    actions.push(next({ phase: 'verify', kind: 'traffic-gate', description: `Verify traffic after replacing node ${node}`, node, mutates: false, destructive: false }));
    return actions;
  }
  if (intent.operation === 'update-network') {
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
      actions.push(next({
        phase: 'nodes', kind: 'vm-deallocate', description: `Deallocate ${name} before the symmetric NIC update`,
        command: 'az', args: ['vm', 'deallocate', '--resource-group', intent.resourceGroup, '--name', name, '--subscription', intent.subscriptionId],
        resourceId: vmId, node, mutates: true, destructive: false,
      }));
      for (const [index, nic] of intent.nics.entries()) {
        const subnetId = nic.subnet.resourceId ?? managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`);
        actions.push(next({
          phase: 'nodes', kind: 'nic-update', description: `Update NIC ${index} (${nic.role}) on ${name}`,
          command: 'az', args: ['network', 'nic', 'ip-config', 'update', '--resource-group', intent.resourceGroup, '--nic-name', `${name}-nic${index}`, '--name', 'ipconfig1', '--subnet', subnetId, '--subscription', intent.subscriptionId],
          resourceId: managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Network/networkInterfaces/${name}-nic${index}`),
          node, mutates: true, destructive: false,
        }));
      }
      actions.push(next({
        phase: 'nodes', kind: 'vm-start', description: `Start ${name} after NIC update`,
        command: 'az', args: ['vm', 'start', '--resource-group', intent.resourceGroup, '--name', name, '--subscription', intent.subscriptionId],
        resourceId: vmId, node, mutates: true, destructive: false,
      }));
      actions.push(next({ phase: 'registration', kind: 'health-gate', description: `Gate ${name} registration, health, data-plane restart, and routing`, node, mutates: false, destructive: false }));
      actions.push(next({ phase: 'verify', kind: 'traffic-gate', description: `Gate traffic before updating another node`, node, mutates: false, destructive: false }));
    }
    return actions;
  }
  if (intent.operation === 'teardown') {
    for (const change of [...intent.brownfield.routeChanges].reverse()) {
      const table = routeTableParts(change.routeTableId);
      const subnet = subnetParts(change.subnetId);
      const tableState = resourceById(observation, change.routeTableId)?.state ?? {};
      const subnetState = resourceById(observation, change.subnetId)?.state ?? {};
      const routes = Array.isArray(tableState.routes) ? tableState.routes as Array<Record<string, unknown>> : [];
      const previous = routes.find((route) => String(route.name ?? (route.properties as Record<string, unknown> | undefined)?.name) === change.routeName);
      const previousProperties = (previous?.properties as Record<string, unknown> | undefined) ?? previous;
      const routeArgs = previous
        ? ['network', 'route-table', 'route', 'create', '--resource-group', table.resourceGroup, '--route-table-name', table.name, '--name', change.routeName, '--address-prefix', String(previousProperties?.addressPrefix ?? change.destinationCidr), '--next-hop-type', String(previousProperties?.nextHopType ?? 'None')]
        : ['network', 'route-table', 'route', 'delete', '--resource-group', table.resourceGroup, '--route-table-name', table.name, '--name', change.routeName];
      if (previousProperties?.nextHopIpAddress) routeArgs.push('--next-hop-ip-address', String(previousProperties.nextHopIpAddress));
      actions.push(next({
        phase: 'teardown', kind: 'brownfield-restore', description: `Restore approved route ${change.routeName} exactly`,
        command: 'az', args: [...routeArgs, '--subscription', intent.subscriptionId], resourceId: change.routeTableId,
        mutates: true, destructive: false,
      }));
      const previousRouteTable = (subnetState.routeTable as Record<string, unknown> | null | undefined)?.id;
      actions.push(next({
        phase: 'teardown', kind: 'brownfield-restore', description: `Restore approved subnet route-table association exactly`,
        command: 'az', args: ['network', 'vnet', 'subnet', 'update', '--resource-group', subnet.resourceGroup, '--vnet-name', subnet.vnet, '--name', subnet.name, ...(previousRouteTable ? ['--route-table', String(previousRouteTable)] : ['--remove', 'routeTable']), '--subscription', intent.subscriptionId],
        resourceId: change.subnetId, mutates: true, destructive: false,
      }));
    }
    const teardownPriority = (resource: AzureCeResourceObservation): number => {
      const id = resource.id.toLowerCase();
      if (id.includes('/bgpconnections/')) return 10;
      if (id.includes('/virtualmachines/')) return 20;
      if (id.includes('/networkinterfaces/')) return 30;
      if (id.includes('/virtualhubs/')) return 40;
      if (id.includes('/publicipaddresses/')) return 50;
      if (id.includes('/routetables/')) return 60;
      if (id.includes('/networksecuritygroups/')) return 70;
      if (id.includes('/virtualnetworks/')) return 80;
      if (!id.includes('/providers/')) return 100;
      return 90;
    };
    const owned = observation.resources
      .filter((resource) => resource.exists && resource.owned && resource.tags['xcsh-managed-by'] === 'azure-ce' && resource.tags['xcsh-deployment-id'] === intent.deploymentName)
      .sort((a, b) => teardownPriority(a) - teardownPriority(b) || a.id.localeCompare(b.id));
    for (const resource of owned) actions.push(next({
      phase: 'teardown', kind: 'resource-delete', description: `Delete owned resource ${resource.id}`,
      command: 'az', args: resource.id.includes('/providers/')
        ? ['resource', 'delete', '--ids', resource.id, '--subscription', intent.subscriptionId]
        : ['group', 'delete', '--name', intent.resourceGroup, '--yes', '--subscription', intent.subscriptionId],
      resourceId: resource.id, mutates: true, destructive: true,
    }));
    return actions;
  }
  actions.push(next({ phase: 'verify', kind: 'health-gate', description: `Reconcile and verify ${intent.deploymentName}`, mutates: false, destructive: false }));
  return actions;
}

export function compileAzureCePlan(input: AzureCeIntent, observation: AzureCeObservation): AzureCePlan {
  const intent = normalizeIntent(input);
  if (observation.schemaVersion !== 1) fail('unsupported observation schema');
  if (observation.subscription.cloud !== 'AzureCloud') fail('only AzureCloud is supported');
  if (observation.subscription.id.toLowerCase() !== intent.subscriptionId) fail('observation subscription does not match intent');
  if (observation.image.version.toLowerCase() === 'latest') fail('image version latest is forbidden');
  for (const field of ['publisher', 'offer', 'plan'] as const) {
    if (observation.image[field].toLowerCase() !== intent.image[field].toLowerCase()) fail(`observed image ${field} does not match intent`);
  }

  const eligibleRegions = [...observation.regions].filter((region) => region.eligible).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const region = intent.region ? observation.regions.find((candidate) => candidate.name.toLowerCase() === intent.region) : eligibleRegions[0];
  if (!region?.eligible) fail(`region ${intent.region ?? '<recommended>'} is not eligible`);
  const size = region.vmSizes.find((candidate) => candidate.name.toLowerCase() === intent.vm.size.toLowerCase());
  if (!size || size.restricted) fail(`VM size ${intent.vm.size} is unavailable or restricted in ${region.name}`);
  if (size.vCpus < 8 || size.memoryGb < 32) fail(`VM size ${intent.vm.size} is below the CE minimum of 8 vCPUs and 32 GB memory`);
  if (size.maxNics < intent.nics.length) fail(`VM size ${intent.vm.size} NIC limit ${size.maxNics} is below requested NIC count ${intent.nics.length}`);
  const nodeCount = intent.topology.ha ? 3 : 1;
  const requiredCores = size.vCpus * nodeCount;
  if (!Number.isInteger(size.vCpus) || size.vCpus < 1) fail(`VM size ${intent.vm.size} has no valid observed vCPU capability`);
  if (region.quotaAvailable < requiredCores) fail(`insufficient regional vCPU quota: ${requiredCores} required for ${nodeCount} nodes`);

  for (const id of intent.brownfield.resourceIds) {
    const observed = resourceById(observation, id);
    if (!observed?.exists) fail(`brownfield resource was not observed: ${id}`);
    if (observed.owned) fail(`pre-existing brownfield resource cannot be adopted as owned: ${id}`);
  }
  const targetGroupId = groupId(intent.subscriptionId, intent.resourceGroup).toLowerCase();
  const targetGroup = resourceById(observation, targetGroupId);
  const targetGroupApproved = intent.brownfield.resourceIds.some((id) => id.toLowerCase() === targetGroupId);
  if (targetGroup?.exists && !targetGroup.owned && !targetGroupApproved) fail(`pre-existing resource group must be explicitly selected as brownfield: ${targetGroupId}`);

  const warnings: string[] = [];
  const requestedZones = intent.vm.zones ?? [];
  let zones: string[];
  if (intent.topology.ha) {
    const available = requestedZones.length ? requestedZones.filter((zone) => size.zones.includes(zone)) : size.zones;
    if (available.length >= 3) zones = available.slice(0, 3);
    else {
      zones = available.length ? Array.from({ length: 3 }, (_, index) => available[index] ?? available[0]) : [];
      warnings.push(available.length
        ? `Three distinct zones are unavailable in ${region.name}; the approved plan uses ${zones.join(', ')}`
        : `Availability zones are unavailable in ${region.name}; the approved plan uses a regional deployment`);
    }
  } else {
    const zone = requestedZones.find((candidate) => size.zones.includes(candidate)) ?? size.zones[0];
    zones = zone ? [zone] : [];
    if (requestedZones.length && !requestedZones.includes(zone ?? '')) warnings.push(`Requested zone placement is unavailable in ${region.name}; the approved plan uses ${zone ?? 'a regional deployment'}`);
  }

  const allGreenfield = intent.nics.every((nic) => nic.subnet.mode === 'greenfield');
  const routingMode = intent.routing.mode === 'auto' ? (intent.topology.ha && allGreenfield ? 'route-server' : 'udr') : intent.routing.mode;
  if (routingMode === 'route-server' && !intent.topology.ha) fail('Route Server routing requires three-node HA');
  if (routingMode === 'route-server' && !allGreenfield) fail('same-VNet brownfield Route Server insertion is unsupported; use explicitly approved UDR associations');
  if (routingMode === 'route-server' && !region.routeServerSupported) fail(`Route Server is unsupported in ${region.name}`);
  if (intent.egress.mode !== 'public-ip' && !intent.egress.resourceId) fail(`${intent.egress.mode} egress requires an explicit resourceId`);
  if (intent.egress.resourceId) {
    validateResourceId(intent.egress.resourceId, intent.subscriptionId);
    if (!intent.brownfield.resourceIds.some((id) => id.toLowerCase() === intent.egress.resourceId?.toLowerCase())) fail('selected egress resource must be explicitly listed in brownfield.resourceIds');
    if (!resourceById(observation, intent.egress.resourceId)?.exists) fail('selected egress resource was not observed');
  }
  if ((intent.egress.mode === 'firewall' || intent.egress.mode === 'proxy')) warnings.push('Strict FQDN egress is delegated to the explicitly selected firewall/proxy profile');
  if (intent.securityRules.some((rule) => [...rule.sourceCidrs, ...rule.destinationCidrs].some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0'))) warnings.push('Broad CIDR exposure requires explicit approval');
  if (intent.securityRules.some((rule) => rule.purpose === 'management' && rule.direction === 'Inbound')) warnings.push('Inbound management exposure requires explicit approval');
  if (!intent.topology.ha && ['resize', 'replace-node', 'update-network'].includes(intent.operation)) warnings.push('This single-node lifecycle operation is disruptive and requires a maintenance window');

  const rollbackRoutes = intent.brownfield.routeChanges.map((change) => {
    const observed = resourceById(observation, change.routeTableId);
    if (!observed?.exists) fail(`route table was not observed: ${change.routeTableId}`);
    const observedSubnet = resourceById(observation, change.subnetId);
    if (!observedSubnet?.exists) fail(`subnet was not observed: ${change.subnetId}`);
    return { routeTableId: change.routeTableId, subnetId: change.subnetId, routeName: change.routeName, before: observed.state, beforeSubnet: observedSubnet.state };
  });
  const ownershipInventory: AzureCePlanDraft['ownershipInventory'] = intent.brownfield.resourceIds.map((resourceId) => ({
    resourceId,
    owned: false,
    action: intent.brownfield.routeChanges.some((change) =>
      change.routeTableId.toLowerCase() === resourceId.toLowerCase() || change.subnetId.toLowerCase() === resourceId.toLowerCase())
      ? ('modify-approved' as const)
      : ('reference' as const),
  }));

  const routeServerCidr = routingMode === 'route-server' ? routeServerSubnetCidr(intent) : undefined;
  const actions = ['deploy'].includes(intent.operation)
    ? buildDeployActions(intent, region.name, zones, routingMode, observation.image.urn, observation.image.termsAccepted, routeServerCidr, !targetGroup?.exists)
    : buildLifecycleActions(intent, observation, zones);
  for (const action of actions) {
    if (!action.resourceId || ownershipInventory.some((item) => item.resourceId.toLowerCase() === action.resourceId?.toLowerCase())) continue;
    if (action.kind === 'resource-delete') ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'delete' });
    else if (['resource-group-create', 'vnet-create', 'subnet-create', 'nsg-create', 'nsg-rule-create', 'public-ip-create', 'nic-create', 'vm-create', 'route-table-create', 'route-server-create', 'route-server-peer-create'].includes(action.kind)) {
      ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'create' });
    }
  }
  for (const resource of observation.resources) {
    if (!resource.owned || resource.tags['xcsh-managed-by'] !== 'azure-ce' || resource.tags['xcsh-deployment-id'] !== intent.deploymentName) continue;
    if (ownershipInventory.some((item) => item.resourceId.toLowerCase() === resource.id.toLowerCase())) continue;
    ownershipInventory.push({ resourceId: resource.id, owned: true, action: 'reference' });
  }
  const billableResources = [
    { type: 'virtual-machine', count: nodeCount },
    { type: 'managed-disk', count: nodeCount },
    ...(intent.egress.mode === 'public-ip' ? [{ type: 'standard-public-ip', count: nodeCount }] : []),
    ...(routingMode === 'route-server' ? [{ type: 'route-server', count: 1 }, { type: 'standard-public-ip', count: 1 }] : []),
  ];
  const draft: AzureCePlanDraft = {
    schemaVersion: 1,
    intent,
    subscription: observation.subscription,
    deploymentName: intent.deploymentName,
    siteName: intent.siteName,
    namespace: intent.namespace,
    region: region.name,
    topology: { ha: intent.topology.ha, nodeCount: nodeCount as 1 | 3, zones },
    nics: intent.nics.map((nic, index) => ({ ...nic, index })),
    egress: intent.egress,
    routing: { mode: routingMode, destinationCidrs: intent.routing.destinationCidrs, localAsn: intent.routing.localAsn ?? 65010, peerAsn: intent.routing.peerAsn ?? 65010 },
    securityRules: intent.securityRules,
    image: observation.image,
    vm: intent.vm,
    warnings,
    billableResources,
    actions,
    rollback: { brownfieldRoutes: rollbackRoutes },
    observationFingerprint: fingerprintObservation(observation, intent.brownfield.resourceIds),
    ownershipInventory,
    ownershipTagTemplate: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': '__PLAN_SHA256__',
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
