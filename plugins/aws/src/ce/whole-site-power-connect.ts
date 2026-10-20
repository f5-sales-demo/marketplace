import { isIP } from 'node:net';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { siteForNode } from './topology';
import type { AwsCePlan } from './types';
type Json = Record<string, unknown>;
function object(v: unknown): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Connect service evidence');
  return v as Json;
}
function rows(v: unknown): Json[] {
  if (!Array.isArray(v)) throw Error('Incomplete Connect service evidence');
  return v.map(object);
}
function exactly(v: unknown): Json {
  const all = rows(v);
  if (all.length !== 1) throw Error('Connect service cardinality differs');
  return all[0];
}
function network(cidr: string) {
  const [ip, prefix, extra] = cidr.split('/'),
    bits = Number(prefix);
  if (isIP(ip) !== 4 || !/^\d{1,2}$/.test(prefix ?? '') || bits < 1 || bits > 32 || extra !== undefined)
    throw Error('Connect service prefix unresolved or broad');
  const address = ip.split('.').reduce((n, o) => (n * 256 + Number(o)) >>> 0, 0),
    mask = (0xffffffff << (32 - bits)) >>> 0;
  if ((address & mask) >>> 0 !== address) throw Error('Connect service prefix not network aligned');
  return { address, bits };
}
function overlaps(a: string, b: string) {
  const x = network(a),
    y = network(b),
    mask = (0xffffffff << (32 - Math.min(x.bits, y.bits))) >>> 0;
  return (x.address & mask) >>> 0 === (y.address & mask) >>> 0;
}
/** Read-only cloud membership. CE publisher freshness and traffic remain separate qualification gates. */
export async function collectAwsPowerConnectRoutes(
  base: AwsCePlan,
  values: Record<string, string>,
  raw: AwsExecApi,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(base);
  const routing = base.intent.routing,
    gateway = routing.transitGatewayId ?? '',
    vpc = values.__VPC_ID__ ?? base.intent.vpc.vpcId ?? '';
  const transport = routing.transportAttachmentId ?? values.__TGW_TRANSPORT_ATTACHMENT__;
  const tables = [...new Set([...routing.associations, ...routing.propagations])].sort();
  if (
    routing.profile !== 'tgw-connect' ||
    !Number.isInteger(routing.customerAsn) ||
    !Number.isInteger(routing.transitGatewayAsn) ||
    (routing.customerAsn ?? 0) < 1 ||
    (routing.transitGatewayAsn ?? 0) < 1 ||
    !/^tgw-[a-f0-9]{8,17}$/.test(gateway) ||
    !/^vpc-[a-f0-9]{8,17}$/.test(vpc) ||
    !/^tgw-attach-[a-f0-9]{8,17}$/.test(transport ?? '') ||
    !base.intent.brownfield.resourceIds.includes(gateway) ||
    routing.associations.length !== 1 ||
    !routing.propagations.length ||
    new Set(routing.propagations).size !== routing.propagations.length ||
    tables.some(
      (t) => !/^tgw-rtb-[a-f0-9]{8,17}$/.test(t) || !base.intent.brownfield.transitGatewayRouteTableIds.includes(t),
    ) ||
    !routing.destinationCidrs.length ||
    new Set(routing.destinationCidrs).size !== routing.destinationCidrs.length
  )
    throw Error('Connect service scope unresolved or ambiguous');
  const prefixes = [...routing.destinationCidrs].sort();
  for (const p of prefixes) network(p);
  const resolve = (v: string | undefined) => (v?.startsWith('__') ? values[v] : v);
  const arg = (args: string[] | undefined, flag: string) => {
    const index = args?.indexOf(flag) ?? -1;
    return index < 0 ? undefined : resolve(args?.[index + 1]);
  };
  const attachmentActions = base.actions.filter((a) => a.kind === 'tgw-connect-attachment-create');
  const attachmentIds = attachmentActions.map((a) => values[a.capture?.placeholder ?? '']);
  const peerActions = base.actions.filter((a) => a.kind === 'tgw-connect-peer-create');
  const expected = peerActions.map((a) => {
    const ref = a.args?.[(a.args?.indexOf('--peer-address') ?? -1) + 1],
      role = ref?.match(/^__NODE_(\d+)_(SLO|SLI)_IP__$/);
    const index = role?.[2] === 'SLO' ? 0 : 1,
      node = a.node ?? 0;
    if (
      !role ||
      Number(role[1]) !== node ||
      !base.intent.interfaces.some((i) => i.index === index && i.role === role[2].toLowerCase())
    )
      throw Error('Connect peer interface role unresolved');
    return {
      node,
      siteName: siteForNode(base.intent, node).name,
      interfaceIndex: index,
      peerId: values[a.capture?.placeholder ?? ''],
      attachmentId: arg(a.args, '--transit-gateway-attachment-id'),
      peerAddress: arg(a.args, '--peer-address'),
      insideCidr: arg(a.args, '--inside-cidr-blocks'),
      gatewayAddress: arg(a.args, '--transit-gateway-address'),
      eni: values[`__ENI_${node}_${index}__`],
      mac: values[`__ENI_${node}_${index}_MAC__`],
      instance: values[`__INSTANCE_${node}__`],
    };
  });
  if (
    !attachmentIds.length ||
    new Set(attachmentIds).size !== attachmentIds.length ||
    attachmentIds.some((a) => !/^tgw-attach-[a-f0-9]{8,17}$/.test(a ?? '')) ||
    attachmentActions.some(
      (a) =>
        arg(a.args, '--transport-transit-gateway-attachment-id') !== transport ||
        arg(a.args, '--options') !== 'Protocol=gre',
    ) ||
    !expected.length ||
    new Set(expected.map((p) => p.peerId)).size !== expected.length ||
    (routing.connectPeers !== undefined &&
      (routing.connectPeers.length !== expected.length ||
        routing.connectPeers.some(
          (p, i) =>
            p.node !== expected[i].node ||
            p.transportInterfaceIndex !== expected[i].interfaceIndex ||
            p.insideCidr !== expected[i].insideCidr ||
            p.transitGatewayAddress !== expected[i].gatewayAddress,
        ))) ||
    Array.from({ length: base.intent.topology.nodeCount }, (_, i) => i + 1).some(
      (node) => !expected.some((p) => p.node === node),
    ) ||
    attachmentIds.some(
      (id) =>
        expected.filter((p) => p.attachmentId === id).length < 1 ||
        expected.filter((p) => p.attachmentId === id).length > 4,
    ) ||
    expected.some(
      (p) =>
        !/^tgw-connect-peer-[a-f0-9]{8,21}$/.test(p.peerId ?? '') ||
        !attachmentIds.includes(p.attachmentId ?? '') ||
        isIP(p.peerAddress ?? '') !== 4 ||
        !/^eni-[a-f0-9]{8,17}$/.test(p.eni ?? '') ||
        !/^i-[a-f0-9]{8,17}$/.test(p.instance ?? '') ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i.test(p.mac ?? ''),
    )
  )
    throw Error('Connect runtime bindings incomplete or duplicated');
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args: string[]) => {
    signal?.throwIfAborted();
    const r = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (r.exitCode) throw Error('Connect service observation unavailable');
    const result = object(JSON.parse(r.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(result, k)))
      throw Error('Partial Connect service evidence');
    return result;
  };
  const owned = (resource: Json, node?: number, interfaceIndex?: number) => {
    const tags = rows(resource.Tags ?? resource.TagSet);
    const labels = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-execution-engine': base.engine,
      'xcsh-plan-sha256': base.planSha256,
      ...(node ? { 'xcsh-node-index': String(node) } : {}),
      ...(interfaceIndex !== undefined ? { 'xcsh-interface-index': String(interfaceIndex) } : {}),
    };
    if (
      new Set(tags.map((t) => t.Key)).size !== tags.length ||
      tags.some((t) => typeof t.Key !== 'string' || typeof t.Value !== 'string') ||
      Object.entries(labels).some(([k, v]) => !tags.some((t) => t.Key === k && t.Value === v))
    )
      throw Error('Foreign Connect service ownership');
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Connect service account differs');
  const transportObject = exactly(
    (await read(['ec2', 'describe-transit-gateway-vpc-attachments', '--transit-gateway-attachment-ids', transport]))
      .TransitGatewayVpcAttachments,
  );
  if (routing.transportAttachmentId) {
    if (!base.intent.brownfield.resourceIds.includes(transport))
      throw Error('Connect brownfield transport not allowlisted');
  } else owned(transportObject);
  const transportSubnets = transportObject.SubnetIds;
  if (
    transportObject.TransitGatewayAttachmentId !== transport ||
    transportObject.TransitGatewayId !== gateway ||
    transportObject.VpcId !== vpc ||
    transportObject.VpcOwnerId !== base.accountId ||
    transportObject.State !== 'available' ||
    !Array.isArray(transportSubnets) ||
    !transportSubnets.length ||
    new Set(transportSubnets).size !== transportSubnets.length ||
    transportSubnets.some((s) => typeof s !== 'string' || !/^subnet-[a-f0-9]{8,17}$/.test(s)) ||
    !['enable', 'disable'].includes(String(object(transportObject.Options).ApplianceModeSupport))
  )
    throw Error('Connect retained transport differs');
  const attachmentBindings: Json[] = [];
  for (const id of [...attachmentIds].sort()) {
    const connect = exactly(
      (await read(['ec2', 'describe-transit-gateway-connects', '--transit-gateway-attachment-ids', id]))
        .TransitGatewayConnects,
    );
    const generic = exactly(
      (await read(['ec2', 'describe-transit-gateway-attachments', '--transit-gateway-attachment-ids', id]))
        .TransitGatewayAttachments,
    );
    owned(connect);
    owned(generic);
    if (
      connect.TransitGatewayAttachmentId !== id ||
      connect.TransitGatewayId !== gateway ||
      connect.TransportTransitGatewayAttachmentId !== transport ||
      connect.State !== 'available' ||
      object(connect.Options).Protocol !== 'gre' ||
      generic.TransitGatewayAttachmentId !== id ||
      generic.TransitGatewayId !== gateway ||
      generic.ResourceOwnerId !== base.accountId ||
      generic.ResourceType !== 'connect' ||
      generic.State !== 'available'
    )
      throw Error('Connect attachment owner or transport differs');
    attachmentBindings.push({ id, transportAttachmentId: transport, protocol: 'gre' });
  }
  const peerResponse = rows(
    (
      await read([
        'ec2',
        'describe-transit-gateway-connect-peers',
        '--transit-gateway-connect-peer-ids',
        ...expected.map((p) => p.peerId),
      ])
    ).TransitGatewayConnectPeers,
  );
  if (
    peerResponse.length !== expected.length ||
    new Set(peerResponse.map((p) => p.TransitGatewayConnectPeerId)).size !== peerResponse.length
  )
    throw Error('Connect peer discovery incomplete or duplicated');
  const peerBindings: Json[] = [],
    sessions: Array<{ peerId: string; awsEndpoint: string; ceEndpoint: string; status: string }> = [];
  for (const selected of expected) {
    const peer = exactly(peerResponse.filter((p) => p.TransitGatewayConnectPeerId === selected.peerId));
    owned(peer, selected.node);
    const nic = exactly(
      (await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', selected.eni])).NetworkInterfaces,
    );
    owned(nic, selected.node, selected.interfaceIndex);
    if (
      peer.TransitGatewayAttachmentId !== selected.attachmentId ||
      peer.State !== 'available' ||
      nic.NetworkInterfaceId !== selected.eni ||
      nic.OwnerId !== base.accountId ||
      nic.VpcId !== vpc ||
      nic.PrivateIpAddress !== selected.peerAddress ||
      nic.MacAddress !== selected.mac ||
      nic.Status !== 'in-use' ||
      object(nic.Attachment).InstanceId !== selected.instance ||
      object(nic.Attachment).DeviceIndex !== selected.interfaceIndex ||
      !/^subnet-[a-f0-9]{8,17}$/.test(String(nic.SubnetId))
    )
      throw Error('Connect peer and physical interface binding differs');
    const config = object(peer.ConnectPeerConfiguration),
      cidrs = config.InsideCidrBlocks;
    if (
      config.Protocol !== 'gre' ||
      config.PeerAddress !== selected.peerAddress ||
      isIP(String(config.TransitGatewayAddress)) !== 4 ||
      (selected.gatewayAddress !== undefined && config.TransitGatewayAddress !== selected.gatewayAddress) ||
      !Array.isArray(cidrs) ||
      cidrs.length !== 1 ||
      cidrs[0] !== selected.insideCidr
    )
      throw Error('Connect GRE configuration differs');
    const inside = network(String(cidrs[0]));
    if (inside.bits !== 29) throw Error('Connect inside network differs');
    const bgp = rows(config.BgpConfigurations);
    if (bgp.length !== 2) throw Error('Connect BGP session discovery incomplete');
    const endpoints = new Set<string>();
    let local: string | undefined;
    for (const session of bgp) {
      const endpoint = String(session.TransitGatewayAddress),
        ceEndpoint = String(session.PeerAddress),
        status = String(session.BgpStatus);
      const ip = (s: string) => s.split('.').reduce((n, o) => n * 256 + Number(o), 0);
      if (
        isIP(endpoint) !== 4 ||
        isIP(ceEndpoint) !== 4 ||
        endpoints.has(endpoint) ||
        endpoint === ceEndpoint ||
        session.TransitGatewayAsn !== routing.transitGatewayAsn ||
        session.PeerAsn !== routing.customerAsn ||
        !['up', 'down'].includes(status) ||
        (local !== undefined && local !== ceEndpoint) ||
        [endpoint, ceEndpoint].some((s) => ip(s) <= inside.address || ip(s) >= inside.address + 7)
      )
        throw Error('Connect BGP endpoints, ASNs or states differ');
      endpoints.add(endpoint);
      local = ceEndpoint;
      sessions.push({ peerId: selected.peerId, awsEndpoint: endpoint, ceEndpoint, status });
    }
    peerBindings.push({
      ...selected,
      mac: selected.mac.toLowerCase(),
      subnetId: nic.SubnetId,
      awsGreAddress: config.TransitGatewayAddress,
      ceEndpoint: local,
      awsEndpoints: [...endpoints].sort(),
    });
  }
  const memberships: Array<{
    tableId: string;
    prefix: string;
    status: 'active' | 'withdrawn' | 'pending';
    routes: Json[];
  }> = [];
  for (const tableId of tables) {
    const table = exactly(
      (await read(['ec2', 'describe-transit-gateway-route-tables', '--transit-gateway-route-table-ids', tableId]))
        .TransitGatewayRouteTables,
    );
    if (
      table.TransitGatewayRouteTableId !== tableId ||
      table.TransitGatewayId !== gateway ||
      table.State !== 'available'
    )
      throw Error('Connect table identity differs');
    for (const [operation, key, required, state] of [
      [
        'get-transit-gateway-route-table-associations',
        'Associations',
        routing.associations.includes(tableId),
        'associated',
      ],
      [
        'get-transit-gateway-route-table-propagations',
        'TransitGatewayRouteTablePropagations',
        routing.propagations.includes(tableId),
        'enabled',
      ],
    ] as const) {
      const found = rows((await read(['ec2', operation, '--transit-gateway-route-table-id', tableId]))[key]);
      for (const id of attachmentIds) {
        const matched = found.filter((r) => r.TransitGatewayAttachmentId === id);
        if (required && (matched.length !== 1 || matched[0].State !== state))
          throw Error('Connect retained association or propagation differs');
        if (!required && matched.some((r) => r.State === state))
          throw Error('Connect unplanned association or propagation');
      }
    }
    if (!routing.propagations.includes(tableId)) continue;
    for (const prefix of prefixes) {
      const merged = new Map<string, Json>();
      for (const filter of ['exact-match', 'subnet-of-match', 'supernet-of-match']) {
        const result = await read([
          'ec2',
          'search-transit-gateway-routes',
          '--transit-gateway-route-table-id',
          tableId,
          '--filters',
          `Name=route-search.${filter},Values=${prefix}`,
        ]);
        if (result.AdditionalRoutesAvailable !== false) throw Error('Partial Connect route search');
        const routes = rows(result.Routes),
          seen = new Set<string>();
        for (const route of routes) {
          const destination = route.DestinationCidrBlock;
          if (
            typeof destination !== 'string' ||
            !overlaps(destination, prefix) ||
            seen.has(destination) ||
            route.Type !== 'propagated' ||
            !['active', 'blackhole'].includes(String(route.State)) ||
            Object.hasOwn(route, 'PrefixListId')
          )
            throw Error('Connect route identity or inventory differs');
          seen.add(destination);
          const targets = rows(route.TransitGatewayAttachments);
          if (
            !targets.length ||
            new Set(targets.map((t) => t.TransitGatewayAttachmentId)).size !== targets.length ||
            targets.some(
              (t) => !attachmentIds.includes(String(t.TransitGatewayAttachmentId)) || t.ResourceType !== 'connect',
            )
          )
            throw Error('Foreign Connect service route');
          const normalized = {
            destination,
            type: route.Type,
            state: route.State,
            attachments: targets.map((t) => String(t.TransitGatewayAttachmentId)).sort(),
          };
          const prior = merged.get(destination);
          if (prior && canonicalSha256(prior) !== canonicalSha256(normalized))
            throw Error('Connect route changed during collection');
          merged.set(destination, normalized);
        }
      }
      const routes = [...merged.values()].sort((a, b) => String(a.destination).localeCompare(String(b.destination)));
      memberships.push({
        tableId,
        prefix,
        routes,
        status:
          routes.length === 0
            ? 'withdrawn'
            : routes.length === 1 && routes[0].destination === prefix && routes[0].state === 'active'
              ? 'active'
              : 'pending',
      });
    }
  }
  const services = {
    schemaVersion: 1,
    kind: 'aws-ce-connect-power-services',
    sourcePlanSha256: base.planSha256,
    engine: base.engine,
    accountId: base.accountId,
    region: base.region,
    transitGatewayId: gateway,
    vpcId: vpc,
    transportAttachmentId: transport,
    transportSubnets: [...transportSubnets].sort(),
    applianceMode: object(transportObject.Options).ApplianceModeSupport,
    attachments: attachmentBindings,
    peers: peerBindings,
    tables,
    associations: [...routing.associations].sort(),
    propagations: [...routing.propagations].sort(),
    prefixes,
  };
  return {
    services,
    servicesSha256: canonicalSha256(services),
    sessions,
    memberships,
    status: sessions.some((s) => s.status !== 'up')
      ? ('pending' as const)
      : memberships.every((m) => m.status === 'active')
        ? ('active' as const)
        : memberships.every((m) => m.status === 'withdrawn')
          ? ('withdrawn' as const)
          : ('pending' as const),
    traffic: 'unknown' as const,
    freshness: 'unqualified' as const,
    collectedAt: new Date().toISOString(),
  };
}
