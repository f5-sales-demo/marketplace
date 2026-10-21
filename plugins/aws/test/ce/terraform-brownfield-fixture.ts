import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsCeObservation, AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

export function brownfieldPlacementFixture() {
  const source = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = source;
  const vpcId = 'vpc-12345678';
  const subnetIds = ['subnet-12345678', 'subnet-23456789'];
  const tableIds = ['rtb-12345678', 'rtb-23456789'];
  const gatewayId = 'igw-12345678';
  const resources = [
    {
      id: vpcId,
      state: { Vpcs: [{ VpcId: vpcId, OwnerId: '123456789012', State: 'available', CidrBlock: '10.0.0.0/16' }] },
    },
    ...subnetIds.map((id, index) => ({
      id,
      state: {
        Subnets: [
          {
            SubnetId: id,
            VpcId: vpcId,
            OwnerId: '123456789012',
            State: 'available',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: `10.0.${index + 1}.0/24`,
          },
        ],
      },
    })),
    ...tableIds.map((id, index) => ({
      id,
      state: {
        RouteTables: [
          {
            RouteTableId: id,
            VpcId: vpcId,
            OwnerId: '123456789012',
            Associations: [{ SubnetId: subnetIds[index], Main: false, AssociationState: { State: 'associated' } }],
            Routes: [
              { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local', State: 'active', Origin: 'CreateRouteTable' },
              ...(index
                ? []
                : [
                    { DestinationCidrBlock: '0.0.0.0/0', GatewayId: gatewayId, State: 'active', Origin: 'CreateRoute' },
                  ]),
            ],
          },
        ],
      },
    })),
    {
      id: gatewayId,
      state: {
        InternetGateways: [
          {
            InternetGatewayId: gatewayId,
            OwnerId: '123456789012',
            Attachments: [{ VpcId: vpcId, State: 'available' }],
          },
        ],
      },
    },
  ].map((r) => ({ ...r, region: 'us-east-1', exists: true, owned: false, tags: {} }));
  draft.intent = {
    ...draft.intent,
    vpc: { mode: 'brownfield', vpcId, cidr: '10.0.0.0/16' },
    topology: { nodeCount: 1, sites: [{ name: 'site', nodeIndexes: [1] }] },
    routing: { profile: 'direct-eni' },
    routes: [],
    brownfield: { resourceIds: resources.map((r) => r.id), routeTableIds: tableIds, transitGatewayRouteTableIds: [] },
  };
  draft.intent.interfaces = draft.intent.interfaces.map((i, index) => ({
    ...i,
    subnets: [{ availabilityZone: 'us-east-1a', subnetId: subnetIds[index], cidr: `10.0.${index + 1}.0/24` }],
  }));
  draft.intent.partition = 'aws';
  draft.rollback = { resources: resources.map((r) => ({ id: r.id, before: r.state })) };
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const observation = {
    identity: { accountId: '123456789012', partition: 'aws', awsProfile: 'ce-profile' },
    resources: structuredClone(resources),
  } as unknown as AwsCeObservation;
  return { plan, observation };
}
