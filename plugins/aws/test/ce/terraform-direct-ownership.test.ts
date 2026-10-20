import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsTerraformDirectRouteOwnership } from '../../src/ce/terraform-direct-ownership';
import { powerIdentityFixture } from './whole-site-power-fixtures';

function fixture() {
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
test('original direct route inventory binds current ENIs and immutable rollback without mutating cloud', async () => {
  const f = fixture();
  const result = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
  expect(result.routes).toEqual([
    {
      address: 'aws_route.direct_0',
      routeTableId: 'rtb-12345678',
      destinationCidr: '192.0.2.0/24',
      networkInterfaceId: f.values.__ENI_1_1__,
      originalTarget: { field: 'gateway_id', id: 'igw-12345678' },
    },
  ]);
  expect(result.sloSubnetId).toBe('subnet-11111111');
  expect(result.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(f.calls.every((args) => args[0] === 'sts' || args[1].startsWith('describe-'))).toBe(true);
  expect(f.calls.filter((args) => args[1] === 'describe-route-tables')).toHaveLength(2);
});
for (const mode of [
  'foreignVpc',
  'sloSubnet',
  'sliSubnet',
  'main',
  'foreignEni',
  'macDrift',
  'sourceDestCheck',
  'duplicateRoute',
  'missingRoute',
  'routeDrift',
  'unsupportedTarget',
  'rereadDrift',
] as const)
  test(`original direct route ${mode} rejects`, async () => {
    const f = fixture();
    if (mode === 'foreignVpc') f.enis[1].VpcId = 'vpc-ffffffff';
    if (mode === 'sloSubnet') f.table.Associations[0].SubnetId = f.enis[0].SubnetId;
    if (mode === 'sliSubnet') f.table.Associations[0].SubnetId = f.enis[1].SubnetId;
    if (mode === 'main') f.table.Associations[0].Main = true;
    if (mode === 'foreignEni') f.enis[1].OwnerId = '000000000000';
    if (mode === 'macDrift') f.enis[1].MacAddress = '02:00:00:ff:ff:ff';
    if (mode === 'sourceDestCheck') f.enis[1].SourceDestCheck = true;
    if (mode === 'duplicateRoute') f.table.Routes.push(structuredClone(f.table.Routes[0]));
    if (mode === 'missingRoute') f.table.Routes.shift();
    if (mode === 'routeDrift') f.table.Routes[0].GatewayId = 'igw-ffffffff';
    if (mode === 'unsupportedTarget') f.table.Routes[0].GatewayId = 'local';
    if (mode === 'rereadDrift') f.drift();
    await expect(collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api)).rejects.toThrow();
  });

for (const mode of [
  'unavailable',
  'partial',
  'malformed',
  'foreignAccount',
  'duplicateEni',
  'missingMac',
  'unresolvedInstance',
  'duplicateRollback',
] as const)
  test(`original route evidence ${mode} rejects`, async () => {
    const f = fixture();
    const original = f.api.exec;
    if (mode === 'unresolvedInstance') f.values.__INSTANCE_1__ = 'unresolved';
    if (mode === 'missingMac') delete f.values.__ENI_1_1_MAC__;
    if (mode === 'duplicateRollback') f.base.rollback.resources.push(structuredClone(f.base.rollback.resources[0]));
    f.api.exec = async (cmd, args) => {
      const result = await original(cmd, args);
      if (mode === 'unavailable') return { ...result, exitCode: 1 };
      if (mode === 'malformed') return { ...result, stdout: 'invalid-json' };
      const data = JSON.parse(result.stdout);
      if (mode === 'partial') data.NextToken = 'next';
      if (mode === 'foreignAccount' && args[0] === 'sts') data.Account = '000000000000';
      if (mode === 'duplicateEni' && data.NetworkInterfaces) data.NetworkInterfaces.push(data.NetworkInterfaces[0]);
      return { ...result, stdout: JSON.stringify(data) };
    };
    await expect(collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api)).rejects.toThrow();
  });
