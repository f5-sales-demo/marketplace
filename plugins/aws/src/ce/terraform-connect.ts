import { renderAwsTerraformFoundation } from './terraform-foundation';
import { siteForNode } from './topology';
import { observedConnectCidrs } from './transport-routes';
import type { AwsCeObservation, AwsCePlan } from './types';

const ref = (address: string) => `\${${address}}`;
type Json = Record<string, unknown>;

/** Append owned TGW Connect resources after all selected sites have been admitted. */
export function renderAwsTerraformConnect(
  plan: AwsCePlan,
  observation: AwsCeObservation,
  bootstrapByNode: Record<string, string>,
): string {
  const config = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  if (intent.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect rendering requires the TGW Connect profile');
  if (Object.keys(bootstrapByNode).length !== intent.topology.nodeCount)
    throw new Error('Admit every selected node before creating Connect peers');
  if (intent.routing.transportAttachmentId || (intent.routes ?? []).length)
    throw new Error('Terraform brownfield transport and route restoration require explicit lifecycle translation');
  if (
    !intent.routing.transitGatewayId ||
    !/^tgw-[0-9a-f]{8,17}$/.test(intent.routing.transitGatewayId) ||
    (intent.routing.associations ?? []).length > 1
  )
    throw new Error('Terraform Connect requires one gateway and at most one association per attachment');
  if (
    !Number.isInteger(intent.routing.customerAsn) ||
    (intent.routing.customerAsn ?? 0) < 1 ||
    (intent.routing.customerAsn ?? 0) > 4294967295 ||
    intent.routing.customerAsn === intent.routing.transitGatewayAsn
  )
    throw new Error('Terraform Connect customer ASN is invalid');
  const cidrs = observedConnectCidrs(intent, observation);
  const peers =
    intent.routing.connectPeers ??
    (intent.routing.insideCidrs ?? []).map((insideCidr, index) => ({
      node: index + 1,
      insideCidr,
      transportInterfaceIndex: 1,
      transitGatewayAddress: undefined,
    }));
  if (!peers.length) throw new Error('Terraform Connect peer topology is missing');
  const resource = config.resource as Record<string, Record<string, Json>>;
  const add = (type: string, name: string, value: Json) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags as Json;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: [
      ...new Map(
        intent.interfaces[1].subnets.map((subnet, index) => [
          subnet.availabilityZone,
          ref(`aws_subnet.node_${index + 1}_nic_1.id`),
        ]),
      ).values(),
    ],
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  const tables = (attachment: string, name: string) => {
    for (const [index, table] of (intent.routing.associations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_association', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
    for (const [index, table] of (intent.routing.propagations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_propagation', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
  };
  tables(ref('aws_ec2_transit_gateway_vpc_attachment.transport.id'), 'transport');
  for (const role of [...new Set(peers.map((peer) => peer.transportInterfaceIndex))]) {
    if (![0, 1].includes(role)) throw new Error('Unsupported Terraform GRE transport interface');
    const routeTable = role === 0 ? 'slo' : 'sli_transport';
    if (role === 1) {
      add('aws_route_table', routeTable, { vpc_id: ref('aws_vpc.ce.id'), tags });
      for (let node = 1; node <= intent.topology.nodeCount; node++)
        add('aws_route_table_association', `transport_node_${node}`, {
          subnet_id: ref(`aws_subnet.node_${node}_nic_1.id`),
          route_table_id: ref(`aws_route_table.${routeTable}.id`),
        });
    }
    for (const [index, cidr] of cidrs.entries())
      add('aws_route', `gre_${role}_${index}`, {
        route_table_id: ref(`aws_route_table.${routeTable}.id`),
        destination_cidr_block: cidr,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  const counts = new Map<number, number>();
  const groups = peers.map((peer) => {
    const index = counts.get(peer.transportInterfaceIndex) ?? 0;
    counts.set(peer.transportInterfaceIndex, index + 1);
    return `role_${peer.transportInterfaceIndex}_${Math.floor(index / 4) + 1}`;
  });
  for (const group of new Set(groups)) {
    add('aws_ec2_transit_gateway_connect', group, {
      protocol: 'gre',
      transit_gateway_id: intent.routing.transitGatewayId,
      transport_attachment_id: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_default_route_table_association: false,
      transit_gateway_default_route_table_propagation: false,
      tags,
    });
    tables(ref(`aws_ec2_transit_gateway_connect.${group}.id`), group);
  }
  const peerOutputs: Json = {};
  for (const [index, peer] of peers.entries()) {
    const name = `peer_${index + 1}`;
    add('aws_ec2_transit_gateway_connect_peer', name, {
      transit_gateway_attachment_id: ref(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      peer_address: ref(`aws_network_interface.node_${peer.node}_nic_${peer.transportInterfaceIndex}.private_ip`),
      bgp_asn: String(intent.routing.customerAsn),
      inside_cidr_blocks: [peer.insideCidr],
      ...(peer.transitGatewayAddress ? { transit_gateway_address: peer.transitGatewayAddress } : {}),
      tags: {
        ...tags,
        'ves-io-site-name': siteForNode(intent, peer.node).name,
        'xcsh-node-index': String(peer.node),
        'xcsh-connect-peer-index': String(index + 1),
      },
    });
    peerOutputs[String(index + 1)] = {
      id: ref(`aws_ec2_transit_gateway_connect_peer.${name}.id`),
      attachment_id: ref(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      node: peer.node,
      transport_interface_index: peer.transportInterfaceIndex,
      transit_gateway_address: ref(`aws_ec2_transit_gateway_connect_peer.${name}.transit_gateway_address`),
      bgp_peer_address: ref(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_peer_address`),
      bgp_transit_gateway_addresses: ref(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_transit_gateway_addresses`),
    };
  }
  config.output.ce_connect_peers = { value: peerOutputs };
  config.output.ce_transport_attachment = { value: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  return JSON.stringify(config);
}
