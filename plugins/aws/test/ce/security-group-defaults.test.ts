import { expect, test } from 'bun:test';
import { resetAwsSecurityGroupEgress } from '../../src/ce/security-group-defaults';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

function fixture() {
  const plan = {
    deploymentName: 'ce',
    engine: 'native',
    region: 'ca-west-1',
    planSha256: 'digest',
    intent: { vpc: { mode: 'greenfield' } },
  } as AwsCePlan;
  const checkpoint = {
    resolvedValues: { __SG_ce__: 'sg-12345678', __VPC_ID__: 'vpc-12345678' },
  } as unknown as AwsCeCheckpoint;
  const group = {
    GroupId: 'sg-12345678',
    VpcId: 'vpc-12345678',
    Tags: Object.entries({
      'xcsh-managed-by': 'aws-ce',
      'xcsh-deployment-id': 'ce',
      'xcsh-execution-engine': 'native',
      'xcsh-plan-sha256': 'digest',
    }).map(([Key, Value]) => ({ Key, Value })),
    IpPermissionsEgress: [
      {
        IpProtocol: '-1',
        IpRanges: [{ CidrIp: '0.0.0.0/0' }],
        Ipv6Ranges: [],
        UserIdGroupPairs: [],
        PrefixListIds: [],
      },
    ],
  };
  let revokes = 0;
  const api = {
    async exec(_command: string, args: string[]) {
      if (args[1] === 'revoke-security-group-egress') {
        revokes++;
        group.IpPermissionsEgress = [];
        return { exitCode: 1, stdout: '', stderr: 'lost response' };
      }
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ SecurityGroups: [group] }) };
    },
  };
  const run = () => resetAwsSecurityGroupEgress({ resourceId: '__SG_ce__' } as AwsCeAction, plan, checkpoint, api);
  return { group, run, revokes: () => revokes };
}
test('removes owned default egress and resumes an ambiguous revoke through observation', async () => {
  const f = fixture();
  await f.run();
  await f.run();
  expect(f.revokes()).toBe(1);
});
test('refuses foreign ownership, cross-VPC groups and unexpected rules', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.group.VpcId = 'vpc-87654321';
    },
    (f: ReturnType<typeof fixture>) => {
      f.group.Tags = [];
    },
    (f: ReturnType<typeof fixture>) => {
      f.group.IpPermissionsEgress[0].IpRanges[0].CidrIp = '10.0.0.0/8';
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(f.run()).rejects.toThrow();
    expect(f.revokes()).toBe(0);
  }
});
