import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, resourceConfiguration } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed original direct route evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw Error('Incomplete original direct route evidence');
  return value.map(object);
};
const targets = {
  GatewayId: ['gateway_id', /^igw-[a-f0-9]{8,17}$/],
  NatGatewayId: ['nat_gateway_id', /^nat-[a-f0-9]{8,17}$/],
  NetworkInterfaceId: ['network_interface_id', /^eni-[a-f0-9]{8,17}$/],
  TransitGatewayId: ['transit_gateway_id', /^tgw-[a-f0-9]{8,17}$/],
  VpcPeeringConnectionId: ['vpc_peering_connection_id', /^pcx-[a-f0-9]{8,17}$/],
} as const;
function destination(cidr: string) {
  const [ip, bits, ...extra] = cidr.split('/');
  const prefix = Number(bits);
  if (extra.length || isIP(ip) !== 4 || !/^\d{1,2}$/.test(bits) || prefix < 1 || prefix > 32)
    throw Error('Original direct route destination unresolved');
  const address = ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
  if (address % 2 ** (32 - prefix)) throw Error('Original direct route destination unaligned');
}
/** Read-only prerequisite for importing existing routes; never admits a mutation or infers CE freshness. */
export async function collectAwsTerraformDirectRouteOwnership(
  base: AwsCePlan,
  values: Record<string, string>,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.routing.profile !== 'direct-eni' ||
    base.topology.nodeCount !== 1 ||
    base.interfaces.length !== 2 ||
    base.interfaces[0].role !== 'slo' ||
    base.interfaces[1].role !== 'sli' ||
    !base.intent.routes.length
  )
    throw Error('Original direct route requires exact Terraform single-node dual-interface plan');
  const instance = values.__INSTANCE_1__,
    slo = values.__ENI_1_0__,
    sli = values.__ENI_1_1__;
  if (
    !/^i-[a-f0-9]{8,17}$/.test(instance ?? '') ||
    ![slo, sli].every((id) => /^eni-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    slo === sli
  )
    throw Error('Original direct route execution identifiers unresolved');
  const requested = [...base.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  const ids = [...new Set(requested.map((r) => r.routeTableId))].sort();
  if (
    requested.some(
      (r) =>
        r.node !== 1 ||
        !/^rtb-[a-f0-9]{8,17}$/.test(r.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(r.routeTableId),
    ) ||
    new Set(requested.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== requested.length
  )
    throw Error('Original direct route selected identity differs');
  for (const route of requested) destination(route.destinationCidr);
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Original direct route observation unavailable');
    const data = object(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial original direct route evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Original direct route account differs');
  const readEnis = async () =>
    rows((await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', slo, sli])).NetworkInterfaces);
  const readTables = async () =>
    rows((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...ids])).RouteTables);
  const enis = await readEnis();
  if (enis.length !== 2 || new Set(enis.map((e) => e.NetworkInterfaceId)).size !== 2)
    throw Error('Original direct route ENI inventory incomplete');
  const interfaces = [slo, sli].map((id, index) => {
    const matches = enis.filter((e) => e.NetworkInterfaceId === id);
    if (matches.length !== 1) throw Error('Original direct route ENI ambiguous');
    const e = matches[0],
      attachment = object(e.Attachment),
      tags = rows(e.TagSet);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': '1',
      'xcsh-interface-index': String(index),
    };
    if (
      e.OwnerId !== base.accountId ||
      e.Status !== 'in-use' ||
      e.SourceDestCheck !== false ||
      attachment.InstanceId !== instance ||
      attachment.DeviceIndex !== index ||
      !/^vpc-[a-f0-9]{8,17}$/.test(String(e.VpcId)) ||
      !/^subnet-[a-f0-9]{8,17}$/.test(String(e.SubnetId)) ||
      typeof e.MacAddress !== 'string' ||
      e.MacAddress.toLowerCase() !== values[`__ENI_1_${index}_MAC__`]?.toLowerCase() ||
      Object.entries(expected).some(
        ([k, v]) => tags.filter((t) => t.Key === k).length !== 1 || tags.find((t) => t.Key === k)?.Value !== v,
      )
    )
      throw Error('Original direct route ENI ownership differs');
    return { id, mac: e.MacAddress.toLowerCase(), vpcId: String(e.VpcId), subnetId: String(e.SubnetId), index };
  });
  if (interfaces[0].vpcId !== interfaces[1].vpcId || interfaces[0].subnetId === interfaces[1].subnetId)
    throw Error('Original direct route physical VPC or subnet differs');
  const tables = await readTables();
  if (
    tables.length !== ids.length ||
    new Set(tables.map((t) => t.RouteTableId)).size !== ids.length ||
    tables.some((t) => !ids.includes(String(t.RouteTableId)))
  )
    throw Error('Original direct route table inventory incomplete');
  const routes: Array<{
    address: string;
    routeTableId: string;
    destinationCidr: string;
    networkInterfaceId: string;
    originalTarget: { field: string; id: string };
  }> = [];
  for (const table of tables) {
    const id = String(table.RouteTableId),
      associations = rows(table.Associations),
      all = rows(table.Routes);
    if (
      table.OwnerId !== base.accountId ||
      table.VpcId !== interfaces[0].vpcId ||
      !associations.length ||
      associations.some(
        (a) =>
          a.Main === true ||
          interfaces.some((i) => i.subnetId === a.SubnetId) ||
          !/^subnet-[a-f0-9]{8,17}$/.test(String(a.SubnetId)) ||
          object(a.AssociationState).State !== 'associated',
      ) ||
      new Set(associations.map((a) => a.SubnetId)).size !== associations.length
    )
      throw Error('Original direct route table overlaps CE management or differs in ownership');
    const before = base.rollback?.resources.filter((r) => r.id === id);
    if (
      before?.length !== 1 ||
      rows(before[0].before.RouteTables).length !== 1 ||
      canonicalSha256(
        resourceConfiguration([
          { id, region: base.region, exists: true, owned: false, tags: {}, state: { RouteTables: [table] } },
        ]),
      ) !==
        canonicalSha256(
          resourceConfiguration([
            { id, region: base.region, exists: true, owned: false, tags: {}, state: before[0].before },
          ]),
        )
    )
      throw Error('Original direct route immutable snapshot drift');
    const destinations = all.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (destinations.some((d) => typeof d !== 'string') || new Set(destinations).size !== all.length)
      throw Error('Original direct route duplicate destination');
    for (const route of requested.filter((r) => r.routeTableId === id)) {
      const matches = all.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      if (matches.length !== 1) throw Error('Original direct route import requires existing route');
      const actual = matches[0],
        keys = Object.keys(targets).filter((k) => Object.hasOwn(actual, k));
      if (
        keys.length !== 1 ||
        actual.State !== 'active' ||
        actual.Origin !== 'CreateRoute' ||
        [
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
          'CoreNetworkArn',
          'VpcEndpointId',
          'OdbNetworkArn',
        ].some((k) => Object.hasOwn(actual, k))
      )
        throw Error('Original direct route target unsupported or unavailable');
      const [field, pattern] = targets[keys[0] as keyof typeof targets];
      const target = actual[keys[0]];
      if (typeof target !== 'string' || !pattern.test(target) || [slo, sli].includes(target))
        throw Error('Original direct route target unresolved');
      routes.push({
        address: `aws_route.direct_${requested.indexOf(route)}`,
        routeTableId: id,
        destinationCidr: route.destinationCidr,
        networkInterfaceId: sli,
        originalTarget: { field, id: target },
      });
    }
  }
  const finalEnis = await readEnis(),
    finalTables = await readTables();
  const normalize = (entries: Json[], key: string) =>
    [...entries].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  if (
    canonicalSha256(normalize(enis, 'NetworkInterfaceId')) !==
      canonicalSha256(normalize(finalEnis, 'NetworkInterfaceId')) ||
    canonicalSha256(normalize(tables, 'RouteTableId')) !== canonicalSha256(normalize(finalTables, 'RouteTableId'))
  )
    throw Error('Original direct route identity changed during discovery');
  const snapshot = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-original-direct-routes',
    sourcePlanSha256: base.planSha256,
    accountId: base.accountId,
    region: base.region,
    instanceId: instance,
    vpcId: interfaces[0].vpcId,
    sloSubnetId: interfaces[0].subnetId,
    sliSubnetId: interfaces[1].subnetId,
    interfaces,
    routes: routes.sort((a, b) => a.address.localeCompare(b.address)),
    tables: normalize(tables, 'RouteTableId'),
  };
  return { ...snapshot, snapshotSha256: canonicalSha256(snapshot) };
}
