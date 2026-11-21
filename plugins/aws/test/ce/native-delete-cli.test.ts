import { expect, test } from 'bun:test';
import { executeRecoverableDelete } from '../../src/ce/delete-recovery';
import { observeAwsResources } from '../../src/ce/discovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

function fixture() {
  const ownerSha = 'a'.repeat(64),
    plan = {
      engine: 'native',
      planSha256: 'b'.repeat(64),
      region: 'us-east-1',
      deploymentName: 'ce',
      ownershipInventory: [{ resourceId: 'vpc-12345678', owned: true, action: 'delete' }],
    } as AwsCePlan;
  const action = {
    id: 'delete-vpc',
    kind: 'resource-delete',
    command: 'aws',
    resourceId: 'vpc-12345678',
    args: ['ec2', 'delete-vpc', '--vpc-id', 'vpc-12345678', '--region', plan.region],
  } as AwsCeAction;
  const checkpoint = { resolvedValues: {} } as AwsCeCheckpoint;
  let present = true,
    deletes = 0,
    denied = false,
    rejection = false;
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (args[1] === 'delete-vpc') {
        deletes++;
        if (rejection)
          return {
            exitCode: 254,
            stdout: '',
            stderr: 'An error occurred (UnauthorizedOperation) when calling the DeleteVpc operation: denied',
          };
        present = false;
        denied = true;
        return { exitCode: 255, stdout: '', stderr: 'RequestTimeout: response lost after mutation' };
      }
      if (denied) return { exitCode: 255, stdout: '', stderr: 'AccessDenied: exact evidence unavailable' };
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Vpcs: present
            ? [
                {
                  VpcId: action.resourceId,
                  State: 'available',
                  CidrBlock: '10.0.0.0/16',
                  Tags: [
                    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                    { Key: 'xcsh-execution-engine', Value: 'native' },
                    { Key: 'xcsh-deployment-id', Value: plan.deploymentName },
                    { Key: 'xcsh-plan-sha256', Value: ownerSha },
                  ],
                },
              ]
            : [],
        }),
      };
    },
  };
  return {
    plan,
    action,
    checkpoint,
    api,
    ownerSha,
    persist: async () => {},
    restore: () => {
      denied = false;
    },
    reject: () => {
      rejection = true;
    },
    deletes: () => deletes,
  };
}
test('nonzero committed CLI deletion retains exact intent and original observation while readback is unavailable', async () => {
  const f = fixture();
  await expect(
    executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [f.ownerSha]),
  ).rejects.toThrow();
  expect(f.checkpoint.pendingDelete).toMatchObject({ actionId: f.action.id, resourceId: f.action.resourceId });
  expect(f.checkpoint.pendingDelete).toHaveProperty('before');
  expect(f.checkpoint.pendingDelete).toHaveProperty('beforeSha256');
  f.restore();
  expect(
    (
      await executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [
        f.ownerSha,
      ])
    ).exitCode,
  ).toBe(0);
  expect(f.deletes()).toBe(1);
});
test('a proven denied request may clear intent only after unchanged owned readback', async () => {
  const f = fixture();
  f.reject();
  const result = await executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [
    f.ownerSha,
  ]);
  expect(result.exitCode).toBe(254);
  expect(f.checkpoint.pendingDelete).toBeUndefined();
  expect(f.deletes()).toBe(1);
});

for (const data of [{}, { Vpcs: [{ VpcId: 'vpc-ffffffff' }] }, { Vpcs: [], NextToken: 'unread' }])
  test('malformed or partial current resource evidence cannot become absence: ' + JSON.stringify(data), async () => {
    const f = fixture();
    const api = { exec: async () => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(data) }) };
    await expect(
      observeAwsResources(api, ['vpc-12345678'], f.plan.region, {
        deploymentName: f.plan.deploymentName,
        planSha256s: [f.ownerSha],
      }),
    ).rejects.toThrow();
  });
test('foreign error text cannot masquerade as resource-specific not-found evidence', async () => {
  const f = fixture();
  const api = {
    exec: async () => ({
      exitCode: 255,
      stdout: '',
      stderr: 'AccessDenied: resource not found in this permission scope',
    }),
  };
  await expect(
    observeAwsResources(api, ['vpc-12345678'], f.plan.region, {
      deploymentName: f.plan.deploymentName,
      planSha256s: [f.ownerSha],
    }),
  ).rejects.toThrow();
  const absent = {
    exec: async () => ({
      exitCode: 255,
      stdout: '',
      stderr: 'An error occurred (InvalidVpcID.NotFound) when calling the DescribeVpcs operation: missing',
    }),
  };
  expect(
    (
      await observeAwsResources(absent, ['vpc-12345678'], f.plan.region, {
        deploymentName: f.plan.deploymentName,
        planSha256s: [f.ownerSha],
      })
    )[0].exists,
  ).toBe(false);
});
