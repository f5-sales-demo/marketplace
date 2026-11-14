import { expect, test } from 'bun:test';
import { assertAwsActionOwnership } from '../../src/ce/apply';
import type { AwsCeAction, AwsCePlan } from '../../src/ce/types';

function fixture() {
  const id = 'vol-0000000c';
  const digest = 'a'.repeat(64);
  const plan = {
    engine: 'native',
    region: 'us-east-1',
    deploymentName: 'ce-demo',
    planSha256: digest,
    intent: { operation: 'teardown' },
    ownershipInventory: [{ resourceId: id, owned: true, action: 'delete' }],
    rollback: { resources: [] },
  } as unknown as AwsCePlan;
  const action = {
    id: 'delete-root-volume',
    kind: 'resource-delete',
    command: 'aws',
    resourceId: id,
    args: ['ec2', 'delete-volume', '--volume-id', id],
    mutates: true,
  } as AwsCeAction;
  let body: unknown = { Volumes: [] };
  let stderr = '';
  let exitCode = 0;
  const calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: JSON.stringify(body), stderr, exitCode };
    },
  };
  const owned = {
    VolumeId: id,
    State: 'available',
    Attachments: [],
    Tags: [
      { Key: 'xcsh-managed-by', Value: 'aws-ce' },
      { Key: 'xcsh-execution-engine', Value: 'native' },
      { Key: 'xcsh-deployment-id', Value: 'ce-demo' },
      { Key: 'xcsh-plan-sha256', Value: digest },
    ],
  };
  return {
    plan,
    action,
    api,
    calls,
    owned,
    setBody: (b: unknown) => {
      body = b;
    },
    deny: () => {
      exitCode = 255;
      stderr = 'An error occurred (UnauthorizedOperation) when calling DescribeVolumes';
    },
  };
}

test('permits exact absence only for the immutable reviewed owned delete target', async () => {
  const f = fixture();
  await assertAwsActionOwnership(f.plan, f.action, f.api);
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0][1]).toBe('describe-volumes');
});
for (const boundary of ['not-delete', 'not-teardown', 'unowned', 'not-reviewed'] as const)
  test(`does not waive missing target for ${boundary}`, async () => {
    const f = fixture();
    if (boundary === 'not-delete') f.action.kind = 'elastic-ip-associate';
    if (boundary === 'not-teardown') f.plan.intent.operation = 'deploy';
    if (boundary === 'unowned') f.plan.ownershipInventory[0].owned = false;
    if (boundary === 'not-reviewed') f.plan.ownershipInventory = [];
    await expect(assertAwsActionOwnership(f.plan, f.action, f.api)).rejects.toThrow();
  });

test('volume argument outside the original reviewed target is rejected before mutation', async () => {
  const f = fixture();
  f.setBody({ Volumes: [f.owned] });
  f.action.args = ['ec2', 'delete-volume', '--volume-id', 'vol-11111111'];
  await expect(assertAwsActionOwnership(f.plan, f.action, f.api)).rejects.toThrow('outside the deployment inventory');
});

test('wrong engine and missing or failed observations cannot become owned absence', async () => {
  for (const mode of ['engine', 'malformed', 'denied', 'foreign-id'] as const) {
    const f = fixture();
    if (mode === 'engine')
      f.setBody({
        Volumes: [
          {
            ...f.owned,
            Tags: f.owned.Tags.map((t) => (t.Key === 'xcsh-execution-engine' ? { ...t, Value: 'terraform' } : t)),
          },
        ],
      });
    if (mode === 'malformed') f.setBody({});
    if (mode === 'denied') f.deny();
    if (mode === 'foreign-id') f.setBody({ Volumes: [{ ...f.owned, VolumeId: 'vol-11111111' }] });
    await expect(assertAwsActionOwnership(f.plan, f.action, f.api)).rejects.toThrow();
  }
});
