import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed direct route evidence');
  return value as Json;
}
function rows(value: unknown): Json[] {
  if (!Array.isArray(value)) throw Error('Incomplete direct route evidence');
  return value.map(object);
}
function network(cidr: string) {
  const parts = cidr.split('/'),
    bits = Number(parts[1]);
  if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d{1,2}$/.test(parts[1]) || bits < 0 || bits > 32)
    throw Error('Malformed direct service route prefix');
  const start = parts[0].split('.').reduce((value, octet) => value * 256 + Number(octet), 0),
    size = 2 ** (32 - bits);
  if (start % size) throw Error('Unaligned direct service route prefix');
  return { start, end: start + size - 1 };
}
function overlaps(left: string, right: string) {
  const a = network(left),
    b = network(right);
  return a.start <= b.end && b.start <= a.end;
}
/** Internal read-only brownfield service observer. Coordinator independently verifies CE hardware and operational gates. */
export async function collectAwsPowerDirectRoutes(
  base: AwsCePlan,
  values: Record<string, string>,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  if (
    base.intent.routing.profile !== 'direct-eni' ||
    base.topology.nodeCount !== 1 ||
    !base.intent.routes.length ||
    base.interfaces.length !== 2 ||
    base.interfaces[0].role !== 'slo' ||
    base.interfaces[1].role !== 'sli'
  )
    throw Error('Exact single-site dual-interface direct routes required');
  const instance = values.__INSTANCE_1__,
    slo = values.__ENI_1_0__,
    sli = values.__ENI_1_1__;
  if (
    !/^i-[a-f0-9]{8,17}$/.test(instance ?? '') ||
    ![slo, sli].every((v) => /^eni-[a-f0-9]{8,17}$/.test(v ?? '')) ||
    slo === sli
  )
    throw Error('Direct route runtime identities unresolved');
  const routes = base.intent.routes
    .map((route) => {
      const parts = route.destinationCidr.split('/');
      const prefix = Number(parts[1]);
      if (
        !/^rtb-[a-f0-9]{8,17}$/.test(route.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(route.routeTableId) ||
        route.node !== 1 ||
        parts.length !== 2 ||
        isIP(parts[0]) !== 4 ||
        !Number.isInteger(prefix) ||
        prefix < 1 ||
        prefix > 32
      )
        throw Error('Direct service route ownership or destination differs');
      network(route.destinationCidr);
      return { routeTableId: route.routeTableId, destinationCidr: route.destinationCidr, networkInterfaceId: sli };
    })
    .sort((a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr));
  if (new Set(routes.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== routes.length)
    throw Error('Duplicate direct service route');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Direct route service unavailable');
    const data = object(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial direct route evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Direct route account differs');
  const enis = rows(
    (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', slo])).NetworkInterfaces,
  );
  if (
    enis.length !== 1 ||
    enis[0].NetworkInterfaceId !== slo ||
    enis[0].OwnerId !== base.accountId ||
    !/^subnet-[a-f0-9]{8,17}$/.test(String(enis[0].SubnetId)) ||
    object(enis[0].Attachment).InstanceId !== instance ||
    object(enis[0].Attachment).DeviceIndex !== 0
  )
    throw Error('Direct route SLO identity differs');
  const ids = [...new Set(routes.map((r) => r.routeTableId))];
  const tables = rows((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...ids])).RouteTables);
  if (
    tables.length !== ids.length ||
    new Set(tables.map((t) => t.RouteTableId)).size !== ids.length ||
    tables.some((t) => !ids.includes(String(t.RouteTableId)))
  )
    throw Error('Direct route table cardinality differs');
  const bindings: Json[] = [];
  const statuses: Array<'active' | 'withdrawn' | 'pending'> = [];
  const memberships: Array<{
    routeTableId: string;
    destinationCidr: string;
    status: 'active' | 'withdrawn' | 'pending';
  }> = [];
  for (const table of tables) {
    if (table.OwnerId !== base.accountId || !/^vpc-[a-f0-9]{8,17}$/.test(String(table.VpcId)))
      throw Error('Direct route table ownership differs');
    const associations = rows(table.Associations);
    if (
      !associations.length ||
      associations.some(
        (a) =>
          a.Main === true ||
          a.SubnetId === enis[0].SubnetId ||
          !/^subnet-[a-f0-9]{8,17}$/.test(String(a.SubnetId)) ||
          object(a.AssociationState).State !== 'associated',
      ) ||
      new Set(associations.map((a) => a.SubnetId)).size !== associations.length
    )
      throw Error('Direct service route overlaps SLO or ambiguous association');
    const all = rows(table.Routes);
    const destinations = all.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (destinations.some((d) => typeof d !== 'string') || new Set(destinations).size !== all.length)
      throw Error('Duplicate or malformed route inventory');
    for (const route of routes.filter((r) => r.routeTableId === table.RouteTableId)) {
      const matches = all.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      const overlapping = all.filter(
        (row) =>
          typeof row.DestinationCidrBlock === 'string' &&
          row.DestinationCidrBlock !== route.destinationCidr &&
          overlaps(row.DestinationCidrBlock, route.destinationCidr),
      );
      if (!matches.length) {
        memberships.push({
          routeTableId: route.routeTableId,
          destinationCidr: route.destinationCidr,
          status: overlapping.length ? 'pending' : 'withdrawn',
        });
        statuses.push(overlapping.length ? 'pending' : 'withdrawn');
        continue;
      }
      const actual = matches[0];
      if (
        actual.NetworkInterfaceId !== sli ||
        actual.Origin !== 'CreateRoute' ||
        [
          'GatewayId',
          'NatGatewayId',
          'TransitGatewayId',
          'VpcPeeringConnectionId',
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
          'CoreNetworkArn',
        ].some((k) => Object.hasOwn(actual, k)) ||
        !['active', 'blackhole'].includes(String(actual.State))
      )
        throw Error('Foreign direct service route target');
      memberships.push({
        routeTableId: route.routeTableId,
        destinationCidr: route.destinationCidr,
        status: actual.State === 'active' ? 'active' : 'pending',
      });
      statuses.push(actual.State === 'active' ? 'active' : 'pending');
    }
    bindings.push({
      routeTableId: table.RouteTableId,
      vpcId: table.VpcId,
      subnets: associations.map((a) => a.SubnetId).sort(),
    });
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-direct-route-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    instanceId: instance,
    sloNetworkInterfaceId: slo,
    sloSubnetId: enis[0].SubnetId,
    routes,
    tables: bindings.sort((a, b) => String(a.routeTableId).localeCompare(String(b.routeTableId))),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    memberships,
    status: statuses.every((s) => s === 'active')
      ? ('active' as const)
      : statuses.every((s) => s === 'withdrawn')
        ? ('withdrawn' as const)
        : ('pending' as const),
    traffic: 'unknown' as const,
    collectedAt: new Date().toISOString(),
  };
}
