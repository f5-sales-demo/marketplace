import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  buildAwsNativeFailover,
  observeAwsNativeFailoverInstance,
  runAwsNativeFailover,
} from '../../src/ce/native-failover';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

async function fixture() {
  const source = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = source;
  draft.engine = 'native';
  draft.intent = { ...draft.intent, engine: 'native' };
  Object.assign(draft, {
    accountId: draft.intent.accountId,
    region: draft.intent.region,
    deploymentName: draft.intent.deploymentName,
    routing: structuredClone(draft.intent.routing),
  });
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const failover = buildAwsNativeFailover(plan, 1, 'i-0123456789abcdef0', 'a'.repeat(64));
  const directory = await mkdtemp(join(tmpdir(), 'aws-native-failover-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, {
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  let state: 'running' | 'stopped' = 'running';
  let loseStopResponse = false;
  const mutations: string[] = [];
  return {
    plan,
    failover,
    storage,
    mutations,
    loseStop: () => (loseStopResponse = true),
    observe: async () => state,
    mutate: async (phase: 'stop' | 'start') => {
      mutations.push(phase);
      state = phase === 'stop' ? 'stopped' : 'running';
      if (phase === 'stop' && loseStopResponse) {
        loseStopResponse = false;
        throw new Error('lost response');
      }
    },
  };
}

test('executes a native stop, exact outage, start and restoration', async () => {
  const f = await fixture();
  const evidence: string[] = [];
  const result = await runAwsNativeFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.storage,
    f.observe,
    f.mutate,
    async (phase) => {
      evidence.push(phase);
      return { acceptance: 'passed' };
    },
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  expect(result.status).toBe('failover-complete');
  expect(f.mutations).toEqual(['stop', 'start']);
  expect(evidence).toEqual(['outage', 'recovered']);
  expect(result.traffic).toBe('unknown');
});

test('reconciles a lost native stop response without replaying the mutation', async () => {
  const f = await fixture();
  f.loseStop();
  await expect(
    runAwsNativeFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      f.storage,
      f.observe,
      f.mutate,
      async () => ({ acceptance: 'passed' }),
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {} },
    ),
  ).rejects.toThrow('lost response');
  const result = await runAwsNativeFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.storage,
    f.observe,
    f.mutate,
    async () => ({ acceptance: 'passed' }),
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  expect(result.status).toBe('failover-complete');
  expect(f.mutations).toEqual(['stop', 'start']);
});

test('observes only the exact owned native instance in the intended account', async () => {
  const f = await fixture();
  const instance = {
    InstanceId: f.failover.instanceId,
    State: { Name: 'running' },
    Tags: [
      { Key: 'xcsh-managed-by', Value: 'aws-ce' },
      { Key: 'xcsh-execution-engine', Value: 'native' },
      { Key: 'xcsh-deployment-id', Value: f.plan.deploymentName },
      { Key: 'xcsh-plan-sha256', Value: f.failover.instancePlanSha256 },
      { Key: 'xcsh-node-index', Value: '1' },
    ],
  };
  const api = {
    async exec(_command: string, args: string[]) {
      return args[0] === 'sts'
        ? { exitCode: 0, stdout: JSON.stringify({ Account: f.plan.accountId }), stderr: '' }
        : {
            exitCode: 0,
            stdout: JSON.stringify({ Reservations: [{ OwnerId: f.plan.accountId, Instances: [instance] }] }),
            stderr: '',
          };
    },
  };
  expect(await observeAwsNativeFailoverInstance(f.plan, f.failover, api)).toBe('running');
  instance.State.Name = 'stopping';
  expect(await observeAwsNativeFailoverInstance(f.plan, f.failover, api)).toBe('pending');
  instance.Tags[1].Value = 'terraform';
  await expect(observeAwsNativeFailoverInstance(f.plan, f.failover, api)).rejects.toThrow('ownership differs');
});
