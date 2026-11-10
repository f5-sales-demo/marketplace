import { expect, test } from 'bun:test';
import { renderAwsTerraformDirectImport } from '../../src/ce/terraform-direct-import';
import { collectAwsTerraformDirectRouteOwnership } from '../../src/ce/terraform-direct-ownership';
import { directOwnershipFixture } from './terraform-direct-fixture';

test('direct import keeps the original target and exact import identity without replacing foundation', async () => {
  const f = directOwnershipFixture();
  const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
  const before = JSON.stringify({
    terraform: { required_version: '= 1.16.5' },
    resource: { aws_instance: { node_1: { ami: 'ami-12345678' } } },
    output: { ce_vpc_id: { value: ownership.vpcId } },
  });
  const stage = renderAwsTerraformDirectImport(f.base, ownership, before);
  const result = JSON.parse(stage.configuration);
  expect(result.resource.aws_instance).toEqual(JSON.parse(before).resource.aws_instance);
  expect(result.resource.aws_route.direct_0).toEqual({
    route_table_id: 'rtb-12345678',
    destination_cidr_block: '192.0.2.0/24',
    gateway_id: 'igw-12345678',
  });
  expect(result.import).toEqual([{ to: 'aws_route.direct_0', id: 'rtb-12345678_192.0.2.0/24' }]);
  expect(stage.intents).toEqual([
    {
      address: 'aws_route.direct_0',
      type: 'aws_route',
      providerName: 'registry.terraform.io/hashicorp/aws',
      idSha256: 'c691bf5feb73ae75908ee1de52d333492443782cce90a68f39f8589d16517ae7',
    },
  ]);
});
for (const mode of [
  'snapshot-drift',
  'wrong-plan',
  'foreign-vpc',
  'existing-import',
  'existing-route',
  'malformed',
] as const)
  test(`direct import rejects ${mode}`, async () => {
    const f = directOwnershipFixture();
    const ownership = await collectAwsTerraformDirectRouteOwnership(f.base, f.values, f.api);
    const config: {
      resource: { aws_instance: Record<string, unknown>; aws_route?: Record<string, unknown> };
      output: { ce_vpc_id: { value: string } };
      import?: unknown[];
    } = {
      resource: { aws_instance: { node_1: {} } },
      output: { ce_vpc_id: { value: ownership.vpcId } },
    };
    if (mode === 'snapshot-drift') ownership.routes[0].originalTarget.id = 'igw-ffffffff';
    if (mode === 'wrong-plan') ownership.sourcePlanSha256 = 'f'.repeat(64);
    if (mode === 'foreign-vpc') config.output.ce_vpc_id.value = 'vpc-ffffffff';
    if (mode === 'existing-import') config.import = [];
    if (mode === 'existing-route') config.resource.aws_route = { direct_0: {} };
    expect(() =>
      renderAwsTerraformDirectImport(f.base, ownership, mode === 'malformed' ? 'null' : JSON.stringify(config)),
    ).toThrow();
  });
