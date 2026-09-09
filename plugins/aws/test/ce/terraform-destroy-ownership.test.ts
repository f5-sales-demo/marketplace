import { expect, it } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { verifyAwsTerraformDestroyOwnership } from '../../src/ce/terraform-destroy-ownership';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const plan = foundationPlan();
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  }).map(([Key, Value]) => ({ Key, Value }));
  const values: Record<string, any> = {
    'aws_vpc.ce': { id: 'vpc-12345678', region: plan.intent.region },
    'aws_subnet.ce': { id: 'subnet-12345678', region: plan.intent.region },
    'aws_route_table.ce': { id: 'rtb-12345678', region: plan.intent.region },
    'aws_internet_gateway.ce': { id: 'igw-12345678', region: plan.intent.region },
    'aws_route.internet': {
      id: 'route-fixture',
      region: plan.intent.region,
      route_table_id: 'rtb-12345678',
      destination_cidr_block: '0.0.0.0/0',
      destination_ipv6_cidr_block: '',
      destination_prefix_list_id: '',
      gateway_id: 'igw-12345678',
      transit_gateway_id: '',
    },
    'aws_route_table_association.ce': {
      id: 'rtbassoc-12345678',
      region: plan.intent.region,
      route_table_id: 'rtb-12345678',
      subnet_id: 'subnet-12345678',
      gateway_id: '',
    },
  };
  const responses: Record<string, any> = {
    'get-caller-identity': { Account: plan.intent.accountId },
    'describe-vpcs': { Vpcs: [{ VpcId: values['aws_vpc.ce'].id, Tags: tags }] },
    'describe-subnets': { Subnets: [{ SubnetId: values['aws_subnet.ce'].id, Tags: tags }] },
    'describe-internet-gateways': {
      InternetGateways: [{ InternetGatewayId: values['aws_internet_gateway.ce'].id, Tags: tags }],
    },
    'describe-route-tables': {
      RouteTables: [
        {
          RouteTableId: values['aws_route_table.ce'].id,
          Tags: tags,
          Routes: [{ DestinationCidrBlock: '0.0.0.0/0', GatewayId: values['aws_internet_gateway.ce'].id }],
          Associations: [
            {
              RouteTableAssociationId: values['aws_route_table_association.ce'].id,
              SubnetId: values['aws_subnet.ce'].id,
              RouteTableId: values['aws_route_table.ce'].id,
            },
          ],
        },
      ],
    },
  };
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: plan.intent.deploymentName,
    backendIdentity: `local:${plan.intent.deploymentName}`,
    planSha256: 'd'.repeat(64),
    configurationSha256: 'c'.repeat(64),
    operation: 'destroy',
    noChanges: false,
    changes: Object.keys(values).map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
  } as PlanReceipt;
  const session = {
    readPlannedResourceFields: async (_r: unknown, selection: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(selection).map(([address, fields]) => [
          address,
          Object.fromEntries(fields.map((field) => [field, values[address][field]])),
        ]),
      ),
  } as unknown as TerraformSession;
  let calls = 0;
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls++;
      expect(args[args.indexOf('--profile') + 1]).toBe(plan.intent.awsProfile);
      expect(args[args.indexOf('--region') + 1]).toBe(plan.intent.region);
      return { exitCode: 0, stdout: JSON.stringify(responses[args[1]]), stderr: '' };
    },
  };
  return { plan, values, receipt, session, responses, api, calls: () => calls };
}

it('verifies tagged resources and exact owned route/subnet relationships without mutation', async () => {
  const f = fixture();
  const proof = await verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {});
  expect(proof.resourceCount).toBe(6);
  expect(proof.terraformPlanSha256).toBe(f.receipt.planSha256);
  expect(f.calls()).toBe(5);
});

for (const change of [
  (f: ReturnType<typeof fixture>) => {
    f.responses['get-caller-identity'].Account = '000000000000';
  },
  (f: ReturnType<typeof fixture>) => {
    f.responses['describe-vpcs'].NextToken = 'more';
  },
  (f: ReturnType<typeof fixture>) => {
    f.responses['describe-vpcs'].Vpcs[0].Tags = [];
  },
  (f: ReturnType<typeof fixture>) => {
    f.values['aws_route.internet'].route_table_id = 'rtb-87654321';
  },
  (f: ReturnType<typeof fixture>) => {
    f.values['aws_route.internet'].region = 'us-west-2';
  },
  (f: ReturnType<typeof fixture>) => {
    f.responses['describe-route-tables'].RouteTables[0].Routes[0].GatewayId = 'igw-87654321';
  },
  (f: ReturnType<typeof fixture>) => {
    f.responses['describe-route-tables'].RouteTables[0].Associations[0].SubnetId = 'subnet-87654321';
  },
  (f: ReturnType<typeof fixture>) => {
    f.receipt.changes[0].actions = ['delete', 'create'];
  },
])
  it('rejects forged, partial, foreign, or non-destroy observations', async () => {
    const f = fixture();
    change(f);
    await expect(verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).rejects.toThrow();
  });

it('checks computed EIP instance binding and refuses foreign attached volumes', async () => {
  const f = fixture();
  const region = f.plan.intent.region;
  Object.assign(f.values, {
    'aws_instance.ce': { id: 'i-12345678', region },
    'aws_network_interface.ce': { id: 'eni-12345678', region },
    'aws_eip.ce': { id: 'eipalloc-12345678', region },
    'aws_eip_association.ce': {
      id: 'eipassoc-12345678',
      region,
      allocation_id: 'eipalloc-12345678',
      network_interface_id: 'eni-12345678',
      instance_id: 'i-12345678',
    },
  });
  const tags = f.responses['describe-vpcs'].Vpcs[0].Tags;
  Object.assign(f.responses, {
    'describe-instances': {
      Reservations: [
        {
          Instances: [
            {
              InstanceId: 'i-12345678',
              Tags: tags,
              NetworkInterfaces: [{ NetworkInterfaceId: 'eni-12345678' }],
              BlockDeviceMappings: [{ Ebs: { VolumeId: 'vol-12345678' } }],
            },
          ],
        },
      ],
    },
    'describe-network-interfaces': { NetworkInterfaces: [{ NetworkInterfaceId: 'eni-12345678', TagSet: tags }] },
    'describe-addresses': {
      Addresses: [
        {
          AllocationId: 'eipalloc-12345678',
          AssociationId: 'eipassoc-12345678',
          NetworkInterfaceId: 'eni-12345678',
          InstanceId: 'i-12345678',
          Tags: tags,
        },
      ],
    },
    'describe-volumes': { Volumes: [{ VolumeId: 'vol-12345678', Tags: tags }] },
  });
  f.receipt.changes = Object.keys(f.values).map((address) => ({
    address,
    type: address.split('.')[0],
    actions: ['delete'],
  }));
  expect((await verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).attachedVolumeCount).toBe(
    1,
  );
  f.responses['describe-volumes'].Volumes[0].Tags = [];
  await expect(verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).rejects.toThrow(/foreign/);
});

it('binds NLB, listener, target group and admitted IP targets to owned resources', async () => {
  const f = fixture();
  const region = f.plan.intent.region;
  f.plan.intent.ingress = { mode: 'nlb', port: 8443, scheme: 'internal' };
  const { planId: _id, planSha256: _hash, ...draft } = f.plan;
  f.plan.planSha256 = canonicalSha256(draft);
  f.plan.planId = `aws-ce-${f.plan.planSha256.slice(0, 24)}`;
  const tags = f.responses['describe-vpcs'].Vpcs[0].Tags;
  tags.find((tag: { Key: string }) => tag.Key === 'xcsh-plan-sha256').Value = f.plan.planSha256;
  const lb = `arn:aws:elasticloadbalancing:${region}:${f.plan.intent.accountId}:loadbalancer/net/ce-nlb/abcdef12`;
  const group = `arn:aws:elasticloadbalancing:${region}:${f.plan.intent.accountId}:targetgroup/ce/abcdef12`;
  const listener = `arn:aws:elasticloadbalancing:${region}:${f.plan.intent.accountId}:listener/net/ce-nlb/abcdef12/abcdef12`;
  Object.assign(f.values, {
    'aws_network_interface.ce': { id: 'eni-12345678', region },
    'aws_lb.ce': { id: lb, region },
    'aws_lb_target_group.ce': { id: group, region },
    'aws_lb_listener.ce': { id: listener, region },
    'aws_lb_target_group_attachment.ce': {
      id: `${group}-10.0.1.10-8443`,
      region,
      target_group_arn: group,
      target_id: '10.0.1.10',
      port: 8443,
    },
  });
  Object.assign(f.responses, {
    'describe-network-interfaces': {
      NetworkInterfaces: [{ NetworkInterfaceId: 'eni-12345678', PrivateIpAddress: '10.0.1.10', TagSet: tags }],
    },
    'describe-load-balancers': {
      LoadBalancers: [{ LoadBalancerArn: lb, VpcId: 'vpc-12345678', Type: 'network', Scheme: 'internal' }],
    },
    'describe-target-groups': {
      TargetGroups: [{ TargetGroupArn: group, VpcId: 'vpc-12345678', Protocol: 'TCP', Port: 8443 }],
    },
    'describe-listeners': {
      Listeners: [
        {
          ListenerArn: listener,
          LoadBalancerArn: lb,
          Protocol: 'TCP',
          Port: 8443,
          DefaultActions: [{ Type: 'forward', TargetGroupArn: group }],
        },
      ],
    },
    'describe-tags': {
      TagDescriptions: [lb, group, listener].map((ResourceArn) => ({ ResourceArn, Tags: tags })),
    },
    'describe-target-health': {
      TargetHealthDescriptions: [{ Target: { Id: '10.0.1.10', Port: 8443 }, TargetHealth: { State: 'healthy' } }],
    },
  });
  const exec = f.api.exec;
  f.api.exec = async (command: string, args: string[]) => {
    if (args[1] !== 'describe-tags') return exec(command, args);
    const requested = args.slice(args.indexOf('--resource-arns') + 1, args.indexOf('--region'));
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        TagDescriptions: requested.map((ResourceArn) => ({ ResourceArn, Tags: tags })),
      }),
      stderr: '',
    };
  };
  f.receipt.changes = Object.keys(f.values).map((address) => ({
    address,
    type: address.split('.')[0],
    actions: ['delete'],
  }));
  const proof = await verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {});
  expect(proof.inventory.resources).toEqual(
    expect.arrayContaining([
      { type: 'aws_lb', id: lb },
      { type: 'aws_lb_target_group', id: group },
      { type: 'aws_lb_listener', id: listener },
    ]),
  );
  f.responses['describe-listeners'].Listeners[0].Port = 443;
  await expect(verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).rejects.toThrow(
    /topology differs/,
  );
});

it('binds approved TGW table edges to owned attachments and rejects an omitted propagation', async () => {
  const f = fixture();
  const region = f.plan.intent.region;
  f.plan.intent.routing.transitGatewayId = 'tgw-12345678';
  f.plan.intent.routing.associations = ['tgw-rtb-12345678'];
  f.plan.intent.routing.propagations = ['tgw-rtb-12345678'];
  const { planId: _id, planSha256: _hash, ...draft } = f.plan;
  f.plan.planSha256 = canonicalSha256(draft);
  f.plan.planId = `aws-ce-${f.plan.planSha256.slice(0, 24)}`;
  const tags = f.responses['describe-vpcs'].Vpcs[0].Tags;
  tags.find((tag: { Key: string }) => tag.Key === 'xcsh-plan-sha256').Value = f.plan.planSha256;
  const edge = {
    transit_gateway_attachment_id: 'tgw-attach-12345678',
    transit_gateway_route_table_id: 'tgw-rtb-12345678',
    region,
  };
  Object.assign(f.values, {
    'aws_ec2_transit_gateway_connect.ce': { id: 'tgw-attach-12345678', region },
    'aws_ec2_transit_gateway_route_table_association.ce': { ...edge, id: 'association-fixture' },
    'aws_ec2_transit_gateway_route_table_propagation.ce': { ...edge, id: 'propagation-fixture' },
  });
  Object.assign(f.responses, {
    'describe-transit-gateway-connects': {
      TransitGatewayConnects: [{ TransitGatewayAttachmentId: 'tgw-attach-12345678', Tags: tags }],
    },
    'describe-transit-gateways': {
      TransitGateways: [{ TransitGatewayId: 'tgw-12345678', OwnerId: f.plan.intent.accountId }],
    },
    'describe-transit-gateway-route-tables': {
      TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: 'tgw-rtb-12345678', TransitGatewayId: 'tgw-12345678' }],
    },
    'get-transit-gateway-route-table-associations': {
      Associations: [{ TransitGatewayAttachmentId: 'tgw-attach-12345678' }],
    },
    'get-transit-gateway-route-table-propagations': {
      TransitGatewayRouteTablePropagations: [{ TransitGatewayAttachmentId: 'tgw-attach-12345678' }],
    },
  });
  f.receipt.changes = Object.keys(f.values).map((address) => ({
    address,
    type: address.split('.')[0],
    actions: ['delete'],
  }));
  expect((await verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).resourceCount).toBe(9);
  f.responses['get-transit-gateway-route-table-propagations'].TransitGatewayRouteTablePropagations = [];
  await expect(verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).rejects.toThrow(
    /absent or ambiguous/,
  );
});

it('captures exact resources and parent edges for independent post-destroy inventory', async () => {
  const f = fixture();
  const proof = await verifyAwsTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {});
  expect(proof.inventory.resources).toEqual([
    { type: 'aws_vpc', id: 'vpc-12345678' },
    { type: 'aws_subnet', id: 'subnet-12345678' },
    { type: 'aws_route_table', id: 'rtb-12345678' },
    { type: 'aws_internet_gateway', id: 'igw-12345678' },
  ]);
  expect(proof.inventory.tgwEdges).toEqual([]);
  const { sha256, ...material } = proof.inventory;
  expect(sha256).toBe(canonicalSha256(material));
});
