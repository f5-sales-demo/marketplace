import { isIP } from 'node:net';
import { initialSoftwareSettings } from '../../../platform/src/ce/initial-versions';
import { canonicalSha256, fingerprintObservation } from './canonical';
import { prepareRecoverableAction } from './create-recovery';
import { siteForNode, siteTopology } from './topology';
import { observedConnectCidrs } from './transport-routes';
import type { AwsCeAction, AwsCeIntent, AwsCeObservation, AwsCePlan, AwsCePlanDraft } from './types';
import {
  AWS_CE_DEFAULT_INTERFACE_MTU,
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SCHEMA_VERSION,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
  AWS_CE_TGW_GUIDE_URL,
} from './types';

const ACCOUNT = /^\d{12}$/;
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const CIDR = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+)\/\d{1,3}$/;
const AMI = /^ami-[0-9a-f]{8,17}$/;
const DEVICE_NAME = /^\/dev\/[a-zA-Z0-9._-]{1,32}$/;
const AWS_ID =
  /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;

function fail(message: string): never {
  throw new Error(`AWS CE plan validation failed: ${message}`);
}

function regionMatchesPartition(region: string, partition: AwsCeIntent['partition']): boolean {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}

function safeString(value: string, label: string): string {
  const normalized = value.trim();
  if (
    !normalized ||
    Array.from(normalized).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    fail(`${label} is empty or contains control characters`);
  return normalized;
}

function name(value: string, label: string): string {
  const normalized = safeString(value, label);
  if (!SAFE_NAME.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}

function cidr(value: string, label: string): string {
  const normalized = safeString(value, label);
  if (!CIDR.test(normalized)) fail(`${label} is not a CIDR`);
  return normalized;
}

function asn(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 4_294_967_294)
    fail(`${label} must be a valid ASN`);
  return value;
}

function tgwInsideNetwork(value: string): number {
  const match = /^169\.254\.(\d{1,3})\.(\d{1,3})\/29$/.exec(value);
  if (!match) fail('TGW Connect inside CIDR must be a 169.254.0.0/16 /29');
  const third = Number(match[1]);
  const fourth = Number(match[2]);
  if (third > 255 || fourth > 255 || fourth % 8 !== 0)
    fail('TGW Connect inside CIDR must be a valid /29 network boundary');
  const network = third * 256 + fourth;
  // AWS reserves .0.0/29 through .5.0/29 and the EC2 metadata /29.
  if (new Set([0, 256, 512, 768, 1024, 1280, 43_512]).has(network)) fail('TGW Connect inside CIDR is reserved by AWS');
  return network;
}

function connectAttachmentCount(intent: AwsCeIntent): number {
  if (intent.routing.profile !== 'tgw-connect') return 0;
  const roles =
    intent.routing.connectPeers?.map((peer) => peer.transportInterfaceIndex) ??
    (intent.routing.insideCidrs ?? []).map(() => 1);
  return [0, 1].reduce((count, role) => count + Math.ceil(roles.filter((value) => value === role).length / 4), 0);
}

export function awsCeNlbIngress(
  intent: AwsCeIntent,
): { port: number; scheme: 'internal' | 'internet-facing' } | undefined {
  if (intent.ingress?.mode === 'nlb') return { port: intent.ingress.port, scheme: intent.ingress.scheme };
  return intent.routing.profile === 'nlb-ingress' ? { port: 443, scheme: 'internet-facing' } : undefined;
}

function normalizeIntent(input: AwsCeIntent): AwsCeIntent {
  if (input.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (!ACCOUNT.test(input.accountId)) fail('accountId must be a 12-digit AWS account ID');
  if (!REGION.test(input.region)) fail('region is invalid');
  if (!['aws', 'aws-us-gov', 'aws-cn'].includes(input.partition)) fail('partition is invalid');
  if (!regionMatchesPartition(input.region, input.partition)) fail('region does not match partition');
  const engine = input.engine ?? 'native';
  if (!['native', 'terraform'].includes(engine)) fail('execution engine must be native or terraform');
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
    if (!Number.isInteger(mtu) || mtu < 1500 || mtu > 9000) fail('interface MTU must be an integer from 1500 to 9000');
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
      mtu,
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
  // Preserve the request in the caller's input artifact, but make the
  // effective launch size explicit in the normalized, hashed plan. This keeps
  // a boot-only Marketplace default from becoming an upgrade-time outage.
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
        transportInterfaceIndex: 1,
      }));
    if (!peers?.length || peers.length > 12) fail('TGW Connect requires explicit peers or one inside CIDR per node');
    const counts = new Map<number, number>();
    const endpoints = new Set<string>();
    for (const peer of peers) {
      if (
        !Number.isInteger(peer.node) ||
        peer.node < 1 ||
        peer.node > input.topology.nodeCount ||
        ![0, 1].includes(peer.transportInterfaceIndex)
      )
        fail('Connect peer must select a real node and SLO or SLI GRE transport');
      counts.set(peer.node, (counts.get(peer.node) ?? 0) + 1);
      if ('transitGatewayAddress' in peer && peer.transitGatewayAddress !== undefined) {
        if (
          typeof peer.transitGatewayAddress !== 'string' ||
          isIP(peer.transitGatewayAddress) !== 4 ||
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
    const ingressKeys = Object.keys(input.ingress).sort().join(',');
    if (
      (input.ingress.mode === 'none' && ingressKeys !== 'mode') ||
      (input.ingress.mode === 'nlb' && ingressKeys !== 'listener,mode,port,probe,scheme')
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
    if (input.ingress.mode === 'nlb' && sites.some((site) => site.nodeIndexes.length !== 1))
      fail('NLB ingress requires three independent one-node sites');
    if (input.ingress.mode === 'nlb' && !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,26}[a-zA-Z0-9])?$/.test(deploymentName))
      fail('NLB ingress deploymentName must form a valid name of at most 28 characters');
    if (input.ingress.mode === 'nlb') {
      const listener = input.ingress.listener;
      const probe = input.ingress.probe;
      const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
      if (
        !listener ||
        Object.keys(listener).sort().join(',') !== 'domain,name,namespace,originPool' ||
        Object.keys(listener.originPool ?? {})
          .sort()
          .join(',') !== 'name,namespace' ||
        name(listener.name, 'ingress.listener.name') !== listener.name ||
        name(listener.namespace, 'ingress.listener.namespace') !== listener.namespace ||
        name(listener.originPool.name, 'ingress.listener.originPool.name') !== listener.originPool.name ||
        name(listener.originPool.namespace, 'ingress.listener.originPool.namespace') !==
          listener.originPool.namespace ||
        listener.originPool.namespace !== listener.namespace ||
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
    }
  }
  for (const routeTableId of [...input.routing.associations, ...input.routing.propagations])
    if (!input.brownfield.transitGatewayRouteTableIds.includes(routeTableId))
      fail('TGW association or propagation is outside the explicit route-table allowlist');
  return {
    ...input,
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
      destinationCidrs,
      associations: [...new Set(input.routing.associations)].sort(),
      propagations: [...new Set(input.routing.propagations)].sort(),
    },
    ingress: input.ingress === undefined ? undefined : structuredClone(input.ingress),
    securityGroups: [...input.securityGroups]
      .map((group) => ({
        ...group,
        name: name(group.name, 'securityGroup.name'),
        ingress: group.ingress.map((rule) => normalizeSecurityGroupRule(rule)),
        egress: group.egress.map((rule) => normalizeSecurityGroupRule(rule)),
      }))
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

function normalizeSecurityGroupRule(
  rule: AwsCeIntent['securityGroups'][number]['ingress'][number],
): AwsCeIntent['securityGroups'][number]['ingress'][number] {
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

function validateResearch(observation: AwsCeObservation): void {
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

function tags(intent: AwsCeIntent, node?: number, interfaceIndex?: number): string {
  const nodeTag = node === undefined ? '' : `,{Key=xcsh-node-index,Value=${node}}`;
  const interfaceTag = interfaceIndex === undefined ? '' : `,{Key=xcsh-interface-index,Value=${interfaceIndex}}`;
  return `ResourceType=instance,Tags=[{Key=xcsh-managed-by,Value=aws-ce},{Key=xcsh-execution-engine,Value=${intent.engine}},{Key=xcsh-deployment-id,Value=${intent.deploymentName}},{Key=xcsh-plan-sha256,Value=__PLAN_SHA256__},{Key=ves-io-site-name,Value=${node === undefined ? intent.siteName : siteForNode(intent, node).name}}${nodeTag}${interfaceTag}]`;
}

function tagSpec(intent: AwsCeIntent, resourceType: string, node?: number, interfaceIndex?: number): string {
  return tags(intent, node, interfaceIndex).replace('ResourceType=instance', `ResourceType=${resourceType}`);
}

function nodeIndex(resource: AwsCeObservation['resources'][number]): number | undefined {
  const value = Number(resource.tags['xcsh-node-index']);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function orderedOwnedInstances(observation: AwsCeObservation, nodeCount: number): AwsCeObservation['resources'] {
  const byNode = new Map<number, AwsCeObservation['resources'][number]>();
  for (const resource of observation.resources.filter((item) => item.owned && item.id.startsWith('i-'))) {
    const node = nodeIndex(resource);
    if (!node || node > nodeCount || byNode.has(node)) fail('owned instances require unique xcsh-node-index tags');
    byNode.set(node, resource);
  }
  return Array.from({ length: nodeCount }, (_, index) => byNode.get(index + 1)).filter(
    (resource): resource is AwsCeObservation['resources'][number] => resource !== undefined,
  );
}

function ownedNodeEnis(
  observation: AwsCeObservation,
  node: number,
  interfaceCount: number,
): AwsCeObservation['resources'] {
  const byInterface = new Map<number, AwsCeObservation['resources'][number]>();
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
    (resource): resource is AwsCeObservation['resources'][number] => resource !== undefined,
  );
}

function resourceDeleteArgs(resource: AwsCeObservation['resources'][number], base: string[]): string[] {
  const id = resource.id;
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

function deletionPriority(resource: AwsCeObservation['resources'][number]): number {
  const { id } = resource;
  if (/listener\//.test(id) || id.startsWith('tgw-connect-peer-')) return 10;
  if (/loadbalancer\//.test(id)) return 20;
  if (/targetgroup\//.test(id)) return 30;
  if (id.startsWith('tgw-attach-')) {
    const attachments = Array.isArray(resource.state.TransitGatewayAttachments)
      ? (resource.state.TransitGatewayAttachments as Array<Record<string, unknown>>)
      : [];
    return attachments[0]?.ResourceType === 'connect' ? 30 : 35;
  }
  if (id.startsWith('i-')) return 40;
  if (id.startsWith('eipassoc-')) return 50;
  if (id.startsWith('eipalloc-')) return 60;
  if (id.startsWith('eni-')) return 70;
  if (id.startsWith('sg-')) return 80;
  if (id.startsWith('rtb-')) return 85;
  if (id.startsWith('subnet-')) return 90;
  if (id.startsWith('igw-')) return 95;
  if (id.startsWith('vpc-')) return 100;
  return 75;
}

function originalRouteArgs(
  state: Record<string, unknown>,
  routeTableId: string,
  destinationCidr: string,
  base: string[],
): string[] {
  const tables = Array.isArray(state.RouteTables) ? (state.RouteTables as Array<Record<string, unknown>>) : [];
  const routes = Array.isArray(tables[0]?.Routes) ? (tables[0].Routes as Array<Record<string, unknown>>) : [];
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
  ] as const;
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

function compileActions(
  intent: AwsCeIntent,
  observation: AwsCeObservation,
  restorationById: Map<string, Record<string, unknown>>,
): AwsCeAction[] {
  let sequence = 0;
  const actions: AwsCeAction[] = [];
  const add = (action: Omit<AwsCeAction, 'id'>) =>
    actions.push({ ...action, id: `aws-ce-action-${String(++sequence).padStart(4, '0')}` });
  // Captured non-interactive subprocess output does not invoke a pager. Avoid
  // the AWS CLI v2-only --no-cli-pager flag so exact argv plans also run on
  // the distro AWS CLI supported by the plugin installer.
  const base = ['--region', intent.region];
  const rootDeviceName = observation.regions.find((item) => item.name === intent.region)?.ami?.rootDeviceName ?? '';
  if (!DEVICE_NAME.test(rootDeviceName)) fail('observed AMI root device name is invalid');
  if (intent.operation === 'teardown') {
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
      const associations = Array.isArray(state.Associations)
        ? (state.Associations as Array<Record<string, unknown>>)
        : [];
      const propagations = Array.isArray(state.Propagations)
        ? (state.Propagations as Array<Record<string, unknown>>)
        : [];
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
      .filter((item) => item.owned)
      .sort((a, b) => deletionPriority(a) - deletionPriority(b) || a.id.localeCompare(b.id))) {
      if (resource.id.startsWith('rtb-')) {
        const tables = resource.state.RouteTables as
          | Array<{ Associations?: Array<{ Main?: boolean; RouteTableAssociationId?: string }> }>
          | undefined;
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
        const gateways = resource.state.InternetGateways as
          | Array<{ Attachments?: Array<{ VpcId?: string }> }>
          | undefined;
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
  const ownedInstances = orderedOwnedInstances(observation, intent.topology.nodeCount);
  if (intent.operation === 'start' || intent.operation === 'stop') {
    if (ownedInstances.length !== intent.topology.nodeCount)
      fail(`${intent.operation} requires exactly ${intent.topology.nodeCount} observed owned instance(s)`);
    for (const instance of ownedInstances)
      add({
        phase: 'nodes',
        kind: intent.operation === 'start' ? 'instance-start' : 'instance-stop',
        description: `${intent.operation} ${instance.id}`,
        command: 'aws',
        args: [
          'ec2',
          intent.operation === 'start' ? 'start-instances' : 'stop-instances',
          '--instance-ids',
          instance.id,
          ...base,
        ],
        resourceId: instance.id,
        mutates: true,
        destructive: intent.operation === 'stop',
      });
    return actions;
  }
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
          ownedEnis[0][sliIndex].id,
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
    for (const direction of ['ingress', 'egress'] as const)
      for (const [ruleIndex, rule] of group[direction].entries()) {
        const permission = {
          IpProtocol: rule.protocol,
          ...(rule.fromPort === undefined ? {} : { FromPort: rule.fromPort }),
          ...(rule.toPort === undefined ? {} : { ToPort: rule.toPort }),
          IpRanges: [...new Set(rule.cidrs)].sort().map((CidrIp) => ({ CidrIp })),
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
  const securityGroupIds = intent.securityGroups.map((group) => `__SG_${group.name}__`);
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces)
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
          ...(securityGroupIds.length ? ['--groups', ...securityGroupIds] : []),
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
  if (nlbIngress) {
    const subnetIds = intent.interfaces[0].subnets.map(
      (subnet, index) => subnet.subnetId ?? `__SUBNET_${index + 1}_0__`,
    );
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
        '--subnets',
        ...subnetIds,
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
        intent.vpc.vpcId ?? '__VPC_ID__',
        '--health-check-protocol',
        'TCP',
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
        'Id=__NODE_1_SLI_IP__',
        'Id=__NODE_2_SLI_IP__',
        'Id=__NODE_3_SLI_IP__',
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
    add({
      phase: 'verify',
      kind: 'nlb-gate',
      description: 'Verify NLB targets and health',
      mutates: false,
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
      if (intent.routing.profile === 'tgw-connect')
        add({
          phase: 'routing',
          kind: 'route-create',
          description: `Route remote payload network ${destination} from the SLO subnet through the TGW`,
          command: 'aws',
          args: [
            'ec2',
            'create-route',
            '--route-table-id',
            '__SLO_ROUTE_TABLE__',
            '--destination-cidr-block',
            destination,
            '--transit-gateway-id',
            intent.routing.transitGatewayId ?? '',
            ...base,
          ],
          resourceId: `aws://${intent.region}/route-table/${intent.deploymentName}-slo`,
          mutates: true,
          destructive: false,
        });
      else if (intent.routing.transitGatewayRouteTableId)
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
          '__ENI_1_1__',
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
        transportInterfaceIndex: 1,
        transitGatewayAddress: undefined,
      }));
    if (intent.vpc.mode === 'greenfield') {
      const transportCidrs = observedConnectCidrs(intent, observation);
      for (const role of [...new Set(peers.map((peer) => peer.transportInterfaceIndex))].sort()) {
        const reuseSlo = role === 0 && intent.egress.mode === 'elastic-ip';
        const table = reuseSlo ? '__SLO_ROUTE_TABLE__' : `__GRE_ROUTE_TABLE_${role}__`;
        const resourceId = `aws://${intent.region}/route-table/${intent.deploymentName}-${role === 0 ? 'slo' : 'sli'}`;
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
        for (const destination of transportCidrs)
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
    const roleCounts = new Map<number, number>();
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
      ] as const)
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
          `__NODE_${peer.node}_${peer.transportInterfaceIndex === 0 ? 'SLO' : 'SLI'}_IP__`,
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
  add({
    phase: 'verify',
    kind: 'traffic-gate',
    description: 'Verify end-to-end traffic',
    mutates: false,
    destructive: false,
  });
  return actions;
}

export function compileAwsCePlan(
  input: AwsCeIntent,
  observation: AwsCeObservation,
  restorationState: Array<{ id: string; before: Record<string, unknown> }> = [],
): AwsCePlan {
  const intent = normalizeIntent({
    ...input,
    awsProfile: input.awsProfile ?? observation.identity.awsProfile,
    platformContext: input.platformContext ?? observation.f5Capabilities.platformContext,
  });
  if (
    intent.awsProfile !== observation.identity.awsProfile ||
    intent.platformContext !== observation.f5Capabilities.platformContext
  )
    fail('execution contexts differ from discovery');
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
    ...brownfieldIds.map((resourceId) => ({ resourceId, owned: false as const, action: 'modify-approved' as const })),
    ...actions.flatMap((action) =>
      action.resourceId?.startsWith('aws://')
        ? [{ resourceId: action.resourceId, owned: true as const, action: 'create' as const }]
        : [],
    ),
    ...observation.resources
      .filter((resource) => resource.owned)
      .map((resource) => ({
        resourceId: resource.id,
        owned: true as const,
        action: intent.operation === 'teardown' ? ('delete' as const) : ('reference' as const),
      })),
  ].sort((left, right) => left.resourceId.localeCompare(right.resourceId));
  const warnings =
    intent.topology.nodeCount === 1 && ['resize', 'replace-node', 'update-network'].includes(intent.operation)
      ? ['Single-node lifecycle work is disruptive and requires a maintenance window.']
      : [];
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
  const draft: AwsCePlanDraft = {
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
    observationFingerprint: fingerprintObservation(observation, [
      ...brownfieldIds,
      ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
    ]),
    f5CapabilitiesSha256: observation.f5CapabilitiesSha256,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
