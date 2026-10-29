import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { renderAwsTerraformDirectImport } from '../../src/ce/terraform-direct-import';
import { collectAwsTerraformDirectRouteOwnership } from '../../src/ce/terraform-direct-ownership';
import {
  observeAwsTerraformDirectPhase,
  renderAwsTerraformDirectTransition,
} from '../../src/ce/terraform-direct-transition';
import { directOwnershipFixture } from './terraform-direct-fixture';

async function fixture() {
  const f = directOwnershipFixture();
  const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
  const foundation = JSON.stringify({
    terraform: { required_version: '= 1.16.5' },
    resource: { aws_instance: { node_1: { ami: 'ami-12345678' } } },
    output: { ce_vpc_id: { value: ownership.vpcId } },
  });
  const imported = renderAwsTerraformDirectImport(f.base, ownership, foundation);
  return { ...f, ownership, foundation, imported };
}
test('direct transition replaces only imported targets, restores originals and renders nondestructive removal', async () => {
  const f = await fixture();
  const ce = renderAwsTerraformDirectTransition(f.base, f.ownership, f.imported.configuration, 'original', 'ce');
  const config = JSON.parse(ce.configuration);
  expect(config.import).toBeUndefined();
  expect(config.resource.aws_route.direct_0).toEqual({
    route_table_id: 'rtb-12345678',
    destination_cidr_block: '192.0.2.0/24',
    network_interface_id: f.values.__ENI_1_1__,
  });
  expect(config.resource.aws_instance).toEqual(JSON.parse(f.foundation).resource.aws_instance);
  const restored = renderAwsTerraformDirectTransition(f.base, f.ownership, ce.configuration, 'ce', 'original');
  expect(JSON.parse(restored.configuration).resource.aws_route.direct_0.gateway_id).toBe('igw-12345678');
  const removed = renderAwsTerraformDirectTransition(
    f.base,
    f.ownership,
    restored.configuration,
    'original',
    'relinquished',
    { 'aws_route.direct_0': 'r-rtb-123456782746858862' },
  );
  expect(JSON.parse(removed.configuration).removed).toEqual([
    { from: 'aws_route.direct_0', lifecycle: { destroy: false } },
  ]);
  expect(JSON.parse(removed.configuration).resource.aws_route).toBeUndefined();
  expect(removed.intents[0].idSha256).not.toBe(f.imported.intents[0].idSha256);
  expect(removed.intents[0].address).toBe('aws_route.direct_0');
});
for (const mode of [
  'foreign-target',
  'wrong-source',
  'extra-field',
  'foreign-import',
  'removed-block',
  'missing-route',
  'foreign-vpc',
  'snapshot-drift',
  'duplicate-snapshot',
  'wrong-sli',
  'wrong-index',
  'unknown-target',
] as const)
  test(`direct transition rejects ${mode} before revision`, async () => {
    const f = await fixture();
    const config = JSON.parse(f.imported.configuration);
    if (mode === 'foreign-target') config.resource.aws_route.direct_0.gateway_id = 'igw-ffffffff';
    if (mode === 'wrong-source') delete config.resource.aws_route.direct_0.gateway_id;
    if (mode === 'extra-field') config.resource.aws_route.direct_0.lifecycle = { ignore_changes: ['gateway_id'] };
    if (mode === 'foreign-import') config.import[0].id = 'rtb-ffffffff_192.0.2.0/24';
    if (mode === 'removed-block') config.removed = [];
    if (mode === 'missing-route') delete config.resource.aws_route.direct_0;
    if (mode === 'foreign-vpc') config.output.ce_vpc_id.value = 'vpc-ffffffff';
    if (mode === 'snapshot-drift') f.ownership.instanceId = 'i-ffffffff';
    if (mode === 'duplicate-snapshot') f.ownership.routes.push(structuredClone(f.ownership.routes[0]));
    if (mode === 'unknown-target') f.ownership.routes[0].networkInterfaceId = '__ENI_1_1__';
    if (mode === 'wrong-sli') f.ownership.routes[0].networkInterfaceId = f.ownership.interfaces[0].id;
    if (mode === 'wrong-index') f.ownership.interfaces[1].index = 0;
    if (['wrong-sli', 'wrong-index', 'unknown-target'].includes(mode)) {
      const { snapshotSha256: _, ...snapshot } = f.ownership;
      f.ownership.snapshotSha256 = canonicalSha256(snapshot);
    }
    expect(() =>
      renderAwsTerraformDirectTransition(f.base, f.ownership, JSON.stringify(config), 'original', 'ce'),
    ).toThrow();
  });

test('fresh independent observer verifies same interfaces and full selected tables for both phases', async () => {
  const f = await fixture();
  await expect(observeAwsTerraformDirectPhase(f.base, f.ownership, 'original', f.api)).resolves.toHaveProperty(
    'phase',
    'original',
  );
  const route = f.table.Routes[0] as Record<string, unknown>;
  delete route.GatewayId;
  route.NetworkInterfaceId = f.values.__ENI_1_1__;
  await expect(observeAwsTerraformDirectPhase(f.base, f.ownership, 'ce', f.api)).resolves.toHaveProperty('phase', 'ce');
  await expect(observeAwsTerraformDirectPhase(f.base, f.ownership, 'original', f.api)).rejects.toThrow();
  expect(f.calls.every((args) => args[0] === 'sts' || args[1].startsWith('describe-'))).toBe(true);
});
for (const mode of [
  'missing-table',
  'partial',
  'duplicate-table',
  'foreign-account',
  'foreign-owner-tags',
  'missing-eni',
  'foreign-device',
  'foreign-mac',
  'unrelated-route-drift',
  'blackhole',
  'read-drift',
  'unavailable',
  'malformed',
] as const)
  test(`independent direct observer rejects ${mode}`, async () => {
    const f = await fixture();
    let reads = 0;
    const api = {
      exec: async (cmd: string, args: string[]) => {
        const result = await f.api.exec(cmd, args);
        if (mode === 'unavailable') return { ...result, exitCode: 1 };
        if (mode === 'malformed') return { ...result, stdout: 'null' };
        const data = JSON.parse(result.stdout);
        if (mode === 'foreign-account' && args[0] === 'sts') data.Account = '000000000000';
        if (args[1] === 'describe-route-tables') {
          reads++;
          if (mode === 'missing-table') data.RouteTables = [];
          if (mode === 'partial') data.NextToken = 'more';
          if (mode === 'duplicate-table') data.RouteTables.push(structuredClone(data.RouteTables[0]));
          if (mode === 'unrelated-route-drift') data.RouteTables[0].Routes[1].GatewayId = 'igw-ffffffff';
          if (mode === 'blackhole') data.RouteTables[0].Routes[0].State = 'blackhole';
          if (mode === 'read-drift' && reads === 2) data.RouteTables[0].VpcId = 'vpc-ffffffff';
        }
        if (args[1] === 'describe-network-interfaces') {
          if (mode === 'missing-eni') data.NetworkInterfaces.pop();
          if (mode === 'foreign-device') data.NetworkInterfaces[1].Attachment.DeviceIndex = 0;
          if (mode === 'foreign-mac') data.NetworkInterfaces[1].MacAddress = '02:00:00:00:00:ff';
          if (mode === 'foreign-owner-tags') data.NetworkInterfaces[0].TagSet = [];
        }
        return { ...result, stdout: JSON.stringify(data) };
      },
    };
    await expect(observeAwsTerraformDirectPhase(f.base, f.ownership, 'original', api)).rejects.toThrow();
  });

for (const ids of [
  undefined,
  {},
  { 'aws_route.direct_0': 'rtb-12345678_192.0.2.0/24' },
  { 'aws_route.direct_0': 'r-rtb-ffffffff2746858862' },
  { 'aws_route.direct_0': 'r-rtb-123456782746858862', 'aws_route.foreign': 'r-rtb-123456782746858862' },
])
  test('relinquishment rejects missing, import-selector or foreign state identity', async () => {
    const f = await fixture();
    const config = JSON.parse(f.imported.configuration);
    delete config.import;
    expect(() =>
      renderAwsTerraformDirectTransition(f.base, f.ownership, JSON.stringify(config), 'original', 'relinquished', ids),
    ).toThrow();
  });

for (const mode of ['foreign-table', 'missing-table', 'duplicate-table', 'foreign-table-target'])
  test(`direct transition rejects digest-valid original snapshot ${mode}`, async () => {
    const f = await fixture();
    if (mode === 'foreign-table') f.ownership.tables[0].VpcId = 'vpc-ffffffff';
    if (mode === 'missing-table') f.ownership.tables = [];
    if (mode === 'duplicate-table') f.ownership.tables.push(structuredClone(f.ownership.tables[0]));
    if (mode === 'foreign-table-target')
      (f.ownership.tables[0].Routes as Array<Record<string, unknown>>)[0].GatewayId = 'igw-ffffffff';
    const { snapshotSha256: _, ...snapshot } = f.ownership;
    f.ownership.snapshotSha256 = canonicalSha256(snapshot);
    expect(() =>
      renderAwsTerraformDirectTransition(f.base, f.ownership, f.imported.configuration, 'original', 'ce'),
    ).toThrow();
  });

for (const [wire, field, target] of [
  ['GatewayId', 'gateway_id', 'igw-12345678'],
  ['NatGatewayId', 'nat_gateway_id', 'nat-12345678'],
  ['NetworkInterfaceId', 'network_interface_id', 'eni-ffffffff'],
  ['TransitGatewayId', 'transit_gateway_id', 'tgw-12345678'],
  ['VpcPeeringConnectionId', 'vpc_peering_connection_id', 'pcx-12345678'],
])
  test(`direct restoration retains provider target spelling ${field}`, async () => {
    const f = directOwnershipFixture();
    const route = f.table.Routes[0] as Record<string, unknown>;
    delete route.GatewayId;
    route[wire] = target;
    f.base.rollback.resources[0].before = { RouteTables: [structuredClone(f.table)] };
    const { planId: _, planSha256: __, ...body } = f.base;
    f.base.planSha256 = canonicalSha256(body);
    f.base.planId = `aws-ce-${f.base.planSha256.slice(0, 24)}`;
    for (const eni of f.enis)
      for (const tag of eni.TagSet) if (tag.Key === 'xcsh-plan-sha256') tag.Value = f.base.planSha256;
    const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
    const imported = renderAwsTerraformDirectImport(
      f.base,
      ownership,
      JSON.stringify({ resource: {}, output: { ce_vpc_id: { value: ownership.vpcId } } }),
    );
    const ce = renderAwsTerraformDirectTransition(f.base, ownership, imported.configuration, 'original', 'ce');
    const restored = renderAwsTerraformDirectTransition(f.base, ownership, ce.configuration, 'ce', 'original');
    expect(JSON.parse(restored.configuration).resource.aws_route.direct_0[field]).toBe(target);
    await expect(observeAwsTerraformDirectPhase(f.base, ownership, 'original', f.api)).resolves.toHaveProperty(
      'phase',
      'original',
    );
  });

test('removing the final route omits the empty labeled resource block required by real Terraform', async () => {
  const f = await fixture();
  const config = JSON.parse(f.imported.configuration);
  delete config.import;
  delete config.resource.aws_instance;
  const removed = renderAwsTerraformDirectTransition(
    f.base,
    f.ownership,
    JSON.stringify(config),
    'original',
    'relinquished',
    { 'aws_route.direct_0': 'r-rtb-123456782746858862' },
  );
  expect(JSON.parse(removed.configuration).resource).toBeUndefined();
});
