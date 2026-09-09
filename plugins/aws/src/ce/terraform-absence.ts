import type { AwsExecApi } from '../aws/exec';
import { AwsNotFoundError, detectAwsError } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed absence evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error('Missing absence collection');
  return value.map(object);
};
// Identity filters avoid treating an arbitrary AWS CLI error as a missing resource.
const types: Record<string, [string, string, string, string, string]> = {
  aws_vpc: ['describe-vpcs', 'Vpcs', 'VpcId', 'vpc-id', 'vpc'],
  aws_subnet: ['describe-subnets', 'Subnets', 'SubnetId', 'subnet-id', 'subnet'],
  aws_instance: ['describe-instances', 'Reservations', 'InstanceId', 'instance-id', 'i'],
  aws_network_interface: [
    'describe-network-interfaces',
    'NetworkInterfaces',
    'NetworkInterfaceId',
    'network-interface-id',
    'eni',
  ],
  aws_security_group: ['describe-security-groups', 'SecurityGroups', 'GroupId', 'group-id', 'sg'],
  aws_route_table: ['describe-route-tables', 'RouteTables', 'RouteTableId', 'route-table-id', 'rtb'],
  aws_internet_gateway: [
    'describe-internet-gateways',
    'InternetGateways',
    'InternetGatewayId',
    'internet-gateway-id',
    'igw',
  ],
  aws_eip: ['describe-addresses', 'Addresses', 'AllocationId', 'allocation-id', 'eipalloc'],
  aws_ebs_volume: ['describe-volumes', 'Volumes', 'VolumeId', 'volume-id', 'vol'],
  aws_ec2_transit_gateway_vpc_attachment: [
    'describe-transit-gateway-vpc-attachments',
    'TransitGatewayVpcAttachments',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect: [
    'describe-transit-gateway-connects',
    'TransitGatewayConnects',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_connect_peer: [
    'describe-transit-gateway-connect-peers',
    'TransitGatewayConnectPeers',
    'TransitGatewayConnectPeerId',
    'transit-gateway-connect-peer-id',
    'tgw-connect-peer',
  ],
  aws_ec2_transit_gateway_attachment: [
    'describe-transit-gateway-attachments',
    'TransitGatewayAttachments',
    'TransitGatewayAttachmentId',
    'transit-gateway-attachment-id',
    'tgw-attach',
  ],
  aws_ec2_transit_gateway_route_table: [
    'describe-transit-gateway-route-tables',
    'TransitGatewayRouteTables',
    'TransitGatewayRouteTableId',
    'transit-gateway-route-table-id',
    'tgw-rtb',
  ],
};
const elbTypes: Record<string, [string, string, string, RegExp]> = {
  aws_lb: [
    'describe-load-balancers',
    'LoadBalancers',
    'LoadBalancerArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:loadbalancer\/net\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_target_group: [
    'describe-target-groups',
    'TargetGroups',
    'TargetGroupArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:targetgroup\/[A-Za-z0-9-]+\/[a-f0-9]+$/,
  ],
  aws_lb_listener: [
    'describe-listeners',
    'Listeners',
    'ListenerArns',
    /^arn:[^:]+:elasticloadbalancing:[^:]+:\d{12}:listener\/net\/[A-Za-z0-9-]+\/[a-f0-9]+\/[a-f0-9]+$/,
  ],
};
const validId = (type: string, id: unknown) =>
  typeof id === 'string' &&
  ((Object.hasOwn(types, type) && new RegExp(`^${types[type][4]}-[a-f0-9]{8,21}$`).test(id)) ||
    (Object.hasOwn(elbTypes, type) && elbTypes[type][3].test(id)));
/** Fresh cloud evidence for captured identities AND unexpected deployment-tagged resources.
 * Absence of a route table, subnet, or allocation proves its owned child route/association cannot remain.
 * Externally referenced TGW table edges are checked separately, including table absence.
 */
export async function collectAwsTerraformAbsence(
  source: AwsCePlan,
  input: AwsTerraformRetirementInventory,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  const plan = structuredClone(source),
    inventory = structuredClone(input);
  verifyAwsCePlan(plan);
  signal?.throwIfAborted();
  const { sha256, ...material } = inventory;
  if (
    inventory.schemaVersion !== 1 ||
    inventory.engine !== 'terraform' ||
    plan.engine !== 'terraform' ||
    inventory.accountId !== plan.intent.accountId ||
    inventory.region !== plan.intent.region ||
    inventory.deploymentId !== plan.intent.deploymentName ||
    inventory.sourcePlanSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(inventory.terraformPlanSha256) ||
    canonicalSha256(material) !== sha256 ||
    !Array.isArray(inventory.resources) ||
    !inventory.resources.length ||
    inventory.resources.length > 1000 ||
    !Array.isArray(inventory.tgwEdges) ||
    inventory.tgwEdges.length > 1000
  )
    throw new Error('Invalid AWS retirement inventory binding');
  const ids = new Set<string>();
  for (const resource of inventory.resources) {
    if (!validId(resource.type, resource.id) || ids.has(resource.id))
      throw new Error('Invalid or duplicate retired resource identity');
    ids.add(resource.id);
  }
  const edges = new Set<string>();
  for (const edge of inventory.tgwEdges) {
    const key = `${edge.kind}:${edge.tableId}:${edge.attachmentId}`;
    if (
      !['association', 'propagation'].includes(edge.kind) ||
      !validId('aws_ec2_transit_gateway_route_table', edge.tableId) ||
      !validId('aws_ec2_transit_gateway_attachment', edge.attachmentId) ||
      !ids.has(edge.attachmentId) ||
      edges.has(key)
    )
      throw new Error('Invalid retired TGW relationship');
    edges.add(key);
  }
  const base = {
    source: 'aws-cli-live',
    engine: 'terraform',
    accountId: inventory.accountId,
    region: inventory.region,
    deploymentId: inventory.deploymentId,
    sourcePlanSha256: plan.planSha256,
    inventorySha256: sha256,
    startedAt: new Date().toISOString(),
  };
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal),
    sources: string[] = [];
  const request = async (service: string, operation: string, args: Json = {}) => {
    const response = await api.exec('aws', [
      service,
      operation,
      '--cli-input-json',
      JSON.stringify(args),
      '--no-paginate',
      '--region',
      inventory.region,
      '--output',
      'json',
    ]);
    signal?.throwIfAborted();
    if (response.exitCode !== 0) throw detectAwsError(response.stderr, response.exitCode);
    sources.push(operation);
    return object(JSON.parse(response.stdout));
  };
  const pages = async (operation: string, collection: string, args: Json) => {
    const output: Json[] = [],
      tokens = new Set<string>();
    let token: string | undefined;
    do {
      const response = await request('ec2', operation, { ...args, ...(token ? { NextToken: token } : {}) });
      if (response.NextMarker !== undefined || response.nextToken !== undefined || response.Marker !== undefined)
        throw new Error('Unsupported absence pagination');
      output.push(...rows(response[collection]));
      if (output.length > 10000) throw new Error('Absence collection exceeded bound');
      if (response.NextToken === undefined || response.NextToken === null) token = undefined;
      else {
        if (
          typeof response.NextToken !== 'string' ||
          !response.NextToken ||
          tokens.has(response.NextToken) ||
          tokens.size >= 1000
        )
          throw new Error('Incomplete absence pagination');
        token = response.NextToken;
        tokens.add(token);
      }
    } while (token);
    return output;
  };
  try {
    if ((await request('sts', 'get-caller-identity')).Account !== inventory.accountId)
      throw new Error('AWS absence account differs');
    const resources = structuredClone(inventory.resources);
    const tags = await pages('describe-tags', 'Tags', {
      Filters: [
        { Name: 'key', Values: ['xcsh-deployment-id'] },
        { Name: 'value', Values: [inventory.deploymentId] },
      ],
    });
    const taggedIds = new Set<string>();
    for (const tag of tags) {
      if (
        tag.Key !== 'xcsh-deployment-id' ||
        tag.Value !== inventory.deploymentId ||
        typeof tag.ResourceId !== 'string' ||
        taggedIds.has(tag.ResourceId)
      )
        throw new Error('Substituted deployment tag evidence');
      taggedIds.add(tag.ResourceId);
      if (ids.has(tag.ResourceId)) continue;
      const type = tag.ResourceId.startsWith('tgw-attach-')
        ? 'aws_ec2_transit_gateway_attachment'
        : Object.keys(types).find((type) => validId(type, tag.ResourceId));
      if (!type || !validId(type, tag.ResourceId))
        throw new Error('Unsupported tagged resource requires absence evidence');
      resources.push({ type, id: tag.ResourceId });
      ids.add(tag.ResourceId);
    }
    const taggingTokens = new Set<string>();
    let taggingToken: string | undefined;
    do {
      const response = await request('resourcegroupstaggingapi', 'get-resources', {
        TagFilters: [{ Key: 'xcsh-deployment-id', Values: [inventory.deploymentId] }],
        ...(taggingToken ? { PaginationToken: taggingToken } : {}),
      });
      const mappings = rows(response.ResourceTagMappingList);
      for (const mapping of mappings) {
        if (typeof mapping.ResourceARN !== 'string' || !mapping.ResourceARN.includes(':elasticloadbalancing:'))
          continue;
        const mappingTags = rows(mapping.Tags);
        const tag = (key: string) => mappingTags.filter((row) => row.Key === key);
        if (
          tag('xcsh-deployment-id').length !== 1 ||
          tag('xcsh-deployment-id')[0].Value !== inventory.deploymentId ||
          tag('xcsh-managed-by').length !== 1 ||
          tag('xcsh-managed-by')[0].Value !== 'aws-ce' ||
          tag('xcsh-execution-engine').length !== 1 ||
          tag('xcsh-execution-engine')[0].Value !== 'terraform' ||
          tag('xcsh-plan-sha256').length !== 1 ||
          tag('xcsh-plan-sha256')[0].Value !== plan.planSha256
        )
          throw new Error('Foreign or ambiguous tagged NLB resource');
        if (ids.has(mapping.ResourceARN)) continue;
        const type = Object.keys(elbTypes).find((candidate) => validId(candidate, mapping.ResourceARN));
        if (!type) throw new Error('Unsupported tagged NLB resource requires absence evidence');
        resources.push({ type, id: mapping.ResourceARN });
        ids.add(mapping.ResourceARN);
      }
      if (
        response.PaginationToken === undefined ||
        response.PaginationToken === null ||
        response.PaginationToken === ''
      )
        taggingToken = undefined;
      else {
        if (
          typeof response.PaginationToken !== 'string' ||
          taggingTokens.has(response.PaginationToken) ||
          taggingTokens.size >= 1000
        )
          throw new Error('Incomplete tagged NLB pagination');
        taggingToken = response.PaginationToken;
        taggingTokens.add(taggingToken);
      }
    } while (taggingToken);
    const remaining: string[] = [],
      retainedTerminal: string[] = [];
    for (const [type, [operation, collection, idKey, filter]] of Object.entries(types)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      if (!selected.length) continue;
      let found = await pages(operation, collection, { Filters: [{ Name: filter, Values: selected }] });
      if (type === 'aws_instance') found = found.flatMap((row) => rows(row.Instances));
      const seen = new Set<string>();
      for (const row of found) {
        const id = row[idKey];
        if (typeof id !== 'string' || !selected.includes(id) || seen.has(id))
          throw new Error('Substituted absence resource identity');
        seen.add(id);
        let terminal = false;
        if (type === 'aws_instance') {
          const state = object(row.State).Name;
          if (typeof state !== 'string') throw new Error('Missing instance retirement state');
          terminal = state === 'terminated';
        } else if (type === 'aws_ebs_volume' || type.startsWith('aws_ec2_transit_gateway_')) {
          if (typeof row.State !== 'string') throw new Error('Missing cloud retirement state');
          terminal = row.State === 'deleted';
        }
        (terminal ? retainedTerminal : remaining).push(id);
      }
    }
    for (const [type, [operation, collection, argument]] of Object.entries(elbTypes)) {
      const selected = resources.filter((row) => row.type === type).map((row) => row.id);
      for (const id of selected) {
        try {
          const response = await request('elbv2', operation, { [argument]: [id] });
          const found = rows(response[collection]);
          if (found.length !== 1) throw new Error('Substituted NLB absence resource identity');
          const key =
            type === 'aws_lb' ? 'LoadBalancerArn' : type === 'aws_lb_target_group' ? 'TargetGroupArn' : 'ListenerArn';
          if (found[0][key] !== id) throw new Error('Substituted NLB absence resource identity');
          remaining.push(id);
        } catch (error) {
          if (!(error instanceof AwsNotFoundError)) throw error;
        }
      }
    }
    for (const edge of inventory.tgwEdges) {
      const tables = await pages('describe-transit-gateway-route-tables', 'TransitGatewayRouteTables', {
        Filters: [{ Name: 'transit-gateway-route-table-id', Values: [edge.tableId] }],
      });
      if (tables.length > 1 || tables.some((row) => row.TransitGatewayRouteTableId !== edge.tableId))
        throw new Error('Substituted TGW table evidence');
      if (!tables.length) continue;
      const association = edge.kind === 'association';
      const found = await pages(
        association ? 'get-transit-gateway-route-table-associations' : 'get-transit-gateway-route-table-propagations',
        association ? 'Associations' : 'TransitGatewayRouteTablePropagations',
        {
          TransitGatewayRouteTableId: edge.tableId,
          Filters: [{ Name: 'transit-gateway-attachment-id', Values: [edge.attachmentId] }],
        },
      );
      if (
        found.length > 1 ||
        found.some((row) => row.TransitGatewayAttachmentId !== edge.attachmentId || typeof row.State !== 'string')
      )
        throw new Error('Substituted TGW retirement edge');
      if (found.some((row) => row.State !== (association ? 'disassociated' : 'disabled')))
        remaining.push(`${edge.kind}:${edge.tableId}:${edge.attachmentId}`);
    }
    return {
      ...base,
      status: remaining.length ? ('pending' as const) : ('absent-or-retired' as const),
      remaining,
      retainedTerminal,
      resourceCount: resources.length,
      sources,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown' as const,
      reason: error instanceof Error ? error.name : 'invalid-evidence',
      sources,
      observedAt: new Date().toISOString(),
    };
  }
}
