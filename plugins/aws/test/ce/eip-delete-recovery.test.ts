import { expect, test } from 'bun:test';
import { executeRecoverableDelete } from '../../src/ce/delete-recovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

test('exact association deletion reconciles response loss and repeat without releasing allocation', async () => {
  const id = 'eipassoc-12345678',
    allocation = 'eipalloc-12345678',
    ownerSha = 'a'.repeat(64);
  const plan = {
    engine: 'native',
    region: 'us-east-1',
    deploymentName: 'fixture',
    planSha256: 'b'.repeat(64),
  } as AwsCePlan;
  const action = {
    id: 'disassociate',
    kind: 'resource-delete',
    resourceId: id,
    command: 'aws',
    args: ['ec2', 'disassociate-address', '--association-id', id],
  } as AwsCeAction;
  const checkpoint = {} as AwsCeCheckpoint;
  let associated = true,
    mutations = 0,
    persists = 0;
  const api = {
    exec: async (_command: string, args: string[]) => {
      if (args[1] === 'disassociate-address') {
        expect(args).toEqual(action.args);
        mutations++;
        associated = false;
        throw Error('response lost');
      }
      expect(args).toContain(`Name=association-id,Values=${id}`);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Addresses: associated
            ? [
                {
                  AssociationId: id,
                  AllocationId: allocation,
                  Tags: [
                    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                    { Key: 'xcsh-execution-engine', Value: 'native' },
                    { Key: 'xcsh-deployment-id', Value: 'fixture' },
                    { Key: 'xcsh-plan-sha256', Value: ownerSha },
                  ],
                },
              ]
            : [],
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
  expect((await execute()).exitCode).toBe(0);
  expect((await execute()).exitCode).toBe(0);
  expect(mutations).toBe(1);
  expect(persists).toBe(1);
});
