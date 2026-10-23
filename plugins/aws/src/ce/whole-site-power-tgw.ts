import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { staticAzRoutes } from './static-routing';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed static TGW evidence');
  return value as Json;
}
function rows(value: unknown): Json[] {
  if (!Array.isArray(value)) throw Error('Incomplete static TGW evidence');
  return value.map(object);
}
function exactly(value: unknown): Json {
  const items = rows(value);
  if (items.length !== 1) throw Error('Static TGW evidence cardinality differs');
  return items[0];
}
function network(cidr: string) {
  const parts = cidr.split('/'),
    bits = Number(parts[1]);
  if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d{1,2}$/.test(parts[1]) || bits < 0 || bits > 32)
    throw Error('Malformed static TGW route prefix');
  const start = parts[0].split('.').reduce((value, octet) => value * 256 + Number(octet), 0),
    size = 2 ** (32 - bits);
  if (start % size) throw Error('Unaligned static TGW route prefix');
  return { start, end: start + size - 1 };
}
/** Read-only service-route membership; retained transport and appliance return paths are independently verified. */
export async function collectAwsPowerStaticTgwRoutes(
  base: AwsCePlan,
  values: Record<string, string>,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  const intent = base.intent,
    routing = intent.routing,
    appliances = staticAzRoutes(intent);
  const gateway = routing.transitGatewayId ?? '',
    table = routing.transitGatewayRouteTableId ?? '',
    attachment = values.__TGW_TRANSPORT_ATTACHMENT__,
    vpc = values.__VPC_ID__ ?? intent.vpc.vpcId;
  if (
    routing.profile !== 'tgw-static' ||
    !appliances.length ||
    intent.routes.length ||
    routing.transportAttachmentId ||
    !/^tgw-[a-f0-9]{8,17}$/.test(gateway ?? '') ||
    !/^tgw-rtb-[a-f0-9]{8,17}$/.test(table ?? '') ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(attachment ?? '') ||
    !/^vpc-[a-f0-9]{8,17}$/.test(vpc ?? '') ||
    !intent.brownfield.resourceIds.includes(gateway) ||
    !intent.brownfield.transitGatewayRouteTableIds.includes(table) ||
    !routing.destinationCidrs.length ||
    new Set(routing.destinationCidrs).size !== routing.destinationCidrs.length ||
    canonicalSha256(routing.associations) !== canonicalSha256([table]) ||
    routing.propagations.length
  )
    throw Error('Static TGW service scope unresolved or ambiguous');
  const api = scopedAwsApi(raw, intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Static TGW service unavailable');
    const data = object(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial static TGW evidence');
    return data;
  };
  const ownership = (resource: Json, node?: number) => {
    const tags = rows(resource.Tags);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-execution-engine': base.engine,
      'xcsh-plan-sha256': base.planSha256,
      ...(node ? { 'xcsh-node-index': String(node) } : {}),
    };
    if (
      new Set(tags.map((t) => t.Key)).size !== tags.length ||
      tags.some((t) => typeof t.Key !== 'string' || typeof t.Value !== 'string') ||
      Object.entries(expected).some(([key, value]) => !tags.some((t) => t.Key === key && t.Value === value))
    )
      throw Error('Foreign static TGW resource ownership');
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Static TGW account differs');
  const transport = exactly(
    (await read(['ec2', 'describe-transit-gateway-vpc-attachments', '--transit-gateway-attachment-ids', attachment]))
      .TransitGatewayVpcAttachments,
  );
  ownership(transport);
  if (
    transport.TransitGatewayAttachmentId !== attachment ||
    transport.TransitGatewayId !== gateway ||
    transport.VpcId !== vpc ||
    transport.VpcOwnerId !== base.accountId ||
    transport.State !== 'available' ||
    object(transport.Options).ApplianceModeSupport !== 'enable'
  )
    throw Error('Static TGW retained transport differs');
  const transportSubnets = transport.SubnetIds;
  if (
    !Array.isArray(transportSubnets) ||
    transportSubnets.length !== appliances.length ||
    new Set(transportSubnets).size !== transportSubnets.length
  )
    throw Error('Static TGW transport subnet identity incomplete');
  const routeTable = exactly(
    (await read(['ec2', 'describe-transit-gateway-route-tables', '--transit-gateway-route-table-ids', table]))
      .TransitGatewayRouteTables,
  );
  if (
    routeTable.TransitGatewayRouteTableId !== table ||
    routeTable.TransitGatewayId !== gateway ||
    routeTable.State !== 'available'
  )
    throw Error('Static TGW route table differs');
  const associations = rows(
    (await read(['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', table]))
      .Associations,
  ).filter((a) => a.TransitGatewayAttachmentId === attachment);
  if (associations.length !== 1 || associations[0].State !== 'associated')
    throw Error('Static TGW retained association differs');
  const propagations = rows(
    (await read(['ec2', 'get-transit-gateway-route-table-propagations', '--transit-gateway-route-table-id', table]))
      .TransitGatewayRouteTablePropagations,
  ).filter((a) => a.TransitGatewayAttachmentId === attachment);
  if (propagations.some((a) => a.State !== 'disabled')) throw Error('Static TGW unexpected propagation');
  const applianceBindings: Json[] = [];
  for (const appliance of appliances) {
    const rt = values[`__STATIC_ROUTE_TABLE_${appliance.node}__`],
      eni = values[`__ENI_${appliance.node}_1__`],
      instance = values[`__INSTANCE_${appliance.node}__`];
    if (
      !/^rtb-[a-f0-9]{8,17}$/.test(rt ?? '') ||
      !/^eni-[a-f0-9]{8,17}$/.test(eni ?? '') ||
      !/^i-[a-f0-9]{8,17}$/.test(instance ?? '')
    )
      throw Error('Static TGW appliance runtime identity unresolved');
    const nic = exactly(
      (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', eni])).NetworkInterfaces,
    );
    if (
      nic.NetworkInterfaceId !== eni ||
      nic.OwnerId !== base.accountId ||
      nic.VpcId !== vpc ||
      !transportSubnets.includes(nic.SubnetId) ||
      object(nic.Attachment).InstanceId !== instance ||
      object(nic.Attachment).DeviceIndex !== 1
    )
      throw Error('Static TGW SLI transport identity differs');
    const local = exactly((await read(['ec2', 'describe-route-tables', '--route-table-ids', rt])).RouteTables);
    ownership(local, appliance.node);
    const localAssociations = rows(local.Associations);
    if (
      local.RouteTableId !== rt ||
      local.OwnerId !== base.accountId ||
      local.VpcId !== vpc ||
      localAssociations.length !== 1 ||
      localAssociations[0].SubnetId !== nic.SubnetId ||
      localAssociations[0].Main === true ||
      object(localAssociations[0].AssociationState).State !== 'associated'
    )
      throw Error('Static TGW appliance table association differs');
    const localRoutes = rows(local.Routes);
    const ids = localRoutes.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (ids.some((v) => typeof v !== 'string') || new Set(ids).size !== ids.length)
      throw Error('Static TGW appliance route inventory malformed');
    for (const [direction, prefixes] of [
      ['forward', appliance.forwardCidrs],
      ['return', appliance.returnCidrs],
    ] as const)
      for (const destination of prefixes) {
        const match = localRoutes.filter((r) => r.DestinationCidrBlock === destination);
        const key = direction === 'forward' ? 'NetworkInterfaceId' : 'TransitGatewayId';
        if (
          match.length !== 1 ||
          match[0][key] !== (direction === 'forward' ? eni : gateway) ||
          match[0].State !== 'active' ||
          match[0].Origin !== 'CreateRoute' ||
          [
            'GatewayId',
            'NatGatewayId',
            'VpcPeeringConnectionId',
            direction === 'forward' ? 'TransitGatewayId' : 'NetworkInterfaceId',
          ].some((k) => Object.hasOwn(match[0], k))
        )
          throw Error('Static TGW appliance forward/return route differs');
      }
    applianceBindings.push({
      node: appliance.node,
      routeTableId: rt,
      networkInterfaceId: eni,
      instanceId: instance,
      subnetId: nic.SubnetId,
      availabilityZone: appliance.availabilityZone,
      forwardCidrs: appliance.forwardCidrs,
      returnCidrs: appliance.returnCidrs,
    });
  }
  if (
    new Set(applianceBindings.map((a) => a.routeTableId)).size !== appliances.length ||
    new Set(applianceBindings.map((a) => a.subnetId)).size !== appliances.length ||
    new Set(applianceBindings.map((a) => a.networkInterfaceId)).size !== appliances.length
  )
    throw Error('Static TGW appliance identity duplicated');
  const memberships: Array<{ destinationCidr: string; status: 'active' | 'withdrawn' | 'pending' }> = [];
  for (const destination of [...routing.destinationCidrs].sort()) {
    const expected = network(destination),
      merged = new Map<string, Json>();
    for (const filter of ['exact-match', 'subnet-of-match', 'supernet-of-match']) {
      const result = await read([
        'ec2',
        'search-transit-gateway-routes',
        '--transit-gateway-route-table-id',
        table,
        '--filters',
        `Name=route-search.${filter},Values=${destination}`,
      ]);
      if (result.AdditionalRoutesAvailable !== false) throw Error('Partial static TGW route search');
      const seen = new Set<string>();
      for (const route of rows(result.Routes)) {
        const prefix = route.DestinationCidrBlock;
        if (typeof prefix !== 'string' || seen.has(prefix) || Object.hasOwn(route, 'PrefixListId'))
          throw Error('Malformed or duplicate static TGW route search');
        seen.add(prefix);
        const actual = network(prefix);
        if (
          actual.start > expected.end ||
          expected.start > actual.end ||
          (filter === 'exact-match' && prefix !== destination)
        )
          throw Error('Unrelated static TGW route search');
        const target = exactly(route.TransitGatewayAttachments);
        if (
          route.Type !== 'static' ||
          target.TransitGatewayAttachmentId !== attachment ||
          !['active', 'blackhole'].includes(String(route.State))
        )
          throw Error('Foreign static TGW service route');
        const normalized = { destinationCidr: prefix, type: route.Type, state: route.State, attachmentId: attachment };
        const prior = merged.get(prefix);
        if (prior && canonicalSha256(prior) !== canonicalSha256(normalized))
          throw Error('Static TGW route changed during collection');
        merged.set(prefix, normalized);
      }
    }
    const matches = [...merged.values()];
    memberships.push({
      destinationCidr: destination,
      status:
        matches.length === 0
          ? 'withdrawn'
          : matches.length === 1 && matches[0].destinationCidr === destination && matches[0].state === 'active'
            ? 'active'
            : 'pending',
    });
  }

  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-static-tgw-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    transitGatewayId: gateway,
    routeTableId: table,
    transportAttachmentId: attachment,
    vpcId: vpc,
    transportSubnets: [...transportSubnets].sort(),
    appliances: applianceBindings,
    destinationCidrs: [...routing.destinationCidrs].sort(),
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    memberships,
    status: memberships.every((m) => m.status === 'active')
      ? ('active' as const)
      : memberships.every((m) => m.status === 'withdrawn')
        ? ('withdrawn' as const)
        : ('pending' as const),
    traffic: 'unknown' as const,
    collectedAt: new Date().toISOString(),
  };
}
