import { PROJECT_ID_PATTERN } from '../gcloud/types';
import { validateGcpSiteAccess } from './site-access';
import { GCP_CE_IMAGE_PROJECT, GCP_CE_OPERATIONS, type GcpCeImage, type GcpCeIntent } from './types';

const NAME = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$|^[a-z]$/;
export function validateScope(project: string, region?: string) {
  if (!PROJECT_ID_PATTERN.test(project)) throw new Error('Invalid explicit GCP project');
  if (region !== undefined && !/^[a-z]+(?:-[a-z]+)+\d$/.test(region)) throw new Error('Invalid GCP region');
}
function name(value: string) {
  if (typeof value !== 'string' || !NAME.test(value)) throw new Error('Invalid GCP resource name');
}
export function ipv4Range(cidr: string): [number, number] {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr);
  if (!match) throw new Error('Invalid IPv4 CIDR');
  const octets = match.slice(1, 5).map(Number);
  const prefix = Number(match[5]);
  if (octets.some((value) => value > 255) || prefix > 32) throw new Error('Invalid IPv4 CIDR');
  const ip = octets.reduce((value, octet) => value * 256 + octet, 0);
  const size = 2 ** (32 - prefix);
  if (ip % size !== 0) throw new Error('CIDR must use a network boundary');
  return [ip, ip + size - 1];
}
export function validateImage(image: GcpCeImage) {
  name(image.name);
  if (!/^f5xc-ce(?:-crt|crt)-[a-z0-9-]+$/.test(image.name)) throw new Error('Image is not an F5 CE image');
  const expected = `https://www.googleapis.com/compute/v1/projects/${GCP_CE_IMAGE_PROJECT}/global/images/${image.name}`;
  if (
    !/^\d+$/.test(image.id) ||
    image.selfLink !== expected ||
    image.status !== 'READY' ||
    image.architecture !== 'X86_64'
  )
    throw new Error('Image must pin an exact ready x86 F5-owned image identity');
  if (
    !Array.isArray(image.licenses) ||
    image.licenses.length === 0 ||
    image.licenses.some(
      (license) =>
        !/^https:\/\/www\.googleapis\.com\/compute\/v1\/projects\/[a-z][a-z0-9-]+\/global\/licenses\/[a-z0-9-]+$/.test(
          license,
        ),
    )
  )
    throw new Error('Image must pin its exact license identities');
}
function keys(value: object, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('Unsupported intent field');
}
export function validateIntent(intent: GcpCeIntent) {
  if (intent?.schemaVersion !== 1) throw new Error('Unsupported GCP CE intent version');
  keys(intent, [
    'schemaVersion',
    'project',
    'region',
    'deploymentName',
    'platformContext',
    'engine',
    'operation',
    'sites',
    'machineType',
    'diskGiB',
    'image',
    'ipForwarding',
    'initialVersions',
    'initialAccess',
    'egress',
    'ingress',
    'routing',
  ]);
  keys(intent.image, ['id', 'name', 'selfLink', 'licenses', 'architecture', 'status']);
  keys(intent.egress, ['mode', 'resource']);
  keys(intent.ingress, ['profile']);
  keys(intent.routing, ['profile', 'destinationCidrs']);
  validateScope(intent.project, intent.region);
  name(intent.deploymentName);
  name(intent.machineType);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$/.test(intent.platformContext)) throw new Error('Explicit F5 context required');
  if (!['native', 'terraform'].includes(intent.engine)) throw new Error('Explicit owning engine required');
  if (!GCP_CE_OPERATIONS.includes(intent.operation)) throw new Error('Unsupported CE operation');
  if (intent.ipForwarding !== true) throw new Error('CE requires IP forwarding');
  if (!Number.isInteger(intent.diskGiB) || intent.diskGiB < 80) throw new Error('CE disk requires at least 80 GiB');
  validateImage(intent.image);
  if (intent.initialAccess !== undefined) validateGcpSiteAccess(intent.initialAccess);
  if (intent.initialVersions) {
    keys(intent.initialVersions, ['software', 'os']);
    if (
      !/^crt-\d{8}-\d{4}$/.test(intent.initialVersions.software) ||
      !/^\d+\.\d{4}\.\d+$/.test(intent.initialVersions.os)
    )
      throw new Error('Explicit initial software/OS version pair required');
  }
  if (!['external-ip', 'cloud-nat', 'firewall', 'proxy'].includes(intent.egress.mode))
    throw new Error('Unsupported egress');
  if (['firewall', 'proxy'].includes(intent.egress.mode) && !intent.egress.resource)
    throw new Error('Explicit egress resource required');
  if (!['none', 'internal-passthrough-lb'].includes(intent.ingress.profile)) throw new Error('Unsupported ingress');
  if (!['static-insertion', 'ilb-next-hop', 'ncc-router-appliance'].includes(intent.routing.profile))
    throw new Error('Unsupported routing');
  for (const cidr of intent.routing.destinationCidrs) ipv4Range(cidr);
  if (!Array.isArray(intent.sites) || !intent.sites.length) throw new Error('Explicitly named sites required');
  const sites = new Set<string>();
  const nodes = new Set<string>();
  for (const site of intent.sites) {
    keys(site, ['name', 'nodes']);
    name(site.name);
    if (sites.has(site.name)) throw new Error('Independent sites require unique names');
    sites.add(site.name);
    if (![1, 3].includes(site.nodes.length)) throw new Error('Sites require one node or three HA nodes');
    let shape: string | undefined;
    for (const node of site.nodes) {
      keys(node, ['name', 'zone', 'interfaces']);
      name(node.name);
      if (nodes.has(node.name)) throw new Error('Node names must be unique');
      nodes.add(node.name);
      if (!new RegExp(`^${intent.region}-[a-z]$`).test(node.zone))
        throw new Error('Node zone must belong to the explicit region');
      if (!node.interfaces.length || node.interfaces.length > 8)
        throw new Error('CE requires 1-8 interfaces; machine limit remains a separate gate');
      const networks = new Set<string>();
      const ranges: Array<[number, number]> = [];
      for (const [index, nic] of node.interfaces.entries()) {
        keys(nic, ['index', 'role', 'vrf', 'network', 'subnet', 'cidr']);
        if (nic.index !== index || (index === 0 && nic.role !== 'slo'))
          throw new Error('Contiguous NIC order must start with SLO');
        if (!['slo', 'sli', 'management'].includes(nic.role) || (index > 0 && nic.role === 'slo'))
          throw new Error('Invalid NIC role');
        name(nic.vrf);
        name(nic.network);
        name(nic.subnet);
        if (networks.has(nic.network)) throw new Error('Each NIC requires a distinct VPC');
        networks.add(nic.network);
        const range = ipv4Range(nic.cidr);
        if (ranges.some(([start, end]) => range[0] <= end && start <= range[1]))
          throw new Error('NIC subnets must not overlap');
        ranges.push(range);
      }
      const current = JSON.stringify(
        node.interfaces.map(({ index, role, vrf, network, subnet, cidr }) => [index, role, vrf, network, subnet, cidr]),
      );
      if (shape !== undefined && shape !== current)
        throw new Error('HA NIC order, networks, subnets and VRFs must be homogeneous');
      shape = current;
    }
  }
}
