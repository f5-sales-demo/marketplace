import { isIP } from 'node:net';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { azureRelayResourceSource } from './relay-replacement-plan';
import type { AzureCePlan, AzureCeVmSizeObservation } from './types';

export interface AzureRelaySelection {
  vmSize: string;
  hostImage: { publisher: string; offer: string; sku: string; version: string };
  frr: { version: string; image: string };
  relays: Array<{ asn: number; privateAddress: string }>;
  vipPrefixes: string[];
  returnPrefixes: string[];
  docker: { version: string; sha256: string };
}
export interface AzureRelayCatalog {
  region: string;
  image: { id: string; urn: string; osType: 'Linux'; architecture: 'amd64' };
  vmSizes: AzureCeVmSizeObservation[];
}
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay plan: ${message}`);
};
const safeName = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const reservedAsns = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
const validAsn = (asn: number) =>
  Number.isInteger(asn) && asn > 0 && asn < 65535 && !reservedAsns.has(asn) && !(asn >= 64496 && asn <= 64511);
const ipv4Number = (address: string) => address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
const unicastIpv4 = (value: string) => {
  if (isIP(value) !== 4) return false;
  const [first, second] = value.split('.').map(Number);
  return first !== 0 && first !== 127 && first < 224 && !(first === 169 && second === 254);
};
function subnetRange(cidr: string) {
  const [address, prefix, extra] = cidr.split('/');
  require(extra === undefined &&
    isIP(address) === 4 &&
    /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix), 'SLO requires a canonical IPv4 subnet');
  const start = ipv4Number(address);
  const size = 2 ** (32 - Number(prefix));
  require(start % size === 0 && size >= 8, 'SLO subnet is not a usable canonical network');
  return [start, start + size - 1];
}

/** Internal saved-plan component. Public planning/lifecycle integration validates catalog provenance separately. */
export function compileAzureRelayPlan(source: AzureCePlan, selected: AzureRelaySelection, catalog: AzureRelayCatalog) {
  verifyAzureCePlan(source);
  require(source.intent.operation === 'deploy' &&
    source.routing.mode === 'route-server', 'owning Route Server creation plan required');
  require(catalog?.region === source.region &&
    catalog.image?.osType === 'Linux' &&
    catalog.image?.architecture === 'amd64', 'region-bound Linux host image observation required');
  require(selected && safeName.test(selected.vmSize), 'resolved relay VM size required');
  const sizes = catalog.vmSizes.filter((size) => size.name === selected.vmSize);
  require(sizes.length === 1 &&
    !sizes[0].restricted &&
    sizes[0].maxNics >= 1 &&
    sizes[0].vCpus >= 2 &&
    sizes[0].memoryGb >= 4, 'eligible relay VM size observation required');
  const image = selected.hostImage;
  require(image &&
    [image.publisher, image.offer, image.sku].every((value) => typeof value === 'string' && safeName.test(value)) &&
    /^\d+\.\d+\.\d+$/.test(image.version), 'resolved exact relay host image required');
  const urn = [image.publisher, image.offer, image.sku, image.version].join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${image.publisher}/artifacttypes/vmimage/offers/${image.offer}/skus/${image.sku}/versions/${image.version}`;
  require(catalog.image.urn.toLowerCase() === urn.toLowerCase() &&
    catalog.image.id.toLowerCase() === imageId.toLowerCase(), 'host image identity differs from catalog');
  require(selected.frr &&
    /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(selected.frr.version) &&
    /^[a-z0-9.-]+(?::[0-9]+)?\/(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*@sha256:[a-f0-9]{64}$/.test(
      selected.frr.image,
    ), 'resolved FRR version and immutable OCI digest required');
  require(Array.isArray(selected.vipPrefixes) &&
    selected.vipPrefixes.length > 0 &&
    selected.vipPrefixes.length <= 8 &&
    new Set(selected.vipPrefixes).size === selected.vipPrefixes.length &&
    selected.vipPrefixes.every(
      (prefix) => prefix.endsWith('/32') && unicastIpv4(prefix.slice(0, -3)),
    ), 'explicit distinct IPv4 VIP host-prefix export policy required');
  require(selected.docker &&
    /^\d+\.\d+\.\d+$/.test(selected.docker.version) &&
    /^[a-f0-9]{64}$/.test(selected.docker.sha256), 'exact static Docker version and archive digest required');
  require(Array.isArray(selected.returnPrefixes) &&
    selected.returnPrefixes.length > 0 &&
    selected.returnPrefixes.length <= 32 &&
    new Set(selected.returnPrefixes).size === selected.returnPrefixes.length &&
    selected.returnPrefixes.every((value) => {
      const [address, prefix, extra] = typeof value === 'string' ? value.split('/') : [];
      return (
        extra === undefined &&
        isIP(address) === 4 &&
        /^(?:[1-9]|[12][0-9]|3[0-2])$/.test(prefix) &&
        unicastIpv4(address) &&
        ipv4Number(address) % 2 ** (32 - Number(prefix)) === 0
      );
    }), 'explicit distinct canonical return prefix policy required');
  const slo = source.nics.filter((nic) => nic.role === 'slo');
  require(slo.length === 1 && typeof slo[0].subnet.cidr === 'string', 'one resolved SLO subnet required');
  const sloCidr = slo[0].subnet.cidr as string;
  const [start, end] = subnetRange(sloCidr);
  const subnetActions = source.actions.filter(
    (action) =>
      action.kind === 'subnet-create' && action.args?.[action.args.indexOf('--name') + 1] === slo[0].subnet.name,
  );
  require(subnetActions.length === 1 &&
    typeof subnetActions[0].resourceId === 'string', 'owned SLO subnet creation identity required');
  const sloSubnetId = subnetActions[0].resourceId as string;
  const vnetId = sloSubnetId.slice(0, sloSubnetId.lastIndexOf('/subnets/'));
  const vnets = source.actions.filter((action) => action.kind === 'vnet-create' && action.resourceId === vnetId);
  require(vnets.length === 1, 'owned SLO VNet creation identity required');
  const servers = source.actions.filter((action) => action.kind === 'route-server-create');
  require(servers.length === 1 &&
    typeof servers[0].resourceId === 'string', 'exact Route Server creation identity required');
  require(Array.isArray(selected.relays) &&
    selected.relays.length === 2 &&
    new Set(selected.relays.map((relay) => relay.privateAddress)).size ===
      2, 'two distinct relay NIC addresses required');
  for (const relay of selected.relays)
    require(validAsn(relay.asn) &&
      relay.asn !== source.routing.localAsn &&
      unicastIpv4(relay.privateAddress) &&
      ipv4Number(relay.privateAddress) > start + 3 &&
      ipv4Number(relay.privateAddress) < end, 'usable SLO NIC address and external relay ASN required');
  const scope = `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}/providers/`;
  const stem =
    source.deploymentName.length <= 48
      ? source.deploymentName
      : `${source.deploymentName.slice(0, 39)}-${canonicalSha256(source.deploymentName).slice(0, 8)}`;
  const relays = selected.relays.map((relay, index) => {
    const name = `${stem}-relay-${index + 1}`;
    const nicId = `${scope}Microsoft.Network/networkInterfaces/${name}-nic`;
    return {
      name,
      ...relay,
      vmId: `${scope}Microsoft.Compute/virtualMachines/${name}`,
      osDiskName: `${name}-osdisk`,
      osDiskId: `${scope}Microsoft.Compute/disks/${name}-osdisk`,
      nicId,
      ipConfigurationId: `${nicId}/ipConfigurations/ipconfig1`,
      subnetId: sloSubnetId,
      publicIpId: source.egress.mode === 'public-ip' ? `${scope}Microsoft.Network/publicIPAddresses/${name}-pip` : null,
    };
  });
  const draft = {
    schemaVersion: 1 as const,
    engine: source.engine,
    sourcePlanId: source.planId,
    sourcePlanSha256: source.planSha256,
    subscriptionId: source.subscription.id,
    region: source.region,
    deploymentName: source.deploymentName,
    vnetId,
    sloSubnetId,
    sloCidr,
    routeServerId: servers[0].resourceId as string,
    catalog: structuredClone(catalog),
    vmSize: selected.vmSize,
    hostImage: { ...image, id: catalog.image.id, urn: catalog.image.urn },
    frr: { ...selected.frr },
    relays,
    localAsn: source.routing.localAsn,
    expectedSessions: source.topology.nodeCount * 2,
    payloadNetwork: 'slo' as const,
    vipPrefixes: selected.vipPrefixes.toSorted(),
    returnPrefixes: selected.returnPrefixes.toSorted(),
    docker: {
      ...selected.docker,
      url: `https://download.docker.com/linux/static/stable/x86_64/docker-${selected.docker.version}.tgz`,
    },
    billableResources: [
      { type: 'relay-virtual-machine', count: 2 },
      { type: 'relay-os-disk', count: 2 },
      { type: 'relay-network-interface', count: 2 },
      ...(source.egress.mode === 'public-ip' ? [{ type: 'relay-public-ip', count: 2 }] : []),
    ],
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-relay-${planSha256.slice(0, 24)}`, planSha256 };
}
export type AzureRelayPlan = ReturnType<typeof compileAzureRelayPlan>;
export function verifyAzureRelayPlan(source: AzureCePlan, plan: AzureRelayPlan): void {
  verifyAzureCePlan(source);
  source = azureRelayResourceSource(source);
  const { planSha256, planId, ...draft } = plan;
  require(plan.schemaVersion === 1 &&
    plan.engine === source.engine &&
    plan.sourcePlanId === source.planId &&
    plan.sourcePlanSha256 === source.planSha256 &&
    plan.subscriptionId === source.subscription.id &&
    plan.region === source.region &&
    plan.deploymentName === source.deploymentName &&
    planSha256 === canonicalSha256(draft) &&
    planId === `azure-relay-${planSha256.slice(0, 24)}`, 'saved plan integrity or source ownership differs');
  const reconstructed = compileAzureRelayPlan(
    source,
    {
      vmSize: plan.vmSize,
      hostImage: plan.hostImage,
      frr: plan.frr,
      relays: plan.relays.map(({ asn, privateAddress }) => ({ asn, privateAddress })),
      vipPrefixes: plan.vipPrefixes,
      returnPrefixes: plan.returnPrefixes,
      docker: plan.docker,
    },
    plan.catalog,
  );
  require(canonicalSha256(reconstructed) ===
    canonicalSha256(plan), 'saved plan no longer matches its source-derived resource graph');
}
export function azureRelayOwnershipTags(source: AzureCePlan, plan: AzureRelayPlan) {
  verifyAzureRelayPlan(source, plan);
  return {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': azureRelayResourceSource(source).planSha256,
    'xcsh-relay-plan-sha256': plan.planSha256,
  };
}
