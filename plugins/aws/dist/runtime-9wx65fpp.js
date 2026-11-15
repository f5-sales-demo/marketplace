// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/terraform/src/provider-lock.ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// plugins/aws/src/ce/planner.ts
import { isIP as isIP5 } from 'node:net';
import {
  AWS_CE_DEFAULT_INTERFACE_MTU,
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SCHEMA_VERSION,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
  AWS_CE_TGW_GUIDE_URL,
  assertAwsEbsTeardown,
  initialSoftwareSettings,
  isAwsTerminatedOwnedInstance,
  normalizeAwsAdminSshPublicKey,
  normalizeAwsBootstrapKeyPairName,
  selectAwsBootstrapKeyPair,
} from './runtime-wf8fjv0g.js';
import { canonicalSha256, fingerprintObservation } from './runtime-wvre8ba5.js';

var XCSH_PROVIDER_VERSION = '15.12.1';
var XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';
async function loadXcshProviderLock() {
  const value = await readFile(new URL('./assets/plugins/terraform/locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}

// plugins/aws/src/ce/create-recovery.ts
var drivers = {
  'create-vpc': { describe: 'describe-vpcs', list: 'Vpcs', result: 'Vpc', id: 'VpcId' },
  'create-subnet': { describe: 'describe-subnets', list: 'Subnets', result: 'Subnet', id: 'SubnetId' },
  'create-internet-gateway': {
    describe: 'describe-internet-gateways',
    list: 'InternetGateways',
    result: 'InternetGateway',
    id: 'InternetGatewayId',
  },
  'create-route-table': {
    describe: 'describe-route-tables',
    list: 'RouteTables',
    result: 'RouteTable',
    id: 'RouteTableId',
  },
  'create-security-group': { describe: 'describe-security-groups', list: 'SecurityGroups', result: '', id: 'GroupId' },
  'create-network-interface': {
    describe: 'describe-network-interfaces',
    list: 'NetworkInterfaces',
    result: 'NetworkInterface',
    id: 'NetworkInterfaceId',
  },
  'allocate-address': { describe: 'describe-addresses', list: 'Addresses', result: '', id: 'AllocationId' },
  'run-instances': { describe: 'describe-instances', list: 'Reservations', result: 'Instances', id: 'InstanceId' },
};
function prepareRecoverableAction(action) {
  if (action.command !== 'aws' || action.args?.[0] !== 'ec2' || !drivers[action.args[1]]) return;
  const start = action.args.indexOf('--tag-specifications');
  if (start < 0) throw new Error('Recoverable creation requires atomic ownership tags');
  for (let index = start + 1; index < action.args.length && !action.args[index].startsWith('--'); index++) {
    if (!action.args[index].endsWith(']')) throw new Error('Malformed atomic AWS ownership tags');
    action.args[index] = `${action.args[index].slice(0, -1)},{Key=xcsh-action-id,Value=${action.id}}]`;
  }
}
function hasCreateRecovery(action) {
  return action.args?.[0] === 'ec2' && !!drivers[action.args[1]];
}
async function executeRecoverableCreate(api, plan, action, args, checkpoint, persist, signal) {
  const driver = drivers[args[1]];
  if (!driver) throw new Error('AWS create recovery driver is unavailable');
  const requestSha256 = canonicalSha256({
    plan: plan.planSha256,
    action: action.id,
    args: args.map((arg, index) => (args[index - 1] === '--user-data' ? 'issued-site-bound-bootstrap' : arg)),
  });
  const pending = checkpoint.pendingCreate;
  if (pending && (pending.actionId !== action.id || pending.requestSha256 !== requestSha256))
    throw new Error('Pending AWS creation differs from the immutable request');
  if (!pending) {
    checkpoint.pendingCreate = { actionId: action.id, requestSha256 };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingCreate = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode === 0) {
        return result;
      }
    } catch {
      signal?.throwIfAborted();
    }
  }
  signal?.throwIfAborted();
  const expected = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'xcsh-action-id': action.id,
  };
  const result = await api.exec(
    'aws',
    [
      'ec2',
      driver.describe,
      '--filters',
      ...Object.entries(expected).map(([key, value]) => `Name=tag:${key},Values=${value}`),
      '--region',
      plan.region,
      '--output',
      'json',
    ],
    { signal },
  );
  if (result.exitCode !== 0) throw new Error('AWS ambiguous creation observation is unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('AWS creation observation is malformed');
  }
  if (!raw || raw.NextToken || !Array.isArray(raw[driver.list]))
    throw new Error('AWS creation observation is incomplete');
  let candidates = raw[driver.list];
  if (args[1] === 'run-instances') {
    if (candidates.some((item) => !item || !Array.isArray(item.Instances)))
      throw new Error('AWS creation observation is malformed');
    candidates = candidates.flatMap((item) => item.Instances);
  }
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'AWS creation identity is ambiguous'
        : 'AWS creation outcome remains unknown; resume observation before retrying',
    );
  const resource = candidates[0];
  if (!resource || typeof resource[driver.id] !== 'string' || !Array.isArray(resource.Tags))
    throw new Error('AWS creation identity is malformed');
  const tags = new Map();
  for (const item of resource.Tags) {
    if (!item || typeof item.Key !== 'string' || typeof item.Value !== 'string' || tags.has(item.Key))
      throw new Error('AWS creation ownership tags are malformed');
    tags.set(item.Key, item.Value);
  }
  if (Object.entries(expected).some(([key, value]) => tags.get(key) !== value))
    throw new Error('AWS creation belongs to another owner');
  const response =
    driver.result === 'Instances'
      ? { Instances: [resource] }
      : driver.result
        ? { [driver.result]: resource }
        : resource;
  return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
}

// plugins/terraform/src/ce-execution-contract.ts
var CE_TERRAFORM_VERSION = '1.17.1';

// plugins/aws/src/ce/execution-contract.ts
var AWS_CE_TERRAFORM_VERSION = CE_TERRAFORM_VERSION;
var AWS_CE_TERRAFORM_PROVIDER_VERSION = '6.63.0';
var AWS_CE_PROVIDER_LOCK_SHA256 = 'b97165003c421c83098216c89f00ecbd10a7fb59cd6954c8abf74af0262ed843';
function assertAwsDeploymentCompilerOperation(intent) {
  if (intent.operation === 'start' || intent.operation === 'stop')
    throw new Error(
      `Whole-site ${intent.operation} requires aws_ce_power with the exact original deployment and saved power plan; the deployment compiler lacks immutable service and maintenance bindings`,
    );
}

// plugins/aws/src/ce/ingress-settings.ts
function nlbSettings(intent) {
  const ingress = intent.ingress?.mode === 'nlb' ? intent.ingress : undefined;
  const targetInterfaceIndex = ingress?.targetInterfaceIndex ?? 1;
  const healthCheck = ingress?.healthCheck ?? {
    protocol: 'TCP',
    port: 'traffic-port',
    intervalSeconds: 30,
    timeoutSeconds: 10,
    healthyThreshold: 3,
    unhealthyThreshold: 3,
  };
  if (targetInterfaceIndex !== 1 || intent.interfaces[targetInterfaceIndex]?.role !== 'sli')
    throw new Error('NLB requires the explicitly observed SLI target interface');
  if (
    !['TCP', 'HTTP', 'HTTPS'].includes(healthCheck.protocol) ||
    (healthCheck.port !== 'traffic-port' &&
      (!Number.isInteger(healthCheck.port) || healthCheck.port < 1 || healthCheck.port > 65535)) ||
    !Number.isInteger(healthCheck.intervalSeconds) ||
    healthCheck.intervalSeconds < 5 ||
    healthCheck.intervalSeconds > 300 ||
    !Number.isInteger(healthCheck.timeoutSeconds) ||
    healthCheck.timeoutSeconds < 2 ||
    healthCheck.timeoutSeconds > 120 ||
    [healthCheck.healthyThreshold, healthCheck.unhealthyThreshold].some(
      (value) => !Number.isInteger(value) || value < 2 || value > 10,
    ) ||
    (healthCheck.protocol === 'TCP' && healthCheck.path !== undefined) ||
    (healthCheck.protocol !== 'TCP' && !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(healthCheck.path ?? ''))
  )
    throw new Error('NLB health-check configuration is invalid');
  return { targetInterfaceIndex, healthCheck };
}

// plugins/aws/src/ce/interface-addressing.ts
import { isIP } from 'node:net';

function network(cidr) {
  const parts = cidr.split('/');
  const prefix = Number(parts[1]);
  if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d+$/.test(parts[1]) || prefix < 16 || prefix > 28)
    throw new Error('AWS interface addressing requires an IPv4 subnet /16 through /28');
  const size = 2 ** (32 - prefix);
  const value = parts[0].split('.').reduce((value, part) => value * 256 + Number(part), 0);
  return { base: Math.floor(value / size) * size, prefix, size };
}
function address(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}
function awsSubnetHost(cidr, offset) {
  return address(network(cidr).base + offset);
}
function awsCeStaticIp(intent, node, index) {
  const item = intent.interfaces.find((item) => item.index === index);
  if (!item || !Number.isInteger(node) || node < 1 || node > intent.topology.nodeCount)
    throw new Error('AWS interface node/index binding is missing');
  if (item.addressing.mode === 'dhcp') {
    if (item.addressing.addresses?.length) throw new Error('DHCP addressing cannot include static addresses');
    return;
  }
  if (
    item.addressing.mode !== 'static' ||
    !Array.isArray(item.addressing.addresses) ||
    item.addressing.addresses.length !== intent.topology.nodeCount
  )
    throw new Error('Static addressing requires one explicit CIDR per node');
  const cidr = item.addressing.addresses[node - 1];
  const subnet = item.subnets[node - 1]?.cidr;
  if (!subnet) throw new Error('Static addressing requires the exact subnet CIDR');
  const expected = network(subnet);
  const selected = network(cidr);
  const ip = cidr.split('/')[0];
  const value = ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
  if (
    selected.prefix !== expected.prefix ||
    selected.base !== expected.base ||
    value < expected.base + 4 ||
    value >= expected.base + expected.size - 1
  )
    throw new Error('Static address must match its subnet prefix and exclude AWS reserved addresses');
  if (item.role === 'slo') {
    if (!intent.vpc.cidr) throw new Error('Static SLO requires the exact VPC CIDR for AWS DNS');
    return { ip_address: cidr, default_gw: address(expected.base + 1), dns_server: awsSubnetHost(intent.vpc.cidr, 2) };
  }
  return { ip_address: cidr };
}
function validateAwsCeAddressing(intent) {
  const staticMode = intent.interfaces.some((item) => item.addressing.mode === 'static');
  if (
    staticMode &&
    (intent.interfaces.some((item) => !item.guestDevice) ||
      new Set(intent.interfaces.map((item) => item.guestDevice)).size !== intent.interfaces.length)
  )
    throw new Error('Static addressing requires distinct verified guest device identities before registration');
  const seen = new Set();
  for (const item of intent.interfaces) {
    for (let node = 1; node <= intent.topology.nodeCount; node++) {
      const selected = awsCeStaticIp(intent, node, item.index);
      if (!selected) continue;
      const ip = selected.ip_address.split('/')[0];
      if (seen.has(ip)) throw new Error('Duplicate static interface address');
      seen.add(ip);
    }
  }
}

// plugins/aws/src/ce/interface-security.ts
function interfaceSecurityGroups(intent, index) {
  const groups =
    intent.interfaces[index]?.securityGroupNames ??
    (intent.securityGroups.length === 1 ? [intent.securityGroups[0].name] : undefined);
  if (
    !groups?.length ||
    new Set(groups).size !== groups.length ||
    groups.some((name) => !intent.securityGroups.some((group) => group.name === name))
  )
    throw new Error(
      'Each interface requires explicit known security groups when multiple role-specific groups are defined',
    );
  return [...groups].sort();
}

// plugins/aws/src/ce/network-cidrs.ts
import { isIP as isIP2 } from 'node:net';

function range(cidr, label) {
  const [address, mask, extra] = cidr.split('/');
  const prefix = Number(mask);
  if (
    extra !== undefined ||
    isIP2(address) !== 4 ||
    !Number.isInteger(prefix) ||
    prefix < 16 ||
    prefix > 28 ||
    mask !== String(prefix)
  )
    throw new Error(`AWS CE plan validation failed: ${label} must be an IPv4 /16 through /28`);
  const start = address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
  const size = 2 ** (32 - prefix);
  if (start % size !== 0)
    throw new Error(`AWS CE plan validation failed: ${label} must use a canonical network address`);
  return { start, end: start + size - 1, label };
}
function validateAwsCeNetworkCidrs(input) {
  if (!['greenfield', 'brownfield'].includes(input.vpc.mode))
    throw new Error('AWS CE plan validation failed: VPC mode is invalid');
  const vpc = input.vpc.cidr ? range(input.vpc.cidr, 'vpc.cidr') : undefined;
  const prohibited = [
    [0, 16777215],
    [2130706432, 2147483647],
    [2851995648, 2852061183],
    [3758096384, 4026531839],
  ];
  if (vpc && prohibited.some(([start, end]) => vpc.start <= end && vpc.end >= start))
    throw new Error('AWS CE plan validation failed: vpc.cidr intersects an AWS-prohibited IPv4 range');
  const subnets = input.interfaces.flatMap((item) =>
    item.subnets.flatMap((subnet, node) =>
      subnet.cidr ? [range(subnet.cidr, `interfaces[${item.index}].subnets[${node}].cidr`)] : [],
    ),
  );
  if (input.vpc.mode !== 'greenfield') return;
  if (!vpc) throw new Error('AWS CE plan validation failed: greenfield VPC requires a CIDR');
  for (const subnet of subnets)
    if (subnet.start < vpc.start || subnet.end > vpc.end)
      throw new Error(`AWS CE plan validation failed: ${subnet.label} must be contained in vpc.cidr`);
  const ordered = [...subnets].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index++)
    if (ordered[index].start <= ordered[index - 1].end)
      throw new Error('AWS CE plan validation failed: newly created subnet CIDRs must not overlap');
}

// plugins/aws/src/ce/static-routing.ts
import { isIP as isIP3 } from 'node:net';

function staticAzRoutes(intent) {
  const routes = intent.routing.staticAzRoutes;
  if (routes === undefined) return [];
  if (intent.routing.profile !== 'tgw-static' || !Array.isArray(routes) || routes.length !== intent.topology.nodeCount)
    throw new Error('Static TGW routing requires one appliance route set per node/AZ');
  const nodes = new Set();
  return routes
    .map((route) => {
      if (
        !Number.isInteger(route.node) ||
        route.node < 1 ||
        route.node > intent.topology.nodeCount ||
        nodes.has(route.node)
      )
        throw new Error('Static TGW appliance node identity is missing or ambiguous');
      nodes.add(route.node);
      if (route.availabilityZone !== intent.interfaces[1]?.subnets[route.node - 1]?.availabilityZone)
        throw new Error('Static TGW appliance target differs from the approved SLI AZ');
      const normalize = (values) => {
        if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length)
          throw new Error('Static TGW requires explicit unique forward and return prefixes');
        return values
          .map((value) => {
            const [ip, prefix, extra] = value.split('/');
            if (isIP3(ip) !== 4 || !/^\d{1,2}$/.test(prefix ?? '') || Number(prefix) > 32 || extra !== undefined)
              throw new Error('Static TGW route prefix is invalid');
            const octets = ip.split('.').map(Number);
            const address = octets.reduce((acc, octet) => (acc * 256 + octet) >>> 0, 0);
            const mask = Number(prefix) === 0 ? 0 : (4294967295 << (32 - Number(prefix))) >>> 0;
            if ((address & mask) >>> 0 !== address) throw new Error('Static TGW route must use a network boundary');
            return { cidr: value, address, mask, prefix: Number(prefix) };
          })
          .sort((a, b) => a.cidr.localeCompare(b.cidr));
      };
      const forward = normalize(route.forwardCidrs);
      const backward = normalize(route.returnCidrs);
      if (
        forward.some((a) =>
          backward.some((b) => {
            const mask = a.prefix < b.prefix ? a.mask : b.mask;
            return (a.address & mask) >>> 0 === (b.address & mask) >>> 0;
          }),
        )
      )
        throw new Error('Static TGW forward and return prefixes overlap');
      return { ...route, forwardCidrs: forward.map((row) => row.cidr), returnCidrs: backward.map((row) => row.cidr) };
    })
    .sort((a, b) => a.node - b.node);
}
function routeNode(intent, route) {
  const node = route.node ?? (intent.topology.nodeCount === 1 ? 1 : undefined);
  if (!node || !Number.isInteger(node) || node > intent.topology.nodeCount || node < 1)
    throw new Error('Each multi-node VPC route requires an explicit appliance node');
  if (
    intent.topology.nodeCount > 1 &&
    route.availabilityZone !== intent.interfaces[1]?.subnets[node - 1]?.availabilityZone
  )
    throw new Error('VPC route AZ differs from its approved appliance target');
  return node;
}

// plugins/aws/src/ce/topology.ts
function siteTopology(intent) {
  const sites = intent.topology.sites ?? [
    { name: intent.siteName, nodeIndexes: Array.from({ length: intent.topology.nodeCount }, (_, index) => index + 1) },
  ];
  if (!Array.isArray(sites) || !sites.length) throw new Error('CE site topology is required');
  const names = new Set();
  const indexes = new Set();
  for (const site of sites) {
    if (
      !site ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(site.name) ||
      names.has(site.name) ||
      !Array.isArray(site.nodeIndexes) ||
      ![1, 3].includes(site.nodeIndexes.length)
    )
      throw new Error('CE sites require unique identities and one or three nodes each');
    names.add(site.name);
    for (const index of site.nodeIndexes) {
      if (!Number.isInteger(index) || index < 1 || index > intent.topology.nodeCount || indexes.has(index))
        throw new Error('CE node must belong to exactly one site');
      indexes.add(index);
    }
  }
  if (indexes.size !== intent.topology.nodeCount) throw new Error('CE topology does not assign every node to a site');
  return sites
    .map((site) => ({ name: site.name, nodeIndexes: [...site.nodeIndexes].sort((a, b) => a - b) }))
    .sort((a, b) => a.nodeIndexes[0] - b.nodeIndexes[0]);
}
function siteForNode(intent, node) {
  const site = siteTopology(intent).find((site) => site.nodeIndexes.includes(node));
  if (!site) throw new Error('CE node has no site binding');
  return site;
}
function siteBindings(plan) {
  return siteTopology(plan.intent).map((site) => ({
    site,
    binding: {
      owner: {
        deploymentId: plan.deploymentName,
        engine: plan.engine,
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      },
      siteName: site.name,
      ...(plan.intent.initialVersions ? { initialVersions: structuredClone(plan.intent.initialVersions) } : {}),
      nodes: site.nodeIndexes.map((index) => `${plan.deploymentName}-${index}`),
    },
  }));
}

// plugins/aws/src/ce/transport-routes.ts
import { isIP as isIP4 } from 'node:net';

function network2(value) {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || isIP4(address) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? ''))
    throw new Error('GRE transport requires canonical IPv4 CIDR evidence');
  const first = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  if (first % size !== 0) throw new Error('GRE transport CIDR has host bits set');
  return { first, last: first + size - 1 };
}
function observedConnectCidrs(intent, observation) {
  const resources = observation.resources.filter((resource) => resource.id === intent.routing.transitGatewayId);
  if (resources.length !== 1 || !resources[0].exists || resources[0].region !== intent.region)
    throw new Error('GRE transport requires one current scoped Transit Gateway observation');
  const state = resources[0].state;
  const gateways = state.TransitGateways;
  if (state.NextToken || !Array.isArray(gateways) || gateways.length !== 1)
    throw new Error('GRE transport Transit Gateway evidence is incomplete');
  const gateway = gateways[0];
  const options = gateway.Options;
  if (
    !options ||
    gateway.TransitGatewayId !== intent.routing.transitGatewayId ||
    gateway.State !== 'available' ||
    options?.AmazonSideAsn !== intent.routing.transitGatewayAsn
  )
    throw new Error('GRE transport gateway identity, availability or ASN does not match');
  const cidrs = options.TransitGatewayCidrBlocks;
  if (
    !Array.isArray(cidrs) ||
    !cidrs.length ||
    cidrs.some((cidr) => typeof cidr !== 'string') ||
    new Set(cidrs).size !== cidrs.length
  )
    throw new Error('GRE transport requires observed Transit Gateway CIDR blocks');
  const ranges = cidrs.map(network2);
  const vpc = intent.vpc.cidr ? network2(intent.vpc.cidr) : undefined;
  for (const [index, range] of ranges.entries()) {
    if (
      (vpc && range.first <= vpc.last && vpc.first <= range.last) ||
      ranges.slice(0, index).some((other) => range.first <= other.last && other.first <= range.last)
    )
      throw new Error('GRE transport CIDRs overlap another transport block or the CE VPC');
  }
  for (const peer of intent.routing.connectPeers ?? []) {
    if (!peer.transitGatewayAddress) continue;
    const address = network2(`${peer.transitGatewayAddress}/32`).first;
    if (!ranges.some((range) => address >= range.first && address <= range.last))
      throw new Error('GRE endpoint is outside the observed Transit Gateway CIDR blocks');
  }
  return cidrs.slice().sort();
}

// plugins/aws/src/ce/planner.ts
var ACCOUNT = /^\d{12}$/;
var REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
var SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
var CIDR = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\/\d{1,3}$/;
var AMI = /^ami-[0-9a-f]{8,17}$/;
var DEVICE_NAME = /^\/dev\/[a-zA-Z0-9._-]{1,32}$/;
var AWS_ID =
  /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:vol-[0-9a-f]{8}(?:[0-9a-f]{9})?|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21}))$/;
function fail(message) {
  throw new Error(`AWS CE plan validation failed: ${message}`);
}
function regionMatchesPartition(region, partition) {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}
function safeString(value, label) {
  const normalized = value.trim();
  if (
    !normalized ||
    Array.from(normalized).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail(`${label} is empty or contains control characters`);
  return normalized;
}
function name(value, label) {
  const normalized = safeString(value, label);
  if (!SAFE_NAME.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}
function cidr(value, label) {
  const normalized = safeString(value, label);
  if (!CIDR.test(normalized)) fail(`${label} is not a CIDR`);
  const [address, mask] = normalized.split('/');
  const family = isIP5(address),
    prefix = Number(mask);
  if (!family || !Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128))
    fail(`${label} has an invalid IP address or prefix length`);
  return normalized;
}
function ipv4Number(value) {
  if (isIP5(value) !== 4) fail('listener service address must be IPv4');
  return value.split('.').reduce((result, octet) => result * 256 + Number(octet), 0);
}
function cidrHost(value, offset) {
  const [address, length] = value.split('/');
  const prefix = Number(length);
  if (isIP5(address) !== 4 || !Number.isInteger(prefix) || prefix < 16 || prefix > 28)
    fail('NLB SLI subnet must be an IPv4 /16 through /28');
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4Number(address) / size) * size;
  const result = network + offset;
  return [24, 16, 8, 0].map((shift) => Math.floor(result / 2 ** shift) % 256).join('.');
}
function usableSubnetAddress(address, subnet) {
  const [base, length] = subnet.split('/');
  const prefix = Number(length);
  if (isIP5(base) !== 4 || !Number.isInteger(prefix) || prefix < 16 || prefix > 28) return false;
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4Number(base) / size) * size;
  const value = ipv4Number(address);
  return value >= network + 4 && value < network + size - 1;
}
function asn(value, label) {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 4294967294)
    fail(`${label} must be a valid ASN`);
  return value;
}
function tgwInsideNetwork(value) {
  const match = /^169\.254\.(\d{1,3})\.(\d{1,3})\/29$/.exec(value);
  if (!match) fail('TGW Connect inside CIDR must be a 169.254.0.0/16 /29');
  const third = Number(match[1]);
  const fourth = Number(match[2]);
  if (third > 255 || fourth > 255 || fourth % 8 !== 0)
    fail('TGW Connect inside CIDR must be a valid /29 network boundary');
  const network = third * 256 + fourth;
  if (new Set([0, 256, 512, 768, 1024, 1280, 43512]).has(network)) fail('TGW Connect inside CIDR is reserved by AWS');
  return network;
}
function connectAttachmentCount(intent) {
  if (intent.routing.profile !== 'tgw-connect') return 0;
  const roles =
    intent.routing.connectPeers?.map((peer) => peer.transportInterfaceIndex) ??
    (intent.routing.insideCidrs ?? []).map(() => 0);
  return [0, 1].reduce((count, role) => count + Math.ceil(roles.filter((value) => value === role).length / 4), 0);
}
function awsCeInterfacePrivateAddresses(intent, node, interfaceIndex) {
  const item = intent.interfaces.find((item) => item.index === interfaceIndex);
  if (!item) fail('NLB interface binding is missing');
  const staticIp = awsCeStaticIp(intent, node, interfaceIndex);
  if (item.role !== 'sli' || intent.ingress?.mode !== 'nlb') return staticIp ? [staticIp.ip_address.split('/')[0]] : [];
  const subnet = item.subnets[node - 1]?.cidr;
  if (intent.ingress.listener.usePrimaryInterfaceAddress === true) {
    if (!subnet || !item.guestDevice || intent.ingress.listener.privateAddresses !== undefined)
      fail('Primary-interface ingress requires exact SLI subnet and device identities without aliases');
    const primary = staticIp?.ip_address.split('/')[0] ?? cidrHost(subnet, 5);
    if (!usableSubnetAddress(primary, subnet)) fail('Primary SLI address is not usable in its node subnet');
    return [primary];
  }
  const siteIndex = siteTopology(intent).findIndex((site) => site.nodeIndexes.includes(node));
  const listener = siteIndex < 0 ? undefined : intent.ingress.listener.privateAddresses?.[siteIndex];
  if (!listener || !subnet) fail('NLB SLI subnet or site listener binding is missing');
  const primary = staticIp?.ip_address.split('/')[0] ?? cidrHost(subnet, 5);
  if (!usableSubnetAddress(listener, subnet) || listener === primary)
    fail('NLB site listener must be a distinct usable SLI subnet address');
  return [primary, listener];
}
function awsCeNlbIngress(intent) {
  if (intent.ingress?.mode === 'nlb') return { port: intent.ingress.port, scheme: intent.ingress.scheme };
  return intent.routing.profile === 'nlb-ingress' ? { port: 443, scheme: 'internet-facing' } : undefined;
}
function normalizeIntent(input) {
  if (input.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (!ACCOUNT.test(input.accountId)) fail('accountId must be a 12-digit AWS account ID');
  if (!REGION.test(input.region)) fail('region is invalid');
  if (!['aws', 'aws-us-gov', 'aws-cn'].includes(input.partition)) fail('partition is invalid');
  if (!regionMatchesPartition(input.region, input.partition)) fail('region does not match partition');
  const engine = input.engine ?? 'native';
  if (!['native', 'terraform'].includes(engine)) fail('execution engine must be native or terraform');
  staticAzRoutes(input);
  if (input.instance.bootstrapKeyPairName !== undefined)
    normalizeAwsBootstrapKeyPairName(input.instance.bootstrapKeyPairName);
  const adminSshPublicKey =
    input.adminSshPublicKey === undefined ? undefined : normalizeAwsAdminSshPublicKey(input.adminSshPublicKey);
  const deploymentName = name(input.deploymentName, 'deploymentName');
  const siteName = name(input.siteName, 'siteName');
  if (input.initialVersions !== undefined) initialSoftwareSettings(input.initialVersions);
  const namespace = name(input.namespace, 'namespace');
  if (input.topology.nodeCount !== 1 && input.topology.nodeCount !== 3)
    fail('topology must contain one or three nodes');
  const sites = siteTopology(input);
  if (!Array.isArray(input.interfaces) || input.interfaces.length < 1 || input.interfaces.length > 8)
    fail('interfaces must contain between 1 and 8 entries');
  if (input.interfaces.some((item, index) => item.index !== index)) fail('interfaces must be ordered and zero-based');
  if (input.interfaces[0].role !== 'slo') fail('interface 0 must be SLO');
  if (input.interfaces.length > 1 && input.interfaces[1].role !== 'sli') fail('interface 1 must be SLI');
  const azOrder = input.interfaces[0].subnets.map((subnet) => subnet.availabilityZone);
  if (azOrder.length !== input.topology.nodeCount || new Set(azOrder).size !== input.topology.nodeCount)
    fail('each interface must define one unique Availability Zone per node');
  const interfaces = input.interfaces.map((item, index) => {
    if (!['slo', 'sli', 'management', 'service', 'workload'].includes(item.role))
      fail(`interface ${index} role is invalid`);
    const mtu = item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU;
    const guestDevice =
      item.guestDevice === undefined ? undefined : safeString(item.guestDevice, `interfaces[${index}].guestDevice`);
    if (guestDevice !== undefined && !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(guestDevice))
      fail('interface guest device identity is invalid');
    if (!Number.isInteger(mtu) || mtu < 1500 || mtu > 8000) fail('interface MTU must be an integer from 1500 to 8000');
    const vrf = name(item.vrf, `interfaces[${index}].vrf`);
    if (item.subnets.length !== input.topology.nodeCount) fail('interfaces must be symmetric across every node');
    const subnets = item.subnets.map((subnet, node) => {
      const availabilityZone = safeString(subnet.availabilityZone, 'availabilityZone');
      if (availabilityZone !== azOrder[node]) fail('interfaces must use the same ordered Availability Zones');
      if (input.vpc.mode === 'brownfield' && !/^subnet-[0-9a-f]{8,17}$/.test(subnet.subnetId ?? ''))
        fail('brownfield interfaces require exact subnet IDs');
      if (input.vpc.mode === 'brownfield') {
        const subnetId = subnet.subnetId ?? '';
        if (!input.brownfield.resourceIds.includes(subnetId))
          fail('brownfield subnet is outside the explicit resource allowlist');
      }
      if (input.vpc.mode === 'greenfield' && !subnet.cidr) fail('greenfield interfaces require subnet CIDRs');
      return {
        availabilityZone,
        ...(subnet.subnetId ? { subnetId: safeString(subnet.subnetId, 'subnetId') } : {}),
        ...(subnet.cidr ? { cidr: cidr(subnet.cidr, 'subnetCidr') } : {}),
      };
    });
    if (!['dhcp', 'static'].includes(item.addressing.mode)) fail('interface addressing mode is invalid');
    return {
      index,
      role: item.role,
      ...(input.operation === 'deploy'
        ? { securityGroupNames: interfaceSecurityGroups(input, index) }
        : item.securityGroupNames
          ? { securityGroupNames: [...item.securityGroupNames].sort() }
          : {}),
      mtu,
      ...(guestDevice === undefined ? {} : { guestDevice }),
      vrf,
      subnets,
      addressing: {
        mode: item.addressing.mode,
        ...(item.addressing.addresses
          ? { addresses: item.addressing.addresses.map((address) => cidr(address, 'interface address')) }
          : {}),
      },
    };
  });
  validateAwsCeNetworkCidrs({ vpc: input.vpc, interfaces });
  validateAwsCeAddressing({ ...input, interfaces });
  if (
    sites.some((site) => site.nodeIndexes.length === 3) &&
    (interfaces.some((item) => !item.guestDevice) ||
      new Set(interfaces.map((item) => item.guestDevice)).size !== interfaces.length)
  )
    fail('Three-node HA requires distinct verified guest device identities for every interface');
  if (input.vpc.mode === 'brownfield' && !/^vpc-[0-9a-f]{8,17}$/.test(input.vpc.vpcId ?? ''))
    fail('brownfield VPC requires an exact VPC ID');
  if (input.vpc.mode === 'brownfield') {
    const vpcId = input.vpc.vpcId ?? '';
    if (!input.brownfield.resourceIds.includes(vpcId))
      fail('brownfield VPC is outside the explicit resource allowlist');
  }
  if (input.vpc.mode === 'greenfield' && !input.vpc.cidr) fail('greenfield VPC requires a CIDR');
  if (input.vpc.cidr) cidr(input.vpc.cidr, 'vpc.cidr');
  if (input.image.productId !== AWS_CE_MARKETPLACE_PRODUCT_ID) fail('unsupported Marketplace product');
  if (!AMI.test(input.image.amiId)) fail('image.amiId must be an exact regional AMI ID');
  if (!/^[a-z0-9][a-z0-9.-]{1,40}$/.test(input.instance.type)) fail('instance type is invalid');
  if (!Number.isInteger(input.instance.diskGiB) || input.instance.diskGiB < 1)
    fail('instance disk must be a positive integer');
  const upgradeSafeDiskGiB = Math.max(input.instance.diskGiB, AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB);
  if (
    input.instance.instanceProfileArn &&
    !input.instance.instanceProfileArn.startsWith(`arn:${input.partition}:iam::${input.accountId}:instance-profile/`)
  )
    fail('instance profile is outside the intended account or partition');
  if (input.egress.mode !== 'elastic-ip') {
    if (!input.egress.resourceId || !AWS_ID.test(input.egress.resourceId))
      fail(`${input.egress.mode} requires an exact resource ID`);
    if (!input.brownfield.resourceIds.includes(input.egress.resourceId))
      fail('egress resource is outside the brownfield allowlist');
  }
  if (input.routing.profile === 'direct-eni' && input.topology.nodeCount !== 1)
    fail('direct ENI routing requires a one-node topology');
  const destinationCidrs = [
    ...new Set(input.routing.destinationCidrs.map((item) => cidr(item, 'destinationCidr'))),
  ].sort();
  for (const id of [
    ...input.brownfield.resourceIds,
    ...input.brownfield.routeTableIds,
    ...input.brownfield.transitGatewayRouteTableIds,
  ])
    if (!AWS_ID.test(id)) fail(`invalid brownfield identifier ${id}`);
    else if (id.startsWith('arn:')) {
      const [, partition, , region, accountId] = id.split(':');
      if (partition !== input.partition || accountId !== input.accountId || (region && region !== input.region))
        fail(`brownfield ARN is outside the intended partition, account, or region: ${id}`);
    }
  if (input.routes.some((route) => !input.brownfield.routeTableIds.includes(route.routeTableId)))
    fail('route target is outside the explicit brownfield route-table allowlist');
  const routes = input.routes.map((route) => ({
    routeTableId: route.routeTableId,
    destinationCidr: cidr(route.destinationCidr, 'routes.destinationCidr'),
    node: routeNode(input, route),
    ...(route.availabilityZone ? { availabilityZone: route.availabilityZone } : {}),
  }));
  if (input.routing.profile.startsWith('tgw-')) {
    if (!/^tgw-[0-9a-f]{8,17}$/.test(input.routing.transitGatewayId ?? ''))
      fail('TGW routing requires an exact transit gateway ID');
    if (!input.brownfield.resourceIds.includes(input.routing.transitGatewayId ?? ''))
      fail('transit gateway is outside the brownfield allowlist');
    if (
      input.routing.transitGatewayRouteTableId &&
      !input.brownfield.transitGatewayRouteTableIds.includes(input.routing.transitGatewayRouteTableId)
    )
      fail('Transit Gateway route table is outside the explicit allowlist');
  }
  if (input.routing.profile === 'tgw-connect') {
    const customerAsn = asn(input.routing.customerAsn, 'customerAsn');
    const transitGatewayAsn = asn(input.routing.transitGatewayAsn, 'transitGatewayAsn');
    if (customerAsn === transitGatewayAsn) fail('customer and Transit Gateway ASNs must differ');
    if (input.routing.transportAttachmentId) {
      if (!/^tgw-attach-[0-9a-f]{8,17}$/.test(input.routing.transportAttachmentId))
        fail('TGW Connect transport attachment ID is invalid');
      if (!input.brownfield.resourceIds.includes(input.routing.transportAttachmentId))
        fail('transport attachment is outside the brownfield allowlist');
    } else if (input.vpc.mode === 'brownfield') {
      fail('brownfield TGW Connect requires an exact allowlisted transport attachment ID');
    }
    if (input.topology.nodeCount !== 3) fail('TGW Connect requires three-zone symmetry');
    if (input.interfaces.length < 2) fail('TGW Connect requires an SLI interface');
    if (input.routing.connectPeers && input.routing.insideCidrs)
      fail('Select explicit Connect peers or legacy inside CIDRs, not both');
    const peers =
      input.routing.connectPeers ??
      input.routing.insideCidrs?.map((insideCidr, index) => ({
        node: index + 1,
        insideCidr,
        transportInterfaceIndex: 0,
      }));
    if (!peers?.length || peers.length > 12) fail('TGW Connect requires explicit peers or one inside CIDR per node');
    const counts = new Map();
    const endpoints = new Set();
    for (const peer of peers) {
      const transportRole = input.interfaces.find((item) => item.index === peer.transportInterfaceIndex)?.role;
      if (
        !Number.isInteger(peer.node) ||
        peer.node < 1 ||
        peer.node > input.topology.nodeCount ||
        !transportRole ||
        (input.operation === 'deploy' && !['slo', 'sli'].includes(transportRole))
      )
        fail(
          input.operation === 'deploy'
            ? 'Connect peer must select a real node and an SLO or SLI GRE transport interface'
            : 'Connect peer teardown must retain its observed transport interface',
        );
      counts.set(peer.node, (counts.get(peer.node) ?? 0) + 1);
      if ('transitGatewayAddress' in peer && peer.transitGatewayAddress !== undefined) {
        if (
          typeof peer.transitGatewayAddress !== 'string' ||
          isIP5(peer.transitGatewayAddress) !== 4 ||
          endpoints.has(peer.transitGatewayAddress)
        )
          fail('GRE transit gateway endpoints must be unique IPv4 addresses');
        endpoints.add(peer.transitGatewayAddress);
      }
    }
    if (counts.size !== input.topology.nodeCount || new Set(counts.values()).size !== 1)
      fail('Connect topology requires equal peer counts on every node');
    const insideNetworks = peers.map((peer) => tgwInsideNetwork(peer.insideCidr));
    if (new Set(insideNetworks).size !== insideNetworks.length)
      fail('TGW Connect inside CIDRs must be non-overlapping');
  }
  if (input.routing.profile === 'nlb-ingress') {
    if (input.ingress !== undefined) fail('Legacy NLB routing profile cannot be combined with explicit ingress');
    if (input.topology.nodeCount !== 3) fail('NLB ingress requires a three-node, three-zone topology');
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,26}[a-zA-Z0-9])?$/.test(deploymentName))
      fail('NLB ingress deploymentName must form a valid name of at most 28 characters');
  }
  if (input.ingress !== undefined) {
    const ingressKeys = Object.keys(input.ingress)
      .filter((key) => !['targetInterfaceIndex', 'healthCheck'].includes(key))
      .sort()
      .join(',');
    if (
      (input.ingress.mode === 'none' && ingressKeys !== 'mode') ||
      (input.ingress.mode === 'nlb' &&
        ingressKeys !== 'listener,loadBalancer,mode,port,probe,scheme' &&
        !(input.operation === 'teardown' && ingressKeys === 'listener,mode,port,probe,scheme'))
    )
      fail('Ingress fields differ from the selected mode');
    if (
      input.ingress.mode === 'nlb' &&
      (input.ingress.scheme !== 'internal' ||
        !Number.isInteger(input.ingress.port) ||
        input.ingress.port < 1 ||
        input.ingress.port > 65535)
    )
      fail('Explicit NLB ingress requires an internal scheme and a valid TCP port');
    if (!['none', 'nlb'].includes(input.ingress.mode)) fail('Ingress mode is invalid');
    if (input.ingress.mode === 'nlb' && input.topology.nodeCount !== 3)
      fail('NLB ingress requires a three-node, three-zone topology');
    if (
      input.ingress.mode === 'nlb' &&
      input.ingress.listener?.usePrimaryInterfaceAddress !== true &&
      sites.some((site) => site.nodeIndexes.length !== 1)
    )
      fail('NLB ingress requires three independent one-node sites');
    if (input.ingress.mode === 'nlb' && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,26}[a-zA-Z0-9])?$/.test(deploymentName))
      fail('NLB ingress deploymentName must form a valid name of at most 28 characters');
    if (input.ingress.mode === 'nlb') {
      nlbSettings(input);
      const listener = input.ingress.listener;
      const primary = listener?.usePrimaryInterfaceAddress === true;
      const loadBalancer = input.ingress.loadBalancer;
      const probe = input.ingress.probe;
      const listenerKeys = Object.keys(listener ?? {})
        .sort()
        .join(',');
      const legacyTeardownListener =
        input.operation === 'teardown' && listenerKeys === 'domain,name,namespace,originPool';
      const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
      if (
        !listener ||
        (input.operation !== 'teardown' &&
          (!loadBalancer ||
            Object.keys(loadBalancer).sort().join(',') !== 'privateAddresses,subnetIds,vpcId' ||
            !/^vpc-[0-9a-f]{8,17}$/.test(loadBalancer.vpcId) ||
            !input.brownfield.resourceIds.includes(loadBalancer.vpcId) ||
            !Array.isArray(loadBalancer.subnetIds) ||
            loadBalancer.subnetIds.length < 1 ||
            loadBalancer.subnetIds.some(
              (id) => !/^subnet-[0-9a-f]{8,17}$/.test(id) || !input.brownfield.resourceIds.includes(id),
            ) ||
            !Array.isArray(loadBalancer.privateAddresses) ||
            loadBalancer.privateAddresses.length !== loadBalancer.subnetIds.length ||
            loadBalancer.privateAddresses.some((address) => isIP5(address) !== 4))) ||
        (primary
          ? listenerKeys !== 'domain,name,namespace,originPool,usePrimaryInterfaceAddress'
          : listenerKeys !== 'domain,name,namespace,originPool,privateAddresses' && !legacyTeardownListener) ||
        Object.keys(listener.originPool ?? {})
          .sort()
          .join(',') !== 'name,namespace' ||
        name(listener.name, 'ingress.listener.name') !== listener.name ||
        name(listener.namespace, 'ingress.listener.namespace') !== listener.namespace ||
        name(listener.originPool.name, 'ingress.listener.originPool.name') !== listener.originPool.name ||
        name(listener.originPool.namespace, 'ingress.listener.originPool.namespace') !==
          listener.originPool.namespace ||
        listener.originPool.namespace !== listener.namespace ||
        (input.operation !== 'teardown' &&
          !primary &&
          (!Array.isArray(listener.privateAddresses) ||
            listener.privateAddresses.length !== sites.length ||
            new Set(listener.privateAddresses).size !== listener.privateAddresses.length ||
            sites.some((site, index) => {
              const node = site.nodeIndexes[0];
              const subnet = input.interfaces.find((item) => item.role === 'sli')?.subnets[node - 1]?.cidr;
              return (
                !subnet ||
                !usableSubnetAddress(listener.privateAddresses?.[index] ?? '', subnet) ||
                listener.privateAddresses?.[index] ===
                  (awsCeStaticIp(input, node, 1)?.ip_address.split('/')[0] ?? cidrHost(subnet, 5))
              );
            }))) ||
        typeof listener.domain !== 'string' ||
        listener.domain.length > 253 ||
        !domain.test(listener.domain) ||
        !probe ||
        Object.keys(probe).sort().join(',') !== 'expectedBodySha256,expectedStatus,path,sourceInstanceId' ||
        !/^i-[0-9a-f]{8,17}$/.test(probe.sourceInstanceId) ||
        !input.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
        !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(probe.path) ||
        !Number.isInteger(probe.expectedStatus) ||
        probe.expectedStatus < 100 ||
        probe.expectedStatus > 599 ||
        !/^[a-f0-9]{64}$/.test(probe.expectedBodySha256)
      )
        fail('NLB ingress requires exact listener and allowlisted traffic-probe identities');
      if (primary && input.operation !== 'teardown') {
        const addresses = Array.from(
          { length: input.topology.nodeCount },
          (_, index) => awsCeInterfacePrivateAddresses(input, index + 1, 1)[0],
        );
        if (new Set(addresses).size !== input.topology.nodeCount)
          fail('Primary-interface ingress requires distinct primary SLI addresses for every node');
      }
    }
  }
  for (const routeTableId of [...input.routing.associations, ...input.routing.propagations])
    if (!input.brownfield.transitGatewayRouteTableIds.includes(routeTableId))
      fail('TGW association or propagation is outside the explicit route-table allowlist');
  return {
    ...input,
    ...(adminSshPublicKey === undefined ? {} : { adminSshPublicKey }),
    engine,
    deploymentName,
    siteName,
    namespace,
    instance: {
      ...input.instance,
      diskGiB: upgradeSafeDiskGiB,
    },
    topology: { nodeCount: input.topology.nodeCount, sites },
    interfaces,
    routing: {
      ...input.routing,
      ...(input.routing.staticAzRoutes ? { staticAzRoutes: staticAzRoutes(input) } : {}),
      destinationCidrs,
      associations: [...new Set(input.routing.associations)].sort(),
      propagations: [...new Set(input.routing.propagations)].sort(),
    },
    ingress:
      input.ingress === undefined
        ? undefined
        : input.ingress.mode === 'nlb'
          ? { ...structuredClone(input.ingress), ...nlbSettings(input) }
          : structuredClone(input.ingress),
    securityGroups: [...input.securityGroups]
      .map((group) => ({
        ...group,
        name: name(group.name, 'securityGroup.name'),
        ingress: group.ingress.map((rule) => normalizeSecurityGroupRule(rule)),
        egress: group.egress.map((rule) => normalizeSecurityGroupRule(rule)),
      }))
      .map((group) =>
        sites.some((site) => site.nodeIndexes.length === 3) && !group.ingress.some((rule) => rule.self)
          ? { ...group, ingress: [...group.ingress, { protocol: '-1', cidrs: [], self: true }] }
          : group,
      )
      .sort((left, right) => left.name.localeCompare(right.name)),
    routes: routes.sort(
      (left, right) =>
        left.routeTableId.localeCompare(right.routeTableId) ||
        left.destinationCidr.localeCompare(right.destinationCidr),
    ),
    brownfield: {
      resourceIds: [...new Set(input.brownfield.resourceIds)].sort(),
      routeTableIds: [...new Set(input.brownfield.routeTableIds)].sort(),
      transitGatewayRouteTableIds: [...new Set(input.brownfield.transitGatewayRouteTableIds)].sort(),
    },
  };
}
function normalizeSecurityGroupRule(rule) {
  const protocol = safeString(rule.protocol, 'securityGroup.protocol').toLowerCase();
  if (!/^(?:-1|tcp|udp|icmp|icmpv6|\d{1,3})$/.test(protocol)) fail('security group protocol is invalid');
  if ((rule.fromPort === undefined) !== (rule.toPort === undefined))
    fail('security group port range must specify both endpoints');
  if (rule.fromPort !== undefined) {
    const toPort = rule.toPort;
    if (
      toPort === undefined ||
      !Number.isInteger(rule.fromPort) ||
      !Number.isInteger(toPort) ||
      rule.fromPort < -1 ||
      toPort > 65535 ||
      rule.fromPort > toPort
    )
      fail('security group port range is invalid');
  }
  if (!Array.isArray(rule.cidrs) || rule.cidrs.length < 1) fail('security group rule requires at least one CIDR');
  return {
    protocol,
    ...(rule.fromPort === undefined ? {} : { fromPort: rule.fromPort, toPort: rule.toPort }),
    cidrs: [...new Set(rule.cidrs.map((item) => cidr(item, 'securityGroup.cidr')))].sort(),
  };
}
function validateResearch(observation) {
  if (observation.schemaVersion !== AWS_CE_SCHEMA_VERSION) fail('unsupported observation schema');
  if (observation.research?.method !== 'aws-cli-live' || observation.research.officialSourceRetrieval !== 'live')
    fail('live AWS research receipt is required');
  if (
    observation.research.sharedContract?.url !== AWS_CE_SHARED_CONTRACT_URL ||
    observation.research.sharedContract.contractId !== 'f5xc-ce-automation-policy' ||
    observation.research.sharedContract.contractVersion !== 'v2' ||
    !/^[a-f0-9]{64}$/.test(observation.research.sharedContract.normalizedSha256)
  )
    fail('valid shared Customer Edge automation contract receipt is required');
  if (
    observation.research.f5AwsGuide?.url !== AWS_CE_F5_GUIDE_URL ||
    !/^[a-f0-9]{64}$/.test(observation.research.f5AwsGuide.normalizedSha256)
  )
    fail('valid current F5 AWS SMSv2 guide receipt is required');
  const receipts = new Map(observation.research.sourceReceipts.map((item) => [item.url, item.normalizedSha256]));
  for (const source of [AWS_CE_SHARED_CONTRACT_URL, ...observation.research.officialSources])
    if (!/^[a-f0-9]{64}$/.test(receipts.get(source) ?? '')) fail(`source digest is missing for ${source}`);
  if (receipts.get(AWS_CE_SHARED_CONTRACT_URL) !== observation.research.sharedContract.normalizedSha256)
    fail('shared contract digest is inconsistent');
  if (receipts.get(AWS_CE_F5_GUIDE_URL) !== observation.research.f5AwsGuide.normalizedSha256)
    fail('F5 AWS guide digest is inconsistent');
  const tgwGuide = observation.research.mcnTgwGuide;
  if (
    tgwGuide &&
    (tgwGuide.url !== AWS_CE_TGW_GUIDE_URL ||
      !/^[a-f0-9]{64}$/.test(tgwGuide.normalizedSha256) ||
      receipts.get(tgwGuide.url) !== tgwGuide.normalizedSha256)
  )
    fail('MCN AWS TGW guide evidence is inconsistent');
  const requiredCommands = [
    'aws sts get-caller-identity',
    'aws ec2 describe-regions --all-regions',
    `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
    'aws ec2 describe-images',
    'aws ec2 describe-image-attribute',
    'aws ec2 get-allowed-images-settings',
    'aws ec2 describe-instance-types',
    'aws ec2 describe-instance-type-offerings',
    'aws service-quotas get-service-quota',
    'aws service-quotas list-service-quotas',
    'aws marketplace-agreement search-agreements',
  ];
  for (const command of requiredCommands)
    if (!observation.research.commands.includes(command)) fail(`live AWS research receipt is missing ${command}`);
}
function tags(intent, node, interfaceIndex) {
  const nodeTag = node === undefined ? '' : `,{Key=xcsh-node-index,Value=${node}}`;
  const interfaceTag = interfaceIndex === undefined ? '' : `,{Key=xcsh-interface-index,Value=${interfaceIndex}}`;
  return `ResourceType=instance,Tags=[{Key=xcsh-managed-by,Value=aws-ce},{Key=xcsh-execution-engine,Value=${intent.engine}},{Key=xcsh-deployment-id,Value=${intent.deploymentName}},{Key=xcsh-plan-sha256,Value=__PLAN_SHA256__},{Key=ves-io-site-name,Value=${node === undefined ? intent.siteName : siteForNode(intent, node).name}}${nodeTag}${interfaceTag}]`;
}
function tagSpec(intent, resourceType, node, interfaceIndex) {
  return tags(intent, node, interfaceIndex).replace('ResourceType=instance', `ResourceType=${resourceType}`);
}
function nodeIndex(resource) {
  const value = Number(resource.tags['xcsh-node-index']);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
function orderedOwnedInstances(observation, nodeCount) {
  const byNode = new Map();
  for (const resource of observation.resources.filter((item) => item.owned && item.id.startsWith('i-'))) {
    const node = nodeIndex(resource);
    if (!node || node > nodeCount || byNode.has(node)) fail('owned instances require unique xcsh-node-index tags');
    byNode.set(node, resource);
  }
  return Array.from({ length: nodeCount }, (_, index) => byNode.get(index + 1)).filter(
    (resource) => resource !== undefined,
  );
}
function ownedNodeEnis(observation, node, interfaceCount) {
  const byInterface = new Map();
  for (const resource of observation.resources.filter(
    (item) => item.owned && item.id.startsWith('eni-') && nodeIndex(item) === node,
  )) {
    const interfaceIndex = Number(resource.tags['xcsh-interface-index']);
    if (
      !Number.isInteger(interfaceIndex) ||
      interfaceIndex < 0 ||
      interfaceIndex >= interfaceCount ||
      byInterface.has(interfaceIndex)
    )
      fail(`owned node ${node} ENIs require unique xcsh-interface-index tags`);
    byInterface.set(interfaceIndex, resource);
  }
  return Array.from({ length: interfaceCount }, (_, index) => byInterface.get(index)).filter(
    (resource) => resource !== undefined,
  );
}
function resourceDeleteArgs(resource, base) {
  const id = resource.id;
  if (/^vol-/.test(id)) return ['ec2', 'delete-volume', '--volume-id', id, ...base];
  if (/^i-/.test(id)) return ['ec2', 'terminate-instances', '--instance-ids', id, ...base];
  if (/^eni-/.test(id)) return ['ec2', 'delete-network-interface', '--network-interface-id', id, ...base];
  if (/^subnet-/.test(id)) return ['ec2', 'delete-subnet', '--subnet-id', id, ...base];
  if (/^sg-/.test(id)) return ['ec2', 'delete-security-group', '--group-id', id, ...base];
  if (/^eipalloc-/.test(id)) return ['ec2', 'release-address', '--allocation-id', id, ...base];
  if (/^eipassoc-/.test(id)) return ['ec2', 'disassociate-address', '--association-id', id, ...base];
  if (/^igw-/.test(id)) return ['ec2', 'delete-internet-gateway', '--internet-gateway-id', id, ...base];
  if (/^rtb-/.test(id)) return ['ec2', 'delete-route-table', '--route-table-id', id, ...base];
  if (/^vpc-/.test(id)) return ['ec2', 'delete-vpc', '--vpc-id', id, ...base];
  if (/^tgw-attach-/.test(id))
    return JSON.stringify(resource.state).includes('"ResourceType":"connect"')
      ? ['ec2', 'delete-transit-gateway-connect', '--transit-gateway-attachment-id', id, ...base]
      : ['ec2', 'delete-transit-gateway-vpc-attachment', '--transit-gateway-attachment-id', id, ...base];
  if (/^tgw-connect-peer-/.test(id))
    return ['ec2', 'delete-transit-gateway-connect-peer', '--transit-gateway-connect-peer-id', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:targetgroup\//.test(id))
    return ['elbv2', 'delete-target-group', '--target-group-arn', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id))
    return ['elbv2', 'delete-listener', '--listener-arn', id, ...base];
  if (/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(id))
    return ['elbv2', 'delete-load-balancer', '--load-balancer-arn', id, ...base];
  throw new Error(`AWS CE teardown has no safe deletion driver for owned resource ${id}`);
}
function deletionPriority(resource) {
  const { id } = resource;
  if (/listener\//.test(id) || id.startsWith('tgw-connect-peer-')) return 10;
  if (/loadbalancer\//.test(id)) return 20;
  if (/targetgroup\//.test(id)) return 30;
  if (id.startsWith('tgw-attach-')) {
    const attachments = Array.isArray(resource.state.TransitGatewayAttachments)
      ? resource.state.TransitGatewayAttachments
      : [];
    return attachments[0]?.ResourceType === 'connect' ? 30 : 35;
  }
  if (id.startsWith('i-')) return 40;
  if (id.startsWith('eipassoc-')) return 50;
  if (id.startsWith('eipalloc-')) return 60;
  if (id.startsWith('eni-')) return 70;
  if (id.startsWith('vol-')) return 75;
  if (id.startsWith('sg-')) return 80;
  if (id.startsWith('rtb-')) return 85;
  if (id.startsWith('subnet-')) return 90;
  if (id.startsWith('igw-')) return 95;
  if (id.startsWith('vpc-')) return 100;
  return 75;
}
function originalRouteArgs(state, routeTableId, destinationCidr, base) {
  const tables = Array.isArray(state.RouteTables) ? state.RouteTables : [];
  const routes = Array.isArray(tables[0]?.Routes) ? tables[0].Routes : [];
  const route = routes.find((item) => item.DestinationCidrBlock === destinationCidr);
  if (!route)
    return [
      'ec2',
      'delete-route',
      '--route-table-id',
      routeTableId,
      '--destination-cidr-block',
      destinationCidr,
      ...base,
    ];
  const targets = [
    ['GatewayId', '--gateway-id'],
    ['NatGatewayId', '--nat-gateway-id'],
    ['NetworkInterfaceId', '--network-interface-id'],
    ['TransitGatewayId', '--transit-gateway-id'],
    ['VpcPeeringConnectionId', '--vpc-peering-connection-id'],
    ['EgressOnlyInternetGatewayId', '--egress-only-internet-gateway-id'],
  ];
  const target = targets.find(([key]) => typeof route[key] === 'string' && route[key]);
  if (!target) fail(`persisted restoration state for ${routeTableId}/${destinationCidr} has no supported route target`);
  return [
    'ec2',
    'replace-route',
    '--route-table-id',
    routeTableId,
    '--destination-cidr-block',
    destinationCidr,
    target[1],
    String(route[target[0]]),
    ...base,
  ];
}
function compileActions(intent, observation, restorationById) {
  let sequence = 0;
  const actions = [];
  const add = (action) => actions.push({ ...action, id: `aws-ce-action-${String(++sequence).padStart(4, '0')}` });
  const base = ['--region', intent.region];
  const rootDeviceName = observation.regions.find((item) => item.name === intent.region)?.ami?.rootDeviceName ?? '';
  if (!DEVICE_NAME.test(rootDeviceName)) fail('observed AMI root device name is invalid');
  if (intent.operation === 'teardown') {
    assertAwsEbsTeardown(intent, observation);
    for (const route of intent.routes) {
      const state = restorationById.get(route.routeTableId);
      if (!state) fail(`teardown requires persisted pre-change restoration state for ${route.routeTableId}`);
      add({
        phase: 'teardown',
        kind: 'brownfield-restore',
        description: `Restore ${route.routeTableId}/${route.destinationCidr}`,
        command: 'aws',
        args: originalRouteArgs(state, route.routeTableId, route.destinationCidr, base),
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
    }
    const ownedAttachment = observation.resources.find(
      (resource) => resource.owned && resource.id.startsWith('tgw-attach-'),
    )?.id;
    for (const routeTableId of [...new Set([...intent.routing.associations, ...intent.routing.propagations])].sort()) {
      const state = restorationById.get(routeTableId);
      if (!state) fail(`teardown requires persisted TGW restoration state for ${routeTableId}`);
      const associations = Array.isArray(state.Associations) ? state.Associations : [];
      const propagations = Array.isArray(state.Propagations) ? state.Propagations : [];
      if (ownedAttachment && intent.routing.associations.includes(routeTableId))
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Remove deployment association from ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'disassociate-transit-gateway-route-table',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            ownedAttachment,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      if (ownedAttachment && intent.routing.propagations.includes(routeTableId))
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Remove deployment propagation from ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'disable-transit-gateway-route-table-propagation',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            ownedAttachment,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      for (const association of associations.sort((a, b) =>
        String(a.TransitGatewayAttachmentId).localeCompare(String(b.TransitGatewayAttachmentId)),
      )) {
        const attachmentId = String(association.TransitGatewayAttachmentId ?? '');
        if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId))
          fail(`invalid persisted TGW association for ${routeTableId}`);
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore association ${attachmentId} to ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'associate-transit-gateway-route-table',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            attachmentId,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      }
      for (const propagation of propagations.sort((a, b) =>
        String(a.TransitGatewayAttachmentId).localeCompare(String(b.TransitGatewayAttachmentId)),
      )) {
        const attachmentId = String(propagation.TransitGatewayAttachmentId ?? '');
        if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId))
          fail(`invalid persisted TGW propagation for ${routeTableId}`);
        add({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore propagation ${attachmentId} to ${routeTableId}`,
          command: 'aws',
          args: [
            'ec2',
            'enable-transit-gateway-route-table-propagation',
            '--transit-gateway-route-table-id',
            routeTableId,
            '--transit-gateway-attachment-id',
            attachmentId,
            ...base,
          ],
          resourceId: routeTableId,
          mutates: true,
          destructive: true,
        });
      }
    }
    for (const resource of observation.resources
      .filter(
        (item) => item.owned && !(intent.engine === 'native' && isAwsTerminatedOwnedInstance(item, intent.accountId)),
      )
      .sort((a, b) => deletionPriority(a) - deletionPriority(b) || a.id.localeCompare(b.id))) {
      if (resource.id.startsWith('rtb-')) {
        const tables = resource.state.RouteTables;
        for (const association of tables?.[0]?.Associations ?? []) {
          if (association.Main) fail('refusing to delete an owned route table promoted to VPC main');
          if (!/^rtbassoc-[0-9a-f]{8,21}$/.test(association.RouteTableAssociationId ?? ''))
            fail('invalid route table association');
          add({
            phase: 'teardown',
            kind: 'route-table-disassociate',
            description: `Disassociate ${resource.id}`,
            command: 'aws',
            args: [
              'ec2',
              'disassociate-route-table',
              '--association-id',
              String(association.RouteTableAssociationId),
              ...base,
            ],
            resourceId: resource.id,
            mutates: true,
            destructive: true,
          });
        }
      }
      if (resource.id.startsWith('igw-')) {
        const gateways = resource.state.InternetGateways;
        for (const attachment of gateways?.[0]?.Attachments ?? []) {
          if (!observation.resources.some((item) => item.id === attachment.VpcId && item.owned))
            fail('internet gateway attachment is outside the owned deployment');
          add({
            phase: 'teardown',
            kind: 'internet-gateway-detach',
            description: `Detach ${resource.id}`,
            command: 'aws',
            args: [
              'ec2',
              'detach-internet-gateway',
              '--internet-gateway-id',
              resource.id,
              '--vpc-id',
              String(attachment.VpcId),
              ...base,
            ],
            resourceId: resource.id,
            mutates: true,
            destructive: true,
          });
        }
      }
      add({
        phase: 'teardown',
        kind: 'resource-delete',
        description: `Delete owned ${resource.id}`,
        command: 'aws',
        args: resourceDeleteArgs(resource, base),
        resourceId: resource.id,
        mutates: true,
        destructive: true,
      });
      if (resource.id.startsWith('i-'))
        add({
          phase: 'teardown',
          kind: 'instance-termination-gate',
          description: `Wait for owned instance ${resource.id} to terminate before deleting its interfaces`,
          command: 'aws',
          args: ['ec2', 'wait', 'instance-terminated', '--instance-ids', resource.id, ...base],
          resourceId: resource.id,
          mutates: false,
          destructive: false,
        });
    }
    return actions;
  }
  assertAwsDeploymentCompilerOperation(intent);
  const ownedInstances = orderedOwnedInstances(observation, intent.topology.nodeCount);
  if (intent.operation === 'resize') {
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`resize requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    for (const [index, instance] of ownedInstances.entries()) {
      add({
        phase: 'nodes',
        kind: 'instance-stop',
        description: `Stop ${instance.id}`,
        command: 'aws',
        args: ['ec2', 'stop-instances', '--instance-ids', instance.id, ...base],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: true,
      });
      add({
        phase: 'nodes',
        kind: 'instance-resize',
        description: `Resize ${instance.id}`,
        command: 'aws',
        args: [
          'ec2',
          'modify-instance-attribute',
          '--instance-id',
          instance.id,
          '--instance-type',
          `Value=${intent.instance.type}`,
          ...base,
        ],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: true,
      });
      add({
        phase: 'nodes',
        kind: 'instance-start',
        description: `Start ${instance.id}`,
        command: 'aws',
        args: ['ec2', 'start-instances', '--instance-ids', instance.id, ...base],
        node: index + 1,
        resourceId: instance.id,
        mutates: true,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'registration-gate',
        description: `Verify node ${index + 1} registration after resize`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify node ${index + 1} after resize`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
      if (intent.routing.profile === 'tgw-connect')
        add({
          phase: 'verify',
          kind: 'bgp-gate',
          description: `Verify BGP after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      if (awsCeNlbIngress(intent))
        add({
          phase: 'verify',
          kind: 'nlb-gate',
          description: `Verify NLB after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      if (intent.routing.profile.startsWith('tgw-'))
        add({
          phase: 'verify',
          kind: 'tgw-route-gate',
          description: `Verify TGW routes after node ${index + 1} resize`,
          node: index + 1,
          mutates: false,
          destructive: false,
        });
      add({
        phase: 'verify',
        kind: 'traffic-gate',
        description: `Verify traffic after node ${index + 1}`,
        node: index + 1,
        mutates: false,
        destructive: false,
      });
    }
    return actions;
  }
  const addSteadyStateGates = () => {
    for (let node = 1; node <= intent.topology.nodeCount; node++) {
      add({
        phase: 'registration',
        kind: 'registration-gate',
        description: `Verify node ${node} registration`,
        node,
        mutates: false,
        destructive: false,
      });
      add({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify node ${node} health`,
        node,
        mutates: false,
        destructive: false,
      });
    }
    if (awsCeNlbIngress(intent))
      add({
        phase: 'verify',
        kind: 'nlb-gate',
        description: 'Verify NLB targets and health',
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile === 'tgw-connect')
      add({
        phase: 'verify',
        kind: 'bgp-gate',
        description: `Verify ${(intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0) * 2} AWS-managed BGP sessions across ${intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0} Connect peers`,
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile.startsWith('tgw-'))
      add({
        phase: 'verify',
        kind: 'tgw-route-gate',
        description: 'Verify TGW associations, propagations, and routes',
        mutates: false,
        destructive: false,
      });
    add({
      phase: 'verify',
      kind: 'traffic-gate',
      description: 'Verify end-to-end traffic',
      mutates: false,
      destructive: false,
    });
  };
  if (intent.operation === 'reconcile') {
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`reconcile requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    addSteadyStateGates();
    return actions;
  }
  if (intent.operation === 'update-network') {
    const ownedEnis = Array.from({ length: intent.topology.nodeCount }, (_, index) =>
      ownedNodeEnis(observation, index + 1, intent.interfaces.length),
    );
    if (ownedEnis.some((items) => items.length !== intent.interfaces.length))
      fail('update-network requires the complete observed owned ENI inventory');
    const sliIndex = intent.interfaces.length > 1 ? 1 : 0;
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Update ${route.destinationCidr} to the observed CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          ownedEnis[routeNode(intent, route) - 1][sliIndex].id,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
    const attachment = observation.resources.find((item) => item.owned && item.id.startsWith('tgw-attach-'))?.id;
    if (intent.routing.profile.startsWith('tgw-') && !attachment)
      fail('update-network requires the observed owned TGW attachment');
    const attachmentId = attachment ?? '';
    for (const routeTableId of intent.routing.associations)
      add({
        phase: 'routing',
        kind: 'tgw-associate',
        description: `Update association ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'associate-transit-gateway-route-table',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          attachmentId,
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const routeTableId of intent.routing.propagations)
      add({
        phase: 'routing',
        kind: 'tgw-propagate',
        description: `Update propagation ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'enable-transit-gateway-route-table-propagation',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          attachmentId,
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    addSteadyStateGates();
    return actions;
  }
  if (intent.operation === 'replace-node' || intent.operation === 'repair') {
    const replacementNode = intent.replacementNode;
    if (
      replacementNode === undefined ||
      !Number.isInteger(replacementNode) ||
      replacementNode < 1 ||
      replacementNode > intent.topology.nodeCount
    )
      fail(`${intent.operation} requires an exact replacementNode`);
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`${intent.operation} requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    const nodeEnis = ownedNodeEnis(observation, replacementNode, intent.interfaces.length);
    if (nodeEnis.length !== intent.interfaces.length)
      fail(`${intent.operation} requires the complete observed owned ENI inventory`);
    const node = replacementNode;
    const instance = ownedInstances[node - 1];
    add({
      phase: 'nodes',
      kind: 'instance-terminate',
      description: `Terminate node ${node} instance ${instance.id}`,
      command: 'aws',
      args: ['ec2', 'terminate-instances', '--instance-ids', instance.id, ...base],
      node,
      resourceId: instance.id,
      mutates: true,
      destructive: true,
    });
    add({
      phase: 'nodes',
      kind: 'instance-run',
      description: `Launch replacement CE node ${node}`,
      command: 'aws',
      args: [
        'ec2',
        'run-instances',
        '--image-id',
        intent.image.amiId,
        '--instance-type',
        intent.instance.type,
        '--block-device-mappings',
        `DeviceName=${rootDeviceName},Ebs={VolumeSize=${intent.instance.diskGiB},VolumeType=gp3,DeleteOnTermination=true}`,
        '--network-interfaces',
        ...nodeEnis.map((eni, index) => `DeviceIndex=${index},NetworkInterfaceId=${eni.id}`),
        ...(intent.instance.instanceProfileArn
          ? ['--iam-instance-profile', `Arn=${intent.instance.instanceProfileArn}`]
          : []),
        ...(intent.instance.bootstrapKeyPairName ? [`--key-name=${intent.instance.bootstrapKeyPairName}`] : []),
        '--user-data',
        'file://__BOOTSTRAP_FILE__',
        '--tag-specifications',
        tags(intent, node),
        tagSpec(intent, 'volume', node),
        ...base,
      ],
      node,
      resourceId: `aws://${intent.region}/instance/${intent.deploymentName}-${node}-replacement`,
      mutates: true,
      destructive: false,
      requiresBootstrap: true,
      capture: { placeholder: `__INSTANCE_${node}_REPLACEMENT__`, path: 'Instances.0.InstanceId' },
    });
    for (const eni of nodeEnis)
      add({
        phase: 'nodes',
        kind: 'source-destination-check-disable',
        description: `Disable source/destination check on replacement node ${node} ENI ${eni.id}`,
        command: 'aws',
        args: [
          'ec2',
          'modify-network-interface-attribute',
          '--network-interface-id',
          eni.id,
          '--source-dest-check',
          'Value=false',
          ...base,
        ],
        node,
        resourceId: eni.id,
        mutates: true,
        destructive: false,
      });
    add({
      phase: 'registration',
      kind: 'registration-gate',
      description: `Verify replacement node ${node} registration`,
      node,
      mutates: false,
      destructive: false,
    });
    add({
      phase: 'registration',
      kind: 'health-gate',
      description: `Verify replacement node ${node} health`,
      node,
      mutates: false,
      destructive: false,
    });
    if (intent.routing.profile === 'tgw-connect')
      add({
        phase: 'verify',
        kind: 'bgp-gate',
        description: `Verify BGP after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    if (awsCeNlbIngress(intent))
      add({
        phase: 'verify',
        kind: 'nlb-gate',
        description: `Verify NLB after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    if (intent.routing.profile.startsWith('tgw-'))
      add({
        phase: 'verify',
        kind: 'tgw-route-gate',
        description: `Verify TGW routes after replacement node ${node}`,
        node,
        mutates: false,
        destructive: false,
      });
    add({
      phase: 'verify',
      kind: 'traffic-gate',
      description: `Verify traffic after replacement node ${node}`,
      node,
      mutates: false,
      destructive: false,
    });
    return actions;
  }
  if (observation.resources.some((resource) => resource.owned))
    fail('deploy refuses observed owned-resource collisions; use reconcile or an explicit lifecycle operation');
  if (intent.vpc.mode === 'greenfield') {
    const vpcCidr = intent.vpc.cidr ?? '';
    add({
      phase: 'network',
      kind: 'vpc-create',
      description: `Create VPC ${intent.deploymentName}`,
      command: 'aws',
      args: ['ec2', 'create-vpc', '--cidr-block', vpcCidr, '--tag-specifications', tagSpec(intent, 'vpc'), ...base],
      resourceId: `aws://${intent.region}/vpc/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__VPC_ID__', path: 'Vpc.VpcId' },
    });
  }
  for (const item of intent.interfaces)
    for (const [nodeIndex, subnet] of item.subnets.entries())
      if (intent.vpc.mode === 'greenfield') {
        const subnetCidr = subnet.cidr ?? '';
        add({
          phase: 'network',
          kind: 'subnet-create',
          description: `Create node ${nodeIndex + 1} interface ${item.index} subnet`,
          command: 'aws',
          args: [
            'ec2',
            'create-subnet',
            '--vpc-id',
            '__VPC_ID__',
            '--availability-zone',
            subnet.availabilityZone,
            '--cidr-block',
            subnetCidr,
            '--tag-specifications',
            tagSpec(intent, 'subnet'),
            ...base,
          ],
          node: nodeIndex + 1,
          resourceId: `aws://${intent.region}/subnet/${intent.deploymentName}-${nodeIndex + 1}-${item.index}`,
          mutates: true,
          destructive: false,
          capture: { placeholder: `__SUBNET_${nodeIndex + 1}_${item.index}__`, path: 'Subnet.SubnetId' },
        });
      }
  if (intent.vpc.mode === 'greenfield' && intent.egress.mode === 'elastic-ip') {
    const gateway = `aws://${intent.region}/internet-gateway/${intent.deploymentName}`;
    const routeTable = `aws://${intent.region}/route-table/${intent.deploymentName}-slo`;
    add({
      phase: 'network',
      kind: 'internet-gateway-create',
      description: 'Create CE internet gateway',
      command: 'aws',
      args: ['ec2', 'create-internet-gateway', '--tag-specifications', tagSpec(intent, 'internet-gateway'), ...base],
      resourceId: gateway,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__IGW_ID__', path: 'InternetGateway.InternetGatewayId' },
    });
    add({
      phase: 'network',
      kind: 'internet-gateway-attach',
      description: 'Attach CE internet gateway',
      command: 'aws',
      args: [
        'ec2',
        'attach-internet-gateway',
        '--internet-gateway-id',
        '__IGW_ID__',
        '--vpc-id',
        '__VPC_ID__',
        ...base,
      ],
      resourceId: gateway,
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'network',
      kind: 'route-table-create',
      description: 'Create dedicated SLO route table',
      command: 'aws',
      args: [
        'ec2',
        'create-route-table',
        '--vpc-id',
        '__VPC_ID__',
        '--tag-specifications',
        tagSpec(intent, 'route-table'),
        ...base,
      ],
      resourceId: routeTable,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__SLO_ROUTE_TABLE__', path: 'RouteTable.RouteTableId' },
    });
    add({
      phase: 'network',
      kind: 'route-create',
      description: 'Route SLO internet traffic through the CE gateway',
      command: 'aws',
      args: [
        'ec2',
        'create-route',
        '--route-table-id',
        '__SLO_ROUTE_TABLE__',
        '--destination-cidr-block',
        '0.0.0.0/0',
        '--gateway-id',
        '__IGW_ID__',
        ...base,
      ],
      resourceId: routeTable,
      mutates: true,
      destructive: false,
    });
    for (let node = 1; node <= intent.topology.nodeCount; node++)
      add({
        phase: 'network',
        kind: 'route-table-associate',
        description: `Associate node ${node} SLO subnet with internet routing`,
        command: 'aws',
        args: [
          'ec2',
          'associate-route-table',
          '--route-table-id',
          '__SLO_ROUTE_TABLE__',
          '--subnet-id',
          `__SUBNET_${node}_0__`,
          ...base,
        ],
        resourceId: routeTable,
        node,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__SLO_ROUTE_ASSOCIATION_${node}__`, path: 'AssociationId' },
      });
  }
  for (const group of intent.securityGroups)
    add({
      phase: 'network',
      kind: 'security-group-create',
      description: `Create security group ${group.name}`,
      command: 'aws',
      args: [
        'ec2',
        'create-security-group',
        '--group-name',
        `${intent.deploymentName}-${group.name}`,
        '--description',
        `F5 CE ${group.name}`,
        '--vpc-id',
        intent.vpc.vpcId ?? '__VPC_ID__',
        '--tag-specifications',
        tagSpec(intent, 'security-group'),
        ...base,
      ],
      resourceId: `aws://${intent.region}/security-group/${intent.deploymentName}-${group.name}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: `__SG_${group.name}__`, path: 'GroupId' },
    });
  for (const group of intent.securityGroups)
    add({
      phase: 'network',
      kind: 'security-group-egress-reset',
      description: `Remove default egress from newly owned security group ${group.name}`,
      resourceId: `__SG_${group.name}__`,
      mutates: true,
      destructive: false,
    });
  for (const group of intent.securityGroups)
    for (const direction of ['ingress', 'egress'])
      for (const [ruleIndex, rule] of group[direction].entries()) {
        const permission = {
          IpProtocol: rule.protocol,
          ...(rule.fromPort === undefined ? {} : { FromPort: rule.fromPort }),
          ...(rule.toPort === undefined ? {} : { ToPort: rule.toPort }),
          IpRanges: [...new Set(rule.cidrs)].sort().map((CidrIp) => ({ CidrIp })),
          ...(rule.self ? { UserIdGroupPairs: [{ GroupId: `__SG_${group.name}__` }] } : {}),
        };
        add({
          phase: 'network',
          kind: 'security-group-rule-create',
          description: `Create ${group.name} ${direction} rule ${ruleIndex + 1}`,
          command: 'aws',
          args: [
            'ec2',
            `authorize-security-group-${direction}`,
            '--group-id',
            `__SG_${group.name}__`,
            '--ip-permissions',
            JSON.stringify([permission]),
            ...base,
          ],
          resourceId: `aws://${intent.region}/security-group-rule/${intent.deploymentName}-${group.name}-${direction}-${ruleIndex + 1}`,
          mutates: true,
          destructive: false,
        });
      }
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces) {
      const privateAddresses = awsCeInterfacePrivateAddresses(intent, node, item.index);
      add({
        phase: 'network',
        kind: 'eni-create',
        description: `Create node ${node} ENI ${item.index}`,
        command: 'aws',
        args: [
          'ec2',
          'create-network-interface',
          '--subnet-id',
          item.subnets[node - 1].subnetId ?? `__SUBNET_${node}_${item.index}__`,
          '--description',
          `${intent.deploymentName} node ${node} ${item.role}`,
          ...(privateAddresses.length
            ? [
                '--private-ip-addresses',
                ...privateAddresses.map((address, index) => `PrivateIpAddress=${address},Primary=${index === 0}`),
              ]
            : []),
          ...['--groups', ...interfaceSecurityGroups(intent, item.index).map((name) => `__SG_${name}__`)],
          '--tag-specifications',
          tagSpec(intent, 'network-interface', node, item.index),
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eni/${intent.deploymentName}-${node}-${item.index}`,
        mutates: true,
        destructive: false,
        captures: [
          { placeholder: `__ENI_${node}_${item.index}__`, path: 'NetworkInterface.NetworkInterfaceId' },
          { placeholder: `__ENI_${node}_${item.index}_MAC__`, path: 'NetworkInterface.MacAddress' },
          { placeholder: `__NODE_${node}_${item.role.toUpperCase()}_IP__`, path: 'NetworkInterface.PrivateIpAddress' },
        ],
      });
    }
    if (intent.egress.mode === 'elastic-ip')
      add({
        phase: 'network',
        kind: 'elastic-ip-allocate',
        description: `Allocate node ${node} Elastic IP`,
        command: 'aws',
        args: [
          'ec2',
          'allocate-address',
          '--domain',
          'vpc',
          '--tag-specifications',
          tagSpec(intent, 'elastic-ip', node),
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eip/${intent.deploymentName}-${node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__EIP_${node}__`, path: 'AllocationId' },
      });
    const networkInterfaces = intent.interfaces.map(
      (item) => `DeviceIndex=${item.index},NetworkInterfaceId=__ENI_${node}_${item.index}__`,
    );
    add({
      phase: 'nodes',
      kind: 'instance-run',
      description: `Launch CE node ${node}`,
      command: 'aws',
      args: [
        'ec2',
        'run-instances',
        '--image-id',
        intent.image.amiId,
        '--instance-type',
        intent.instance.type,
        '--block-device-mappings',
        `DeviceName=${rootDeviceName},Ebs={VolumeSize=${intent.instance.diskGiB},VolumeType=gp3,DeleteOnTermination=true}`,
        '--network-interfaces',
        ...networkInterfaces,
        ...(intent.instance.instanceProfileArn
          ? ['--iam-instance-profile', `Arn=${intent.instance.instanceProfileArn}`]
          : []),
        ...(intent.instance.bootstrapKeyPairName ? [`--key-name=${intent.instance.bootstrapKeyPairName}`] : []),
        '--user-data',
        'file://__BOOTSTRAP_FILE__',
        '--tag-specifications',
        tags(intent, node),
        tagSpec(intent, 'volume', node),
        ...base,
      ],
      node,
      resourceId: `aws://${intent.region}/instance/${intent.deploymentName}-${node}`,
      mutates: true,
      destructive: false,
      requiresBootstrap: true,
      capture: { placeholder: `__INSTANCE_${node}__`, path: 'Instances.0.InstanceId' },
    });
    if (intent.egress.mode === 'elastic-ip')
      add({
        phase: 'nodes',
        kind: 'elastic-ip-associate',
        description: `Associate node ${node} Elastic IP with SLO`,
        command: 'aws',
        args: [
          'ec2',
          'associate-address',
          '--allocation-id',
          `__EIP_${node}__`,
          '--network-interface-id',
          `__ENI_${node}_0__`,
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eip-association/${intent.deploymentName}-${node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__EIP_ASSOC_${node}__`, path: 'AssociationId' },
      });
    for (const iface of intent.interfaces)
      add({
        phase: 'nodes',
        kind: 'source-destination-check-disable',
        description: `Disable source/destination check on node ${node} ${iface.role} ENI`,
        command: 'aws',
        args: [
          'ec2',
          'modify-network-interface-attribute',
          '--network-interface-id',
          `__ENI_${node}_${iface.index}__`,
          '--source-dest-check',
          'Value=false',
          ...base,
        ],
        node,
        resourceId: `aws://${intent.region}/eni/${intent.deploymentName}-${node}-${iface.index}`,
        mutates: true,
        destructive: false,
      });
    add({
      phase: 'registration',
      kind: 'registration-gate',
      description: `Verify node ${node} registration`,
      node,
      mutates: false,
      destructive: false,
    });
    add({
      phase: 'registration',
      kind: 'health-gate',
      description: `Verify node ${node} health`,
      node,
      mutates: false,
      destructive: false,
    });
  }
  if (intent.routing.profile === 'direct-eni')
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Route ${route.destinationCidr} to the CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          `__ENI_1_${intent.interfaces.length > 1 ? 1 : 0}__`,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
  const nlbIngress = awsCeNlbIngress(intent);
  const check = nlbIngress ? nlbSettings(intent).healthCheck : undefined;
  if (nlbIngress) {
    if (!check) fail('NLB health-check settings are required');
    const subnetIds =
      intent.ingress?.mode === 'nlb'
        ? intent.ingress.loadBalancer.subnetIds
        : intent.interfaces[0].subnets.map((subnet, index) => subnet.subnetId ?? `__SUBNET_${index + 1}_0__`);
    add({
      phase: 'routing',
      kind: 'nlb-create',
      description: 'Create three-zone Network Load Balancer ingress',
      command: 'aws',
      args: [
        'elbv2',
        'create-load-balancer',
        '--name',
        `${intent.deploymentName}-nlb`,
        '--type',
        'network',
        ...(nlbIngress.scheme === 'internal' ? ['--scheme', 'internal'] : []),
        ...(intent.ingress?.mode === 'nlb'
          ? [
              '--subnet-mappings',
              ...subnetIds.map(
                (subnetId, index) =>
                  `SubnetId=${subnetId},PrivateIPv4Address=${intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.privateAddresses[index] : ''}`,
              ),
            ]
          : ['--subnets', ...subnetIds]),
        '--tags',
        `Key=xcsh-managed-by,Value=aws-ce`,
        `Key=xcsh-execution-engine,Value=${intent.engine}`,
        `Key=xcsh-deployment-id,Value=${intent.deploymentName}`,
        `Key=xcsh-plan-sha256,Value=__PLAN_SHA256__`,
        `Key=ves-io-site-name,Value=${intent.siteName}`,
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_ARN__', path: 'LoadBalancers.0.LoadBalancerArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-target-group-create',
      description: 'Create IP target group for three CE SLI addresses',
      command: 'aws',
      args: [
        'elbv2',
        'create-target-group',
        '--name',
        `${intent.deploymentName}-ce`,
        '--protocol',
        'TCP',
        '--port',
        String(nlbIngress.port),
        '--target-type',
        'ip',
        '--vpc-id',
        intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.vpcId : (intent.vpc.vpcId ?? '__VPC_ID__'),
        '--health-check-protocol',
        check.protocol,
        '--health-check-port',
        String(check.port),
        '--health-check-interval-seconds',
        String(check.intervalSeconds),
        '--health-check-timeout-seconds',
        String(check.timeoutSeconds),
        '--healthy-threshold-count',
        String(check.healthyThreshold),
        '--unhealthy-threshold-count',
        String(check.unhealthyThreshold),
        ...(check.path ? ['--health-check-path', check.path] : []),
        '--tags',
        `Key=xcsh-managed-by,Value=aws-ce`,
        `Key=xcsh-execution-engine,Value=${intent.engine}`,
        `Key=xcsh-deployment-id,Value=${intent.deploymentName}`,
        `Key=xcsh-plan-sha256,Value=__PLAN_SHA256__`,
        `Key=ves-io-site-name,Value=${intent.siteName}`,
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-target-group/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_TARGET_GROUP_ARN__', path: 'TargetGroups.0.TargetGroupArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-register-targets',
      description: 'Register three CE SLI IP targets',
      command: 'aws',
      args: [
        'elbv2',
        'register-targets',
        '--target-group-arn',
        '__NLB_TARGET_GROUP_ARN__',
        '--targets',
        ...(intent.ingress?.mode === 'nlb'
          ? intent.ingress.listener.usePrimaryInterfaceAddress === true
            ? Array.from(
                { length: intent.topology.nodeCount },
                (_, index) => `Id=__NODE_${index + 1}_SLI_IP__,AvailabilityZone=all`,
              )
            : (intent.ingress.listener.privateAddresses?.map((address) => `Id=${address},AvailabilityZone=all`) ?? [])
          : ['Id=__NODE_1_SLI_IP__', 'Id=__NODE_2_SLI_IP__', 'Id=__NODE_3_SLI_IP__']),
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-target-registration/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'routing',
      kind: 'nlb-listener-create',
      description: 'Create TCP ingress listener',
      command: 'aws',
      args: [
        'elbv2',
        'create-listener',
        '--load-balancer-arn',
        '__NLB_ARN__',
        '--protocol',
        'TCP',
        '--port',
        String(nlbIngress.port),
        '--default-actions',
        'Type=forward,TargetGroupArn=__NLB_TARGET_GROUP_ARN__',
        ...base,
      ],
      resourceId: `aws://${intent.region}/nlb-listener/${intent.deploymentName}`,
      mutates: true,
      destructive: false,
      capture: { placeholder: '__NLB_LISTENER_ARN__', path: 'Listeners.0.ListenerArn' },
    });
    add({
      phase: 'routing',
      kind: 'nlb-cross-zone-enable',
      description: 'Enable NLB cross-zone load balancing',
      command: 'aws',
      args: [
        'elbv2',
        'modify-load-balancer-attributes',
        '--load-balancer-arn',
        '__NLB_ARN__',
        '--attributes',
        'Key=load_balancing.cross_zone.enabled,Value=true',
        ...base,
      ],
      mutates: true,
      destructive: false,
    });
    if (intent.ingress?.mode === 'nlb')
      add({
        phase: 'routing',
        kind: 'f5-ingress-configure',
        description: 'Configure the owned XC inside HTTP listener on observed CE SLI addresses',
        mutates: true,
        destructive: false,
      });
  }
  if (intent.routing.profile === 'tgw-static' || intent.routing.profile === 'tgw-connect') {
    const transitGatewayId = intent.routing.transitGatewayId ?? '';
    if (!intent.routing.transportAttachmentId)
      add({
        phase: 'routing',
        kind: 'tgw-vpc-attachment-create',
        description: 'Create appliance VPC transport attachment',
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-vpc-attachment',
          '--transit-gateway-id',
          transitGatewayId,
          '--vpc-id',
          intent.vpc.vpcId ?? '__VPC_ID__',
          '--subnet-ids',
          ...intent.interfaces[1].subnets.map((subnet, index) => subnet.subnetId ?? `__SUBNET_${index + 1}_1__`),
          '--options',
          'ApplianceModeSupport=enable',
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-attachment'),
          ...base,
        ],
        resourceId: `aws://${intent.region}/tgw-attachment/${intent.deploymentName}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: '__TGW_TRANSPORT_ATTACHMENT__',
          path: 'TransitGatewayVpcAttachment.TransitGatewayAttachmentId',
        },
      });
    add({
      phase: 'routing',
      kind: 'tgw-attachment-gate',
      description: 'Wait for scoped VPC transport attachment availability',
      resourceId: intent.routing.transportAttachmentId ?? '__TGW_TRANSPORT_ATTACHMENT__',
      mutates: false,
      destructive: false,
    });
    for (const az of staticAzRoutes(intent)) {
      const table = `__STATIC_ROUTE_TABLE_${az.node}__`;
      add({
        phase: 'routing',
        kind: 'route-table-create',
        description: `Create appliance route table in ${az.availabilityZone}`,
        command: 'aws',
        args: [
          'ec2',
          'create-route-table',
          '--vpc-id',
          intent.vpc.vpcId ?? '__VPC_ID__',
          '--tag-specifications',
          tagSpec(intent, 'route-table', az.node),
          ...base,
        ],
        node: az.node,
        resourceId: `aws://${intent.region}/route-table/${intent.deploymentName}-static-${az.node}`,
        mutates: true,
        destructive: false,
        capture: { placeholder: table, path: 'RouteTable.RouteTableId' },
      });
      add({
        phase: 'routing',
        kind: 'route-table-associate',
        description: `Associate ${az.availabilityZone} appliance subnet`,
        command: 'aws',
        args: [
          'ec2',
          'associate-route-table',
          '--route-table-id',
          table,
          '--subnet-id',
          intent.interfaces[1].subnets[az.node - 1].subnetId ?? `__SUBNET_${az.node}_1__`,
          ...base,
        ],
        node: az.node,
        resourceId: table,
        mutates: true,
        destructive: false,
        capture: { placeholder: `__STATIC_ROUTE_ASSOCIATION_${az.node}__`, path: 'AssociationId' },
      });
      for (const [direction, prefixes] of [
        ['forward', az.forwardCidrs],
        ['return', az.returnCidrs],
      ])
        for (const destination of prefixes)
          add({
            phase: 'routing',
            kind: 'route-create',
            description: `${direction} route ${destination} in ${az.availabilityZone}`,
            command: 'aws',
            args: [
              'ec2',
              'create-route',
              '--route-table-id',
              table,
              '--destination-cidr-block',
              destination,
              ...(direction === 'forward'
                ? ['--network-interface-id', `__ENI_${az.node}_1__`]
                : ['--transit-gateway-id', transitGatewayId]),
              ...base,
            ],
            node: az.node,
            resourceId: table,
            mutates: true,
            destructive: false,
          });
    }
    for (const routeTableId of intent.routing.associations)
      add({
        phase: 'routing',
        kind: 'tgw-associate',
        description: `Associate ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'associate-transit-gateway-route-table',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          '__TGW_TRANSPORT_ATTACHMENT__',
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const routeTableId of intent.routing.propagations)
      add({
        phase: 'routing',
        kind: 'tgw-propagate',
        description: `Propagate ${routeTableId}`,
        command: 'aws',
        args: [
          'ec2',
          'enable-transit-gateway-route-table-propagation',
          '--transit-gateway-route-table-id',
          routeTableId,
          '--transit-gateway-attachment-id',
          '__TGW_TRANSPORT_ATTACHMENT__',
          ...base,
        ],
        resourceId: routeTableId,
        mutates: true,
        destructive: true,
      });
    for (const destination of intent.routing.destinationCidrs) {
      if (intent.routing.profile !== 'tgw-connect' && intent.routing.transitGatewayRouteTableId)
        add({
          phase: 'routing',
          kind: 'tgw-route-create',
          description: `Create TGW route ${destination}`,
          command: 'aws',
          args: [
            'ec2',
            'create-transit-gateway-route',
            '--transit-gateway-route-table-id',
            intent.routing.transitGatewayRouteTableId,
            '--destination-cidr-block',
            destination,
            '--transit-gateway-attachment-id',
            '__TGW_TRANSPORT_ATTACHMENT__',
            ...base,
          ],
          resourceId: intent.routing.transitGatewayRouteTableId,
          mutates: true,
          destructive: true,
        });
    }
    for (const route of intent.routes)
      add({
        phase: 'routing',
        kind: 'route-replace',
        description: `Route ${route.destinationCidr} to the CE SLI ENI`,
        command: 'aws',
        args: [
          'ec2',
          'replace-route',
          '--route-table-id',
          route.routeTableId,
          '--destination-cidr-block',
          route.destinationCidr,
          '--network-interface-id',
          `__ENI_${routeNode(intent, route)}_1__`,
          ...base,
        ],
        resourceId: route.routeTableId,
        mutates: true,
        destructive: true,
      });
  }
  if (intent.routing.profile === 'tgw-connect') {
    const peers =
      intent.routing.connectPeers ??
      (intent.routing.insideCidrs ?? []).map((insideCidr, index) => ({
        node: index + 1,
        insideCidr,
        transportInterfaceIndex: 0,
        transitGatewayAddress: undefined,
      }));
    if (intent.vpc.mode === 'greenfield') {
      const transportCidrs = observedConnectCidrs(intent, observation);
      const sliIndex = intent.interfaces.find((item) => item.role === 'sli')?.index;
      if (sliIndex === undefined) throw new Error('TGW Connect requires an explicit SLI payload interface');
      const transportRoles = new Set(peers.map((peer) => peer.transportInterfaceIndex));
      const routingRoles = [...new Set([...transportRoles, sliIndex])].sort();
      for (const role of routingRoles) {
        const interfaceRole = intent.interfaces.find((item) => item.index === role)?.role;
        const reuseSlo = interfaceRole === 'slo' && intent.egress.mode === 'elastic-ip';
        const table = reuseSlo ? '__SLO_ROUTE_TABLE__' : `__GRE_ROUTE_TABLE_${role}__`;
        const resourceId = `aws://${intent.region}/route-table/${intent.deploymentName}-${interfaceRole ?? role}`;
        if (!reuseSlo) {
          add({
            phase: 'routing',
            kind: 'route-table-create',
            description: `Create interface ${role} GRE transport route table`,
            command: 'aws',
            args: [
              'ec2',
              'create-route-table',
              '--vpc-id',
              '__VPC_ID__',
              '--tag-specifications',
              tagSpec(intent, 'route-table'),
              ...base,
            ],
            resourceId,
            mutates: true,
            destructive: false,
            capture: { placeholder: table, path: 'RouteTable.RouteTableId' },
          });
          for (let node = 1; node <= intent.topology.nodeCount; node++)
            add({
              phase: 'routing',
              kind: 'route-table-associate',
              description: `Associate node ${node} interface ${role} subnet with GRE transport routing`,
              command: 'aws',
              args: [
                'ec2',
                'associate-route-table',
                '--route-table-id',
                table,
                '--subnet-id',
                `__SUBNET_${node}_${role}__`,
                ...base,
              ],
              resourceId,
              node,
              mutates: true,
              destructive: false,
              capture: { placeholder: `__GRE_ROUTE_ASSOCIATION_${node}_${role}__`, path: 'AssociationId' },
            });
        }
        if (role === sliIndex)
          for (const destination of intent.routing.destinationCidrs)
            add({
              phase: 'routing',
              kind: 'route-create',
              description: `Route remote payload network ${destination} from the SLI subnet through the TGW`,
              command: 'aws',
              args: [
                'ec2',
                'create-route',
                '--route-table-id',
                table,
                '--destination-cidr-block',
                destination,
                '--transit-gateway-id',
                intent.routing.transitGatewayId ?? '',
                ...base,
              ],
              resourceId,
              mutates: true,
              destructive: false,
            });
        for (const destination of transportRoles.has(role) ? transportCidrs : [])
          add({
            phase: 'routing',
            kind: 'route-create',
            description: `Route interface ${role} GRE transport ${destination} to the Transit Gateway`,
            command: 'aws',
            args: [
              'ec2',
              'create-route',
              '--route-table-id',
              table,
              '--destination-cidr-block',
              destination,
              '--transit-gateway-id',
              intent.routing.transitGatewayId ?? '',
              ...base,
            ],
            resourceId,
            mutates: true,
            destructive: false,
          });
      }
    }
    const roleCounts = new Map();
    const peerGroups = peers.map((peer) => {
      const position = roleCounts.get(peer.transportInterfaceIndex) ?? 0;
      roleCounts.set(peer.transportInterfaceIndex, position + 1);
      return `${peer.transportInterfaceIndex}_${Math.floor(position / 4) + 1}`;
    });
    for (const group of [...new Set(peerGroups)].sort()) {
      add({
        phase: 'routing',
        kind: 'tgw-connect-attachment-create',
        description: `Create TGW Connect attachment ${group} with at most four peers`,
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-connect',
          '--transport-transit-gateway-attachment-id',
          intent.routing.transportAttachmentId ?? '__TGW_TRANSPORT_ATTACHMENT__',
          '--options',
          'Protocol=gre',
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-attachment'),
          ...base,
        ],
        resourceId: `aws://${intent.region}/tgw-connect/${intent.deploymentName}-${group}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: `__TGW_CONNECT_ATTACHMENT_${group}__`,
          path: 'TransitGatewayConnect.TransitGatewayAttachmentId',
        },
      });
      add({
        phase: 'routing',
        kind: 'tgw-attachment-gate',
        description: `Wait for scoped Connect attachment ${group} availability`,
        resourceId: `__TGW_CONNECT_ATTACHMENT_${group}__`,
        mutates: false,
        destructive: false,
      });
      for (const [tables, operation, kind] of [
        [intent.routing.associations, 'associate-transit-gateway-route-table', 'tgw-associate'],
        [intent.routing.propagations, 'enable-transit-gateway-route-table-propagation', 'tgw-propagate'],
      ])
        for (const table of tables)
          add({
            phase: 'routing',
            kind,
            description: `${operation} for Connect attachment ${group}`,
            command: 'aws',
            args: [
              'ec2',
              operation,
              '--transit-gateway-route-table-id',
              table,
              '--transit-gateway-attachment-id',
              `__TGW_CONNECT_ATTACHMENT_${group}__`,
              ...base,
            ],
            resourceId: table,
            mutates: true,
            destructive: true,
          });
    }
    for (const [index, peer] of peers.entries())
      add({
        phase: 'routing',
        kind: 'tgw-connect-peer-create',
        description: `Create node ${peer.node} Connect peer with two AWS-managed BGP sessions`,
        command: 'aws',
        args: [
          'ec2',
          'create-transit-gateway-connect-peer',
          '--transit-gateway-attachment-id',
          `__TGW_CONNECT_ATTACHMENT_${peerGroups[index]}__`,
          '--peer-address',
          `__NODE_${peer.node}_${intent.interfaces.find((item) => item.index === peer.transportInterfaceIndex)?.role.toUpperCase()}_IP__`,
          ...(peer.transitGatewayAddress ? ['--transit-gateway-address', peer.transitGatewayAddress] : []),
          '--bgp-options',
          `PeerAsn=${intent.routing.customerAsn}`,
          '--inside-cidr-blocks',
          peer.insideCidr,
          '--tag-specifications',
          tagSpec(intent, 'transit-gateway-connect-peer', peer.node),
          ...base,
        ],
        node: peer.node,
        resourceId: `aws://${intent.region}/tgw-connect-peer/${intent.deploymentName}-${peer.node}-${index + 1}`,
        mutates: true,
        destructive: false,
        capture: {
          placeholder: `__TGW_CONNECT_PEER_${index + 1}__`,
          path: 'TransitGatewayConnectPeer.TransitGatewayConnectPeerId',
        },
      });
    add({
      phase: 'routing',
      kind: 'f5-routing-configure',
      description:
        'Configure site-bound XC GRE connectors and both BGP endpoints from observed interface and AWS peer identities',
      mutates: true,
      destructive: false,
    });
    add({
      phase: 'verify',
      kind: 'bgp-gate',
      description: `Verify ${(intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0) * 2} AWS-managed BGP sessions across ${intent.routing.connectPeers?.length ?? intent.routing.insideCidrs?.length ?? 0} Connect peers`,
      mutates: false,
      destructive: false,
    });
  }
  if (intent.routing.profile.startsWith('tgw-'))
    add({
      phase: 'verify',
      kind: 'tgw-route-gate',
      description: 'Verify TGW associations, propagations, and routes',
      mutates: false,
      destructive: false,
    });
  if (nlbIngress)
    add({
      phase: 'verify',
      kind: 'nlb-gate',
      description: 'Verify NLB targets and health after routing convergence',
      mutates: false,
      destructive: false,
    });
  if (nlbIngress)
    add({
      phase: 'verify',
      kind: 'traffic-gate',
      description: 'Verify end-to-end traffic',
      mutates: false,
      destructive: false,
    });
  return actions;
}
function compileAwsCePlan(input, observation, restorationState = []) {
  const intent = normalizeIntent({
    ...input,
    awsProfile: input.awsProfile ?? observation.identity.awsProfile ?? 'default',
    platformContext: input.platformContext ?? observation.f5Capabilities.platformContext,
  });
  if (
    intent.awsProfile !== (observation.identity.awsProfile ?? 'default') ||
    intent.platformContext !== observation.f5Capabilities.platformContext
  )
    fail('execution contexts differ from discovery');
  const bootstrapKeyPair = selectAwsBootstrapKeyPair(intent, observation);
  validateResearch(observation);
  if (canonicalSha256(observation.f5Capabilities) !== observation.f5CapabilitiesSha256)
    fail('F5 capability digest is inconsistent');
  if (observation.identity.accountId !== intent.accountId || observation.identity.partition !== intent.partition)
    fail('observation identity does not match intent');
  if (
    observation.ownershipPlanSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)) ||
    JSON.stringify(observation.ownershipPlanSha256s) !==
      JSON.stringify([...new Set(observation.ownershipPlanSha256s)].sort())
  )
    fail('observation ownership plan digests are invalid or non-canonical');
  for (const resource of observation.resources.filter((item) => item.owned)) {
    const ownerPlanSha256 = resource.tags['xcsh-plan-sha256'] ?? '';
    if (
      resource.tags['xcsh-managed-by'] !== 'aws-ce' ||
      resource.tags['xcsh-execution-engine'] !== intent.engine ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName ||
      !observation.ownershipPlanSha256s.includes(ownerPlanSha256)
    )
      fail(`owned resource ${resource.id} does not match the deployment and approved prior plan tags`);
  }
  if (!observation.agreement.active)
    fail(
      `AWS Marketplace agreement is not active. Open https://aws.amazon.com/marketplace/pp/${AWS_CE_MARKETPLACE_PRODUCT_ID}, subscribe without automation, then rerun aws_compute_discover and replan`,
    );
  const region = observation.regions.find((item) => item.name === intent.region);
  if (!region?.eligible || !region.ami)
    fail(`region ${intent.region} is not eligible: ${region?.reasons.join(', ') ?? 'not observed'}`);
  if (
    region.ami.id !== intent.image.amiId ||
    region.ami.ssmParameter !== AWS_CE_SSM_PARAMETER ||
    !region.ami.ssmVersion
  )
    fail('intent AMI does not match the exact regional SSM observation');
  const instance = region.instanceTypes.find((item) => item.name === intent.instance.type);
  if (!instance?.supported) fail(`instance type ${intent.instance.type} is not supported in ${intent.region}`);
  if (intent.topology.nodeCount === 3 && instance.availabilityZones.length < 3)
    fail('three-node topology requires three Availability Zones');
  if (
    intent.routing.profile === 'tgw-connect' &&
    (!observation.research.mcnTgwGuide?.documented ||
      !observation.f5Capabilities.awsSmsv2TgwConnect.supported ||
      observation.f5Capabilities.awsSmsv2TgwConnect.schemaVersion !== 'f5xc-smsv2-aws-tgw-telemetry/v2')
  )
    fail('AWS TGW Connect requires the current MCN routing recipe and the authenticated telemetry contract');
  if (
    !observation.f5Capabilities.supportedProviders.includes('aws') ||
    !observation.f5Capabilities.providerNetworkingProfiles.aws?.includes(intent.routing.profile)
  )
    fail(`F5 platform does not advertise ${intent.routing.profile} for AWS SMSv2`);
  if (
    intent.ingress?.mode === 'nlb' &&
    !observation.f5Capabilities.providerNetworkingProfiles.aws?.includes('nlb-ingress')
  )
    fail('F5 platform does not advertise NLB ingress for AWS SMSv2');
  if (
    intent.ingress?.mode === 'nlb' &&
    !region.networkQuotas.some((quota) => /network load balancers.*region/i.test(quota.quotaName) && quota.value >= 1)
  )
    fail('Fresh regional NLB quota evidence is unavailable');
  if (intent.routing.profile.startsWith('tgw-') && !region.transitGatewaySupported)
    fail('Transit Gateway is unavailable in the selected region');
  const observationById = new Map(observation.resources.map((resource) => [resource.id, resource]));
  const brownfieldIds = [
    ...new Set([
      ...intent.brownfield.resourceIds,
      ...intent.brownfield.routeTableIds,
      ...intent.brownfield.transitGatewayRouteTableIds,
    ]),
  ].sort();
  for (const id of brownfieldIds)
    if (!observationById.get(id)?.exists) fail(`brownfield resource was not observed: ${id}`);
  const restorationById = new Map(restorationState.map((item) => [item.id, item.before]));
  const actions = compileActions(intent, observation, restorationById);
  if (actions.some((action) => action.kind === 'registration-gate'))
    actions.splice(
      actions.findIndex((action) => action.kind === 'registration-gate'),
      0,
      {
        id: 'f5-registration-approval',
        phase: 'registration',
        kind: 'registration-approve',
        description: 'Approve registrations only after exact site, node and cloud instance correlation',
        mutates: true,
        destructive: false,
      },
    );
  for (const action of actions) {
    if (intent.routing.transportAttachmentId && action.args)
      action.args = action.args.map((arg) =>
        arg.replaceAll('__TGW_TRANSPORT_ATTACHMENT__', intent.routing.transportAttachmentId ?? ''),
      );
    prepareRecoverableAction(action);
  }
  const ownershipInventory = [
    ...brownfieldIds.map((resourceId) => ({ resourceId, owned: false, action: 'modify-approved' })),
    ...actions.flatMap((action) =>
      action.resourceId?.startsWith('aws://') ? [{ resourceId: action.resourceId, owned: true, action: 'create' }] : [],
    ),
    ...observation.resources
      .filter((resource) => resource.owned)
      .map((resource) => ({
        resourceId: resource.id,
        owned: true,
        action:
          intent.operation === 'teardown' &&
          !(intent.engine === 'native' && isAwsTerminatedOwnedInstance(resource, intent.accountId))
            ? 'delete'
            : 'reference',
      })),
  ].sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  const warnings =
    intent.topology.nodeCount === 1 && ['resize', 'replace-node', 'update-network'].includes(intent.operation)
      ? ['Single-node lifecycle work is disruptive and requires a maintenance window.']
      : [];
  if (intent.operation === 'deploy' && !awsCeNlbIngress(intent))
    warnings.push('No ingress probe is configured; traffic qualification remains unknown.');
  const billableResources = [
    { type: 'ec2-instance', count: intent.topology.nodeCount },
    { type: 'gp3-volume', count: intent.topology.nodeCount },
    ...(intent.egress.mode === 'elastic-ip' ? [{ type: 'elastic-ip', count: intent.topology.nodeCount }] : []),
    ...(awsCeNlbIngress(intent) ? [{ type: 'network-load-balancer', count: 1 }] : []),
    ...(intent.routing.profile.startsWith('tgw-')
      ? [
          {
            type: 'transit-gateway-attachment',
            count: 1 + connectAttachmentCount(intent),
          },
        ]
      : []),
  ];
  const draft = {
    execution: {
      engine: intent.engine,
      awsProfile: intent.awsProfile ?? 'default',
      ...(intent.engine === 'terraform'
        ? {
            terraform: {
              version: AWS_CE_TERRAFORM_VERSION,
              awsProvider: AWS_CE_TERRAFORM_PROVIDER_VERSION,
              awsProviderLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
              f5Provider: XCSH_PROVIDER_VERSION,
              f5ProviderLockSha256: XCSH_PROVIDER_LOCK_SHA256,
              backendIdentity: `local:${intent.deploymentName}`,
              f5BackendIdentity: `local:${intent.deploymentName}:stage:f5-resources`,
            },
          }
        : {}),
    },
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    intent,
    engine: intent.engine,
    accountId: intent.accountId,
    partition: intent.partition,
    region: intent.region,
    deploymentName: intent.deploymentName,
    siteName: intent.siteName,
    namespace: intent.namespace,
    topology: {
      nodeCount: intent.topology.nodeCount,
      availabilityZones: intent.interfaces[0].subnets.map((item) => item.availabilityZone),
    },
    interfaces: intent.interfaces,
    image: region.ami,
    instance: intent.instance,
    ...(bootstrapKeyPair === undefined ? {} : { bootstrapKeyPair }),
    egress: intent.egress,
    routing: intent.routing,
    securityGroups: intent.securityGroups,
    warnings,
    billableResources,
    actions:
      intent.operation === 'deploy'
        ? [
            ...actions.filter((action) => action.phase === 'network'),
            ...actions.filter((action) => action.phase === 'nodes'),
            ...actions.filter((action) => action.phase === 'registration'),
            ...actions.filter((action) => !['network', 'nodes', 'registration'].includes(action.phase)),
          ]
        : actions,
    rollback: {
      resources: (restorationState.length
        ? restorationState.filter((resource) => brownfieldIds.includes(resource.id))
        : observation.resources
            .filter((resource) => brownfieldIds.includes(resource.id))
            .map((resource) => ({ id: resource.id, before: resource.state }))
      ).sort((left, right) => left.id.localeCompare(right.id)),
    },
    ownershipInventory,
    ownershipTags: {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': intent.engine,
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': '__PLAN_SHA256__',
      'ves-io-site-name': intent.siteName,
    },
    observationScope: { kind: 'execution-region-v1', region: intent.region },
    observationFingerprint: fingerprintObservation(
      observation,
      [...brownfieldIds, ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id)],
      intent.region,
    ),
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-${planSha256.slice(0, 24)}`, planSha256 };
}

export {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
  assertAwsDeploymentCompilerOperation,
  awsCeInterfacePrivateAddresses,
  awsCeNlbIngress,
  awsCeStaticIp,
  compileAwsCePlan,
  executeRecoverableCreate,
  hasCreateRecovery,
  interfaceSecurityGroups,
  loadXcshProviderLock,
  nlbSettings,
  observedConnectCidrs,
  siteBindings,
  siteForNode,
  siteTopology,
  staticAzRoutes,
  validateAwsCeAddressing,
  XCSH_PROVIDER_VERSION,
};
