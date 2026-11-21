import { staticAzRoutes } from './static-routing';
import { renderAwsTerraformFoundation } from './terraform-foundation';
import type { AwsCePlan } from './types';

const ref = (value: string) => `\${${value}}`;
type Json = Record<string, any>;

/** Static attachments and routes remain owned by the foundation's isolated Terraform state. */
export function renderAwsTerraformStatic(plan: AwsCePlan, bootstrapByNode: Record<string, string> = {}): string {
  const config: Json = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  const routes = staticAzRoutes(intent);
  if (
    intent.routing.profile !== 'tgw-static' ||
    !routes.length ||
    !intent.routing.transitGatewayId ||
    intent.routing.transportAttachmentId ||
    intent.routes.length ||
    intent.routing.associations.length > 1
  )
    throw new Error(
      'Terraform static TGW requires dedicated per-AZ route tables and one owned attachment; brownfield route replacement is unavailable',
    );
  const resource = config.resource;
  const add = (type: string, name: string, value: Json) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: routes.map((route) => ref(`aws_subnet.node_${route.node}_nic_1.id`)),
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  for (const [index, table] of intent.routing.associations.entries())
    add('aws_ec2_transit_gateway_route_table_association', `static_${index}`, {
      transit_gateway_attachment_id: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  for (const [index, table] of intent.routing.propagations.entries())
    add('aws_ec2_transit_gateway_route_table_propagation', `static_${index}`, {
      transit_gateway_attachment_id: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  if (!intent.routing.transitGatewayRouteTableId || !intent.routing.destinationCidrs.length)
    throw new Error('Terraform static TGW requires an exact service route table and destinations');
  for (const [index, prefix] of intent.routing.destinationCidrs.entries())
    add('aws_ec2_transit_gateway_route', `static_${index}`, {
      destination_cidr_block: prefix,
      transit_gateway_attachment_id: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: intent.routing.transitGatewayRouteTableId,
    });
  for (const route of routes) {
    for (const [index, prefix] of route.forwardCidrs.entries())
      add('aws_route', `static_forward_${route.node}_${index}`, {
        route_table_id: ref(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        network_interface_id: ref(`aws_network_interface.node_${route.node}_nic_1.id`),
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
    for (const [index, prefix] of route.returnCidrs.entries())
      add('aws_route', `static_return_${route.node}_${index}`, {
        route_table_id: ref(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  config.output.ce_transport_attachment = { value: ref('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  config.output.ce_static_route_tables = {
    value: Object.fromEntries(
      routes.map((route) => [String(route.node), ref(`aws_route_table.static_${route.node}.id`)]),
    ),
  };
  return JSON.stringify(config);
}

export function bindTerraformStaticRouting(plan: AwsCePlan, outputs: Record<string, unknown>) {
  const tables = outputs.ce_static_route_tables;
  if (
    !tables ||
    typeof tables !== 'object' ||
    Array.isArray(tables) ||
    !/^tgw-attach-[0-9a-f]{8,21}$/.test(String(outputs.ce_transport_attachment)) ||
    Object.keys(tables).length !== plan.topology.nodeCount ||
    !/^vpc-[0-9a-f]{8,21}$/.test(String(outputs.ce_vpc_id))
  )
    throw new Error('Terraform static routing output is incomplete');
  const values: Record<string, string> = {
    __TGW_TRANSPORT_ATTACHMENT__: String(outputs.ce_transport_attachment),
    __VPC_ID__: String(outputs.ce_vpc_id),
  };
  for (const route of staticAzRoutes(plan.intent)) {
    const table = (tables as Record<string, unknown>)[String(route.node)];
    if (typeof table !== 'string' || !/^rtb-[0-9a-f]{8,21}$/.test(table) || Object.values(values).includes(table))
      throw new Error('Terraform static routing table identity is missing or duplicated');
    values[`__STATIC_ROUTE_TABLE_${route.node}__`] = table;
  }
  return values;
}
