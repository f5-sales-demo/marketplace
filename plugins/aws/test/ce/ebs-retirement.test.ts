import { expect, test } from 'bun:test';
import { executeRecoverableDelete } from '../../src/ce/delete-recovery';
import { observeAwsResources } from '../../src/ce/discovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

const volumeId = 'vol-0000000c';
const ownerSha = 'a'.repeat(64);
const tags = [
  { Key: 'xcsh-managed-by', Value: 'aws-ce' },
  { Key: 'xcsh-execution-engine', Value: 'native' },
  { Key: 'xcsh-deployment-id', Value: 'ce-demo' },
  { Key: 'xcsh-plan-sha256', Value: ownerSha },
];
function volume(overrides: Record<string, unknown> = {}) {
  return { VolumeId: volumeId, State: 'available', Attachments: [], Tags: tags, ...overrides };
}
function reader(body: unknown, stderr = '', exitCode = 0) {
  const calls: string[][] = [];
  return {
    calls,
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: JSON.stringify(body), stderr, exitCode };
    },
  };
}
const ownership = { deploymentName: 'ce-demo', planSha256s: [ownerSha] };

test('observes actual short and long EBS identities through exact describe-volumes', async () => {
  for (const id of [volumeId, 'vol-0123456789abcdef0']) {
    const api = reader({ Volumes: [volume({ VolumeId: id })] });
    const [row] = await observeAwsResources(api, [id], 'us-east-1', ownership);
    expect(row).toMatchObject({ id, exists: true, owned: true });
    expect(api.calls).toEqual([
      ['ec2', 'describe-volumes', '--volume-ids', id, '--region', 'us-east-1', '--output', 'json'],
    ]);
  }
});

test('accepts resource-specific volume not-found and refuses authorization/service failures', async () => {
  const api = reader({}, 'An error occurred (InvalidVolume.NotFound) when calling the DescribeVolumes operation', 255);
  expect((await observeAwsResources(api, [volumeId], 'us-east-1', ownership))[0].exists).toBe(false);
  for (const code of ['UnauthorizedOperation', 'InternalError', 'InvalidInstanceID.NotFound'])
    await expect(
      observeAwsResources(
        reader({}, `An error occurred (${code}) when calling DescribeVolumes`, 255),
        [volumeId],
        'us-east-1',
        ownership,
      ),
    ).rejects.toThrow('observation failed');
});

test('refuses duplicate, foreign, missing, malformed and partial volume observations', async () => {
  const invalid = [
    {},
    { Volumes: [volume(), volume()] },
    { Volumes: [volume({ VolumeId: 'vol-11111111' })] },
    { Volumes: [volume({ Attachments: undefined })] },
    { Volumes: [volume({ State: undefined })] },
    { Volumes: [volume({ State: 'available', Attachments: [{ InstanceId: 'i-11111111' }] })] },
    { Volumes: [volume({ Tags: [...tags, tags[0]] })] },
    { Volumes: [volume()], NextToken: 'remaining' },
  ];
  for (const body of invalid)
    await expect(observeAwsResources(reader(body), [volumeId], 'us-east-1', ownership)).rejects.toThrow();
  const foreign = reader({
    Volumes: [volume({ Tags: tags.map((t) => (t.Key === 'xcsh-deployment-id' ? { ...t, Value: 'foreign' } : t)) })],
  });
  expect((await observeAwsResources(foreign, [volumeId], 'us-east-1', ownership))[0].owned).toBe(false);
});

test('rechecks availability before delete and reconciles lost responses without duplicate volume deletion', async () => {
  const plan = {
    engine: 'native',
    planSha256: 'b'.repeat(64),
    region: 'us-east-1',
    deploymentName: 'ce-demo',
  } as AwsCePlan;
  const action = {
    id: 'delete-volume',
    kind: 'resource-delete',
    command: 'aws',
    resourceId: volumeId,
    args: ['ec2', 'delete-volume', '--volume-id', volumeId, '--region', plan.region],
  } as AwsCeAction;
  const checkpoint = {} as AwsCeCheckpoint;
  let state = 'in-use';
  let absent = false;
  let deletes = 0;
  let persists = 0;
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (args[1] === 'delete-volume') {
        deletes++;
        absent = true;
        throw Error('response lost');
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Volumes: absent
            ? []
            : [
                volume({
                  State: state,
                  Attachments:
                    state === 'in-use'
                      ? [{ VolumeId: volumeId, InstanceId: 'i-11111111', Device: '/dev/sda1', State: 'attached' }]
                      : [],
                }),
              ],
        }),
      };
    },
  };
  const execute = () =>
    executeRecoverableDelete(
      api,
      plan,
      action,
      action.args ?? [],
      checkpoint,
      async () => {
        persists++;
      },
      [ownerSha],
    );
  await expect(execute()).rejects.toThrow(/available/);
  expect(deletes).toBe(0);
  expect(persists).toBe(0);
  state = 'available';
  expect((await execute()).exitCode).toBe(0);
  expect(deletes).toBe(1);
  expect((await execute()).exitCode).toBe(0);
  expect(deletes).toBe(1);
});

test('reobserves every instance disk before termination and blocks foreign ownership', async () => {
  const instanceId = 'i-11111111';
  const plan = {
    accountId: '123456789012',
    engine: 'native',
    planSha256: 'b'.repeat(64),
    region: 'us-east-1',
    deploymentName: 'ce-demo',
  } as AwsCePlan;
  const action = {
    id: 'delete-instance',
    kind: 'resource-delete',
    command: 'aws',
    resourceId: instanceId,
    args: ['ec2', 'terminate-instances', '--instance-ids', instanceId],
  } as AwsCeAction;
  let mutations = 0;
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (args[1] === 'terminate-instances') {
        mutations++;
        throw Error('must not terminate');
      }
      const body =
        args[1] === 'describe-instances'
          ? {
              Reservations: [
                {
                  OwnerId: plan.accountId,
                  Instances: [
                    {
                      InstanceId: instanceId,
                      Tags: [...tags, { Key: 'xcsh-node-index', Value: '1' }],
                      BlockDeviceMappings: [
                        {
                          DeviceName: '/dev/sda1',
                          Ebs: { VolumeId: volumeId, Status: 'attached', DeleteOnTermination: true },
                        },
                      ],
                    },
                  ],
                },
              ],
            }
          : {
              Volumes: [
                volume({
                  State: 'in-use',
                  Tags: [],
                  Attachments: [{ VolumeId: volumeId, InstanceId: instanceId, Device: '/dev/sda1', State: 'attached' }],
                }),
              ],
            };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(body) };
    },
  };
  const checkpoint = {} as AwsCeCheckpoint;
  await expect(
    executeRecoverableDelete(api, plan, action, action.args ?? [], checkpoint, async () => {}, [ownerSha]),
  ).rejects.toThrow(/missing or foreign/);
  expect(mutations).toBe(0);
  expect(checkpoint.pendingDelete).toBeUndefined();
});

test('auto-retired volume exact absence performs no delete and preserves other resources', async () => {
  const plan = {
    engine: 'native',
    planSha256: 'b'.repeat(64),
    region: 'us-east-1',
    deploymentName: 'ce-demo',
  } as AwsCePlan;
  const action = {
    id: 'delete-volume',
    kind: 'resource-delete',
    command: 'aws',
    resourceId: volumeId,
    args: ['ec2', 'delete-volume', '--volume-id', volumeId],
  } as AwsCeAction;
  const api = reader({ Volumes: [] });
  expect(
    (
      await executeRecoverableDelete(
        api,
        plan,
        action,
        action.args ?? [],
        {} as AwsCeCheckpoint,
        async () => {
          throw Error('must not persist');
        },
        [ownerSha],
      )
    ).exitCode,
  ).toBe(0);
  expect(api.calls).toHaveLength(1);
  expect(api.calls[0][1]).toBe('describe-volumes');
});

test('rejects intermediate-length volume IDs before calling AWS', async () => {
  const api = reader({ Volumes: [] });
  await expect(observeAwsResources(api, ['vol-012345678'], 'us-east-1', ownership)).rejects.toThrow(
    'Invalid AWS resource observation ID',
  );
  expect(api.calls).toHaveLength(0);
});
