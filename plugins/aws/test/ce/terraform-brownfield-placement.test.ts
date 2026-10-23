import { expect, it } from 'bun:test';
import { verifyAwsCePlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { qualifyAwsTerraformBrownfieldPlacement } from '../../src/ce/terraform-brownfield-placement';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { brownfieldPlacementFixture } from './terraform-brownfield-fixture';

const records = (value: unknown) => value as Array<Record<string, unknown>>;

it('places owned foundation resources in qualified existing subnets without managing existing network resources', () => {
  const { plan, observation } = brownfieldPlacementFixture();
  const binding = qualifyAwsTerraformBrownfieldPlacement(plan, observation);
  const network = JSON.parse(renderAwsTerraformFoundation(plan, {}, binding));
  for (const type of [
    'aws_vpc',
    'aws_subnet',
    'aws_internet_gateway',
    'aws_route_table',
    'aws_route',
    'aws_route_table_association',
  ])
    expect(network.resource[type]).toBeUndefined();
  expect(network.resource.aws_security_group.group_0.vpc_id).toBe('vpc-12345678');
  expect(network.resource.aws_network_interface.node_1_nic_0.subnet_id).toBe('subnet-12345678');
  expect(network.resource.aws_network_interface.node_1_nic_1.subnet_id).toBe('subnet-23456789');
  expect(network.output.ce_vpc_id.value).toBe('vpc-12345678');
  expect(network.output.ce_interfaces.value['1:0'].subnet_id).toBe('subnet-12345678');
  const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-only\n';
  const admitted = JSON.parse(renderAwsTerraformFoundation(plan, { 1: bootstrap }, binding));
  expect(admitted.resource.aws_instance.node_1.depends_on).toEqual([
    'aws_network_interface.node_1_nic_0',
    'aws_network_interface.node_1_nic_1',
  ]);
});
it('requires a qualified immutable placement before rendering a brownfield foundation', () => {
  const { plan, observation } = brownfieldPlacementFixture();
  expect(() => renderAwsTerraformFoundation(plan)).toThrow('placement');
  const binding = qualifyAwsTerraformBrownfieldPlacement(plan, observation);
  binding.vpcId = 'vpc-23456789';
  expect(() => renderAwsTerraformFoundation(plan, {}, binding)).toThrow();
});
for (const kind of [
  'account',
  'profile',
  'missing',
  'duplicate',
  'owner',
  'vpc',
  'zone',
  'snapshot',
  'management-route',
  'gateway',
  'association',
] as const)
  it(`rejects ${kind} placement evidence`, () => {
    const { plan, observation } = brownfieldPlacementFixture();
    if (kind === 'account') observation.identity.accountId = '000000000000';
    if (kind === 'profile') observation.identity.awsProfile = 'foreign-profile';
    if (kind === 'missing') observation.resources.shift();
    if (kind === 'duplicate') observation.resources.push(observation.resources[0]);
    const state = records(observation.resources[1]?.state.Subnets)[0];
    if (kind === 'owner') state.OwnerId = '000000000000';
    if (kind === 'vpc') state.VpcId = 'vpc-23456789';
    if (kind === 'zone') state.AvailabilityZone = 'us-east-1b';
    if (kind === 'snapshot') state.CidrBlock = '10.0.9.0/24';
    if (kind === 'management-route')
      records(records(observation.resources[3].state.RouteTables)[0].Routes)[1].State = 'blackhole';
    if (kind === 'gateway') records(observation.resources[5].state.InternetGateways)[0].Attachments = [];
    if (kind === 'association')
      records(records(observation.resources[3].state.RouteTables)[0].Associations).push({
        SubnetId: 'subnet-12345678',
        Main: false,
        AssociationState: { State: 'associated' },
      });
    verifyAwsCePlan(plan);
    expect(() => qualifyAwsTerraformBrownfieldPlacement(plan, observation)).toThrow(/Brownfield placement/);
  });

it('qualification is deterministic, rejects malformed state and never widens HA placement', () => {
  const { plan, observation } = brownfieldPlacementFixture();
  expect(qualifyAwsTerraformBrownfieldPlacement(plan, observation)).toEqual(
    qualifyAwsTerraformBrownfieldPlacement(plan, observation),
  );
  observation.resources[0].state.Vpcs = null;
  expect(() => qualifyAwsTerraformBrownfieldPlacement(plan, observation)).toThrow('placement evidence');
  const { planId: _id, planSha256: _sha, ...draft } = brownfieldPlacementFixture().plan;
  draft.intent.topology.nodeCount = 3;
  const planSha256 = canonicalSha256(draft);
  expect(() =>
    qualifyAwsTerraformBrownfieldPlacement(
      { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` },
      brownfieldPlacementFixture().observation,
    ),
  ).toThrow('single-node');
});

it('rejects partial evidence even when the selected resource is present', () => {
  const { plan, observation } = brownfieldPlacementFixture();
  observation.resources[0].state.NextToken = 'opaque-next-page';
  expect(() => qualifyAwsTerraformBrownfieldPlacement(plan, observation)).toThrow('Partial');
});
it('an immutable blackhole baseline does not establish usable management egress', () => {
  const { plan, observation } = brownfieldPlacementFixture();
  records(records(observation.resources[3].state.RouteTables)[0].Routes)[1].State = 'blackhole';
  const { planId: _id, planSha256: _sha, ...draft } = plan;
  draft.rollback.resources[3].before = structuredClone(observation.resources[3].state);
  const planSha256 = canonicalSha256(draft);
  const current = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  verifyAwsCePlan(current);
  expect(() => qualifyAwsTerraformBrownfieldPlacement(current, observation)).toThrow('management egress');
});

for (const indexes of [
  [1, 0],
  [0, 0],
  [0, 2],
])
  it(`rejects digest-valid placement with interface indexes ${indexes.join(',')}`, () => {
    const { plan, observation } = brownfieldPlacementFixture();
    const { planId: _id, planSha256: _sha, ...draft } = plan;
    draft.intent.interfaces = draft.intent.interfaces.map((item, index) => ({ ...item, index: indexes[index] }));
    const planSha256 = canonicalSha256(draft);
    const current = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
    verifyAwsCePlan(current);
    expect(() => qualifyAwsTerraformBrownfieldPlacement(current, observation)).toThrow('single-node');
  });
