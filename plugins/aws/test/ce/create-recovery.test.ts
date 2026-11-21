import { expect, test } from 'bun:test';
import { executeRecoverableCreate, prepareRecoverableAction } from '../../src/ce/create-recovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

const plan = {
  planSha256: 'a'.repeat(64),
  engine: 'native',
  deploymentName: 'ce-demo',
  region: 'us-east-1',
} as AwsCePlan;
const action: AwsCeAction = {
  id: 'aws-ce-action-0001',
  phase: 'network',
  kind: 'vpc-create',
  mutates: true,
  destructive: false,
  description: 'Create VPC',
  command: 'aws',
  args: [
    'ec2',
    'create-vpc',
    '--cidr-block',
    '10.0.0.0/16',
    '--tag-specifications',
    'ResourceType=vpc,Tags=[{Key=xcsh-managed-by,Value=aws-ce}]',
  ],
};
const tags = {
  'xcsh-managed-by': 'aws-ce',
  'xcsh-execution-engine': 'native',
  'xcsh-deployment-id': 'ce-demo',
  'xcsh-plan-sha256': plan.planSha256,
  'xcsh-action-id': action.id,
};
const resource = { VpcId: 'vpc-0123456789abcdef0', Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })) };
const checkpoint = () =>
  ({
    schemaVersion: 2,
    engine: 'native',
    planId: 'plan',
    planSha256: plan.planSha256,
    completedActionIds: [],
    resolvedValues: {},
    state: 'running',
  }) as AwsCeCheckpoint;

test('reconciles a lost create response and resumes observation without duplicate mutation', async () => {
  const state = checkpoint();
  const calls: string[][] = [];
  let persisted = false;
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      expect(persisted).toBe(true);
      if (args[1] === 'create-vpc') throw new Error('response lost');
      return { exitCode: 0, stderr: '', stdout: JSON.stringify({ Vpcs: [resource] }) };
    },
  };
  const result = await executeRecoverableCreate(api, plan, action, action.args ?? [], state, async () => {
    persisted = true;
  });
  expect(JSON.parse(result.stdout).Vpc.VpcId).toBe(resource.VpcId);
  await executeRecoverableCreate(api, plan, action, action.args ?? [], state, async () => {});
  expect(calls.filter((args) => args[1] === 'create-vpc')).toHaveLength(1);
  expect(calls[1]).toContain(`Name=tag:xcsh-plan-sha256,Values=${plan.planSha256}`);
});

test('checkpoint failure prevents creation; absent, duplicate, partial and foreign evidence remain unresolved', async () => {
  let calls = 0;
  const api = {
    exec: async () => {
      calls++;
      return { exitCode: 1, stderr: '', stdout: '' };
    },
  };
  await expect(
    executeRecoverableCreate(api, plan, action, action.args ?? [], checkpoint(), async () => {
      throw new Error('storage failure');
    }),
  ).rejects.toThrow('storage failure');
  expect(calls).toBe(0);
  for (const raw of [
    { Vpcs: [] },
    { Vpcs: [resource, resource] },
    { Vpcs: [resource], NextToken: 'more' },
    { Vpcs: [{ ...resource, Tags: [] }] },
  ]) {
    const state = checkpoint();
    const api = {
      exec: async (_command: string, args: string[]) =>
        args[1] === 'create-vpc'
          ? { exitCode: 1, stderr: '', stdout: '' }
          : { exitCode: 0, stderr: '', stdout: JSON.stringify(raw) },
    };
    await expect(
      executeRecoverableCreate(api, plan, action, action.args ?? [], state, async () => {}),
    ).rejects.toThrow();
    expect(state.pendingCreate?.actionId).toBe(action.id);
  }
});
test('plans atomically tag creates with the stable action identity', () => {
  const tagged = structuredClone(action);
  prepareRecoverableAction(tagged);
  expect(tagged.args?.at(-1)).toContain(`{Key=xcsh-action-id,Value=${action.id}}`);
});
