import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { routeNode, staticAzRoutes } from '../../src/ce/static-routing';
import { bindTerraformStaticRouting, renderAwsTerraformStatic } from '../../src/ce/terraform-static';
import { foundationPlan } from './terraform-fixtures';

function staticPlan() {
  const plan = foundationPlan();
  plan.topology = { nodeCount: 3, availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'] };
  plan.routing = plan.intent.routing = {
    profile: 'tgw-static',
    transitGatewayId: 'tgw-12345678',
    transitGatewayRouteTableId: 'tgw-rtb-12345678',
    destinationCidrs: ['10.200.0.0/16'],
    associations: ['tgw-rtb-12345678'],
    propagations: [],
    staticAzRoutes: [1, 2, 3].map((node) => ({
      node,
      availabilityZone: `us-east-1${['a', 'b', 'c'][node - 1]}`,
      forwardCidrs: ['10.200.0.0/16'],
      returnCidrs: ['10.210.0.0/16'],
    })),
  };
  plan.intent.routes = [];
  const { planId: _, planSha256: __, ...draft } = plan;
  plan.planSha256 = canonicalSha256(draft);
  plan.planId = `aws-ce-${plan.planSha256.slice(0, 24)}`;
  return plan;
}

test('static Terraform routes use each approved AZ SLI and explicit TGW return path', () => {
  const plan = staticPlan();
  const config = JSON.parse(renderAwsTerraformStatic(plan));
  expect(config.resource.aws_ec2_transit_gateway_vpc_attachment.transport.appliance_mode_support).toBe('enable');
  for (const node of [1, 2, 3]) {
    expect(config.resource.aws_route[`static_forward_${node}_0`].network_interface_id).toBe(
      `\${aws_network_interface.node_${node}_nic_1.id}`,
    );
    expect(config.resource.aws_route[`static_return_${node}_0`].transit_gateway_id).toBe('tgw-12345678');
    expect(config.resource.aws_route_table_association[`node_${node}_nic_1`].route_table_id).toBe(
      `\${aws_route_table.static_${node}.id}`,
    );
  }
});

test('static routing rejects implicit node 1, wrong AZs and overlapping directions', () => {
  const plan = staticPlan();
  expect(() => routeNode(plan.intent, { routeTableId: 'rtb-12345678', destinationCidr: '10.200.0.0/16' })).toThrow(
    'explicit',
  );
  plan.intent.routing.staticAzRoutes![1].availabilityZone = 'us-east-1a';
  expect(() => staticAzRoutes(plan.intent)).toThrow('AZ');
  plan.intent.routing.staticAzRoutes![1].availabilityZone = 'us-east-1b';
  plan.intent.routing.staticAzRoutes![1].returnCidrs = ['10.200.1.0/24'];
  expect(() => staticAzRoutes(plan.intent)).toThrow('overlap');
});

test('static state locators require every unique per-AZ route table', () => {
  const plan = staticPlan();
  const output = {
    ce_vpc_id: 'vpc-12345678',
    ce_transport_attachment: 'tgw-attach-12345678',
    ce_static_route_tables: { '1': 'rtb-11111111', '2': 'rtb-22222222', '3': 'rtb-33333333' },
  };
  expect(bindTerraformStaticRouting(plan, output).__STATIC_ROUTE_TABLE_2__).toBe('rtb-22222222');
  output.ce_static_route_tables['3'] = output.ce_static_route_tables['1'];
  expect(() => bindTerraformStaticRouting(plan, output)).toThrow('duplicated');
});
