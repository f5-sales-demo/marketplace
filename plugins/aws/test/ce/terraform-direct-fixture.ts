import { canonicalSha256 } from '../../src/ce/canonical';
import { powerIdentityFixture } from './whole-site-power-fixtures';

export function directOwnershipFixture() {
  const f = powerIdentityFixture('terraform');
  const table = {
    RouteTableId: 'rtb-12345678',
    OwnerId: f.base.accountId,
    VpcId: 'vpc-12345678',
    Associations: [{ SubnetId: 'subnet-33333333', Main: false, AssociationState: { State: 'associated' } }],
    Routes: [
      { DestinationCidrBlock: '192.0.2.0/24', GatewayId: 'igw-12345678', State: 'active', Origin: 'CreateRoute' },
      { DestinationCidrBlock: '10.0.0.0/16', GatewayId: 'local', State: 'active', Origin: 'CreateRouteTable' },
    ],
  };
  const { planId: _id, planSha256: _sha, ...body } = f.base;
  body.intent = {
    ...body.intent,
    routing: { ...body.intent.routing, profile: 'direct-eni' },
    routes: [{ routeTableId: 'rtb-12345678', destinationCidr: '192.0.2.0/24', node: 1 }],
    brownfield: { ...body.intent.brownfield, routeTableIds: ['rtb-12345678'] },
  };
  body.routing = body.intent.routing;
  body.rollback = { resources: [{ id: 'rtb-12345678', before: { RouteTables: [structuredClone(table)] } }] };
  const sha = canonicalSha256(body);
  const base = { ...body, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha };
  const enis = f.enis.map((eni, index) => ({
    ...eni,
    VpcId: 'vpc-12345678',
    SubnetId: index ? 'subnet-22222222' : 'subnet-11111111',
    SourceDestCheck: false,
    TagSet: eni.TagSet.map((tag) => (tag.Key === 'xcsh-plan-sha256' ? { ...tag, Value: sha } : tag)),
  }));
  const calls: string[][] = [];
  let tableReads = 0;
  let driftAfter = false;
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[1] === 'describe-route-tables' && ++tableReads === 2 && driftAfter) table.VpcId = 'vpc-ffffffff';
      const response =
        args[0] === 'sts'
          ? { Account: base.accountId }
          : args[1] === 'describe-network-interfaces'
            ? { NetworkInterfaces: enis }
            : { RouteTables: [table] };
      return { exitCode: 0, stdout: JSON.stringify(response), stderr: '' };
    },
  };
  return {
    base,
    enis,
    table,
    calls,
    api,
    values: f.resolved,
    drift: () => {
      driftAfter = true;
    },
  };
}
