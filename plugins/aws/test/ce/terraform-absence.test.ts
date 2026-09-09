import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsTerraformAbsence } from '../../src/ce/terraform-absence';
import { foundationPlan } from './terraform-fixtures';

function fixture(mode = 'absent') {
  const plan = foundationPlan();
  const material = {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    accountId: plan.intent.accountId,
    region: plan.intent.region,
    deploymentId: plan.intent.deploymentName,
    sourcePlanSha256: plan.planSha256,
    terraformPlanSha256: 'a'.repeat(64),
    resources: [
      { type: 'aws_vpc', id: 'vpc-12345678' },
      { type: 'aws_instance', id: 'i-12345678' },
      { type: 'aws_ebs_volume', id: 'vol-12345678' },
      { type: 'aws_ec2_transit_gateway_connect', id: 'tgw-attach-12345678' },
    ],
    tgwEdges: [{ kind: 'association' as const, tableId: 'tgw-rtb-12345678', attachmentId: 'tgw-attach-12345678' }],
  };
  const inventory = { ...material, sha256: canonicalSha256(material) };
  const calls: string[] = [];
  const api = {
    async exec(_cmd: string, args: string[]) {
      expect(args[args.indexOf('--region') + 1]).toBe(plan.intent.region);
      expect(args[args.indexOf('--profile') + 1]).toBe(plan.intent.awsProfile);
      const operation = args[1];
      calls.push(operation);
      if (mode === 'forbidden') return { stdout: '', stderr: 'UnauthorizedOperation', exitCode: 1 };
      if (operation === 'get-caller-identity')
        return {
          stdout: JSON.stringify({ Account: mode === 'wrong-account' ? '999999999999' : plan.intent.accountId }),
          stderr: '',
          exitCode: 0,
        };
      const input = JSON.parse(args[args.indexOf('--cli-input-json') + 1]);
      const response: Record<string, unknown> = {
        'describe-tags': {
          Tags:
            mode === 'orphan'
              ? [{ Key: 'xcsh-deployment-id', Value: plan.intent.deploymentName, ResourceId: 'vol-87654321' }]
              : [],
          ...(mode === 'partial' ? { NextToken: 'repeat' } : {}),
        },
        'describe-vpcs':
          mode === 'malformed'
            ? {}
            : {
                Vpcs:
                  mode === 'present'
                    ? [{ VpcId: 'vpc-12345678' }]
                    : mode === 'foreign'
                      ? [{ VpcId: 'vpc-87654321' }]
                      : [],
              },
        'describe-instances': {
          Reservations:
            mode === 'terminated' ? [{ Instances: [{ InstanceId: 'i-12345678', State: { Name: 'terminated' } }] }] : [],
        },
        'describe-volumes': { Volumes: mode === 'orphan' ? [{ VolumeId: 'vol-87654321', State: 'available' }] : [] },
        'describe-transit-gateway-connects': { TransitGatewayConnects: [] },
        'describe-transit-gateway-route-tables': {
          TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: 'tgw-rtb-12345678', State: 'available' }],
        },
        'get-transit-gateway-route-table-associations': {
          Associations:
            mode === 'edge' ? [{ TransitGatewayAttachmentId: 'tgw-attach-12345678', State: 'associated' }] : [],
        },
      };
      if (mode === 'pages' && operation === 'describe-vpcs')
        response[operation] = input.NextToken ? { Vpcs: [] } : { Vpcs: [], NextToken: 'second-page' };
      return { stdout: JSON.stringify(response[operation]), stderr: '', exitCode: 0 };
    },
  };
  return { plan, inventory, api, calls };
}
test('absence collector requires fresh scoped identity reads, tag inventory and TGW relationship disappearance', async () => {
  for (const mode of ['absent', 'terminated', 'pages', 'present', 'orphan', 'edge']) {
    const f = fixture(mode);
    const receipt = await collectAwsTerraformAbsence(f.plan, f.inventory, f.api);
    expect(receipt.status).toBe(['present', 'orphan', 'edge'].includes(mode) ? 'pending' : 'absent-or-retired');
    expect(f.calls).toContain('describe-tags');
    expect(f.calls).toContain('get-transit-gateway-route-table-associations');
    if (mode === 'pages') expect(f.calls.filter((row) => row === 'describe-vpcs').length).toBe(2);
  }
});
test('absence collector keeps incomplete, unauthorized and substituted evidence unknown', async () => {
  for (const mode of ['partial', 'malformed', 'foreign', 'forbidden', 'wrong-account']) {
    const f = fixture(mode);
    expect((await collectAwsTerraformAbsence(f.plan, f.inventory, f.api)).status).toBe('unknown');
  }
});
test('absence collector rejects forged inventory and cancellation without issuing requests', async () => {
  const f = fixture();
  await expect(collectAwsTerraformAbsence(f.plan, { ...f.inventory, resources: [] }, f.api)).rejects.toThrow();
  await expect(collectAwsTerraformAbsence(f.plan, f.inventory, f.api, AbortSignal.abort())).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
