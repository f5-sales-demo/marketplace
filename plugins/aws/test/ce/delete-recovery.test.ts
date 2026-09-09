import { expect, test } from 'bun:test';
import { executeRecoverableDelete } from '../../src/ce/delete-recovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

function fixture() {
  const ownerSha = 'a'.repeat(64);
  const plan = {
    planSha256: 'b'.repeat(64),
    region: 'us-east-2',
    deploymentName: 'ce-demo',
    ownershipInventory: [{ resourceId: 'i-0123456789abcdef0', owned: true, action: 'delete' }],
  } as AwsCePlan;
  const action = {
    id: 'delete-instance',
    kind: 'resource-delete',
    command: 'aws',
    args: ['ec2', 'terminate-instances', '--instance-ids', 'i-0123456789abcdef0', '--region', plan.region],
    resourceId: 'i-0123456789abcdef0',
  } as AwsCeAction;
  const checkpoint = { resolvedValues: {} } as AwsCeCheckpoint;
  let state = 'shutting-down';
  let deletes = 0;
  let persists = 0;
  let successful = false;
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (args[1] === 'terminate-instances') {
        deletes++;
        if (successful) {
          state = 'terminated';
          return { exitCode: 0, stderr: '', stdout: '{}' };
        }
        throw new Error('response lost');
      }
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: action.resourceId,
                  State: { Name: state },
                  Tags: [
                    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                    { Key: 'xcsh-execution-engine', Value: 'native' },
                    { Key: 'xcsh-deployment-id', Value: plan.deploymentName },
                    { Key: 'xcsh-plan-sha256', Value: ownerSha },
                  ],
                },
              ],
            },
          ],
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
    persist: async () => {
      persists++;
    },
    terminate: () => {
      state = 'terminated';
    },
    succeed: () => {
      successful = true;
    },
    counts: () => ({ deletes, persists }),
  };
}

test('does not replay a deletion while its exact owned target is still converging', async () => {
  const f = fixture();
  await expect(
    executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [f.ownerSha]),
  ).rejects.toThrow('has not converged');
  expect(f.counts()).toEqual({ deletes: 1, persists: 1 });
  f.terminate();
  expect(
    (
      await executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [
        f.ownerSha,
      ])
    ).exitCode,
  ).toBe(0);
  expect(f.counts()).toEqual({ deletes: 1, persists: 1 });
});

test('observes absence before checkpointing a successful deletion', async () => {
  const f = fixture();
  f.succeed();
  expect(
    (
      await executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [
        f.ownerSha,
      ])
    ).exitCode,
  ).toBe(0);
  expect(f.counts()).toEqual({ deletes: 1, persists: 1 });
});

test('refuses a pending deletion whose exact immutable request changed', async () => {
  const f = fixture();
  await expect(
    executeRecoverableDelete(f.api, f.plan, f.action, f.action.args ?? [], f.checkpoint, f.persist, [f.ownerSha]),
  ).rejects.toThrow('has not converged');
  await expect(
    executeRecoverableDelete(
      f.api,
      f.plan,
      f.action,
      [...(f.action.args ?? []), '--dry-run'],
      f.checkpoint,
      f.persist,
      [f.ownerSha],
    ),
  ).rejects.toThrow('immutable request');
  expect(f.counts().deletes).toBe(1);
});
