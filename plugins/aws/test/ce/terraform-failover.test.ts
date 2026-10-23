import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import {
  awsTerraformFailoverStages,
  buildAwsTerraformFailover,
  runAwsTerraformFailover,
  validateAwsTerraformFailoverPlan,
} from '../../src/ce/terraform-failover';
import { connectFixture } from './terraform-connect-fixture';

interface TestCheckpoint {
  attempts: Record<string, { observedAt: string; instanceId: string }>;
  timings: Record<string, { elapsedMs: number; thresholdMs: number }>;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const instanceId = 'i-0123456789abcdef0';
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
function fixture() {
  const f = connectFixture();
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  draft.accountId = draft.intent.accountId;
  draft.region = draft.intent.region;
  draft.deploymentName = draft.intent.deploymentName;
  const planSha256 = canonicalSha256(draft);
  f.plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const configuration = renderAwsTerraformConnect(f.plan, f.observation, f.bootstrap);
  return {
    ...f,
    configuration,
    stages: awsTerraformFailoverStages(f.plan, 1, instanceId, configuration, hash(configuration)),
  };
}

test('adds only a graceful power control and restores the original configuration byte for byte', () => {
  const f = fixture();
  const original = JSON.parse(f.configuration);
  for (const [phase, state] of [
    ['stop', 'stopped'],
    ['start', 'running'],
  ] as const) {
    const current = JSON.parse(f.stages[phase].configuration);
    expect(current.resource.aws_ec2_instance_state.ce_failover).toEqual({
      instance_id: instanceId,
      state,
      force: false,
    });
    delete current.resource.aws_ec2_instance_state;
    expect(current).toEqual(original);
  }
  expect(f.stages.release.configuration).toBe(f.configuration);
  expect(f.stages.start.previousConfigurationSha256).toBe(f.stages.stop.configurationSha256);
  expect(f.stages.release.previousConfigurationSha256).toBe(f.stages.start.configurationSha256);
});

test('rejects stale configuration, wrong engine, instance ownership and overlapping controls', () => {
  const f = fixture();
  expect(() => awsTerraformFailoverStages(f.plan, 1, instanceId, f.configuration, '0'.repeat(64))).toThrow();
  expect(() => awsTerraformFailoverStages(f.plan, 99, instanceId, f.configuration, hash(f.configuration))).toThrow();
  expect(() =>
    awsTerraformFailoverStages(f.plan, 1, '__UNRESOLVED__', f.configuration, hash(f.configuration)),
  ).toThrow();
  for (const mutate of [
    (v: ReturnType<typeof JSON.parse>) => {
      v.resource.aws_instance.node_1.tags['xcsh-execution-engine'] = 'native';
    },
    (v: ReturnType<typeof JSON.parse>) => {
      v.resource.aws_ec2_instance_state = { other: { instance_id: instanceId, state: 'running' } };
    },
  ]) {
    const config = JSON.parse(f.configuration);
    mutate(config);
    const text = JSON.stringify(config);
    expect(() => awsTerraformFailoverStages(f.plan, 1, instanceId, text, hash(text))).toThrow();
  }
});

test('admits only the selected power-control action and complete no-op coverage of existing resources', () => {
  const f = fixture();
  const stage = f.stages.stop;
  const receipt = {
    schemaVersion: 1 as const,
    deploymentId: f.plan.deploymentName,
    engine: 'terraform' as const,
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: stage.configurationSha256,
    providerLockSha256: 'lock',
    planSha256: 'binary',
    noChanges: false,
    changes: [
      ...stage.retainedAddresses.map(({ address, type }) => ({ address, type, actions: ['no-op'] })),
      { address: stage.controlAddress, type: 'aws_ec2_instance_state', actions: ['create'] },
    ],
  };
  expect(() => validateAwsTerraformFailoverPlan(stage, receipt)).not.toThrow();
  for (const actions of [['create'], ['update'], ['delete'], ['delete', 'create']]) {
    const changed = structuredClone(receipt);
    changed.changes[0].actions = actions;
    expect(() => validateAwsTerraformFailoverPlan(stage, changed)).toThrow();
  }
  const missing = structuredClone(receipt);
  missing.changes.shift();
  expect(() => validateAwsTerraformFailoverPlan(stage, missing)).toThrow();
  const foreign = structuredClone(receipt);
  foreign.changes.push({ address: 'aws_instance.foreign', type: 'aws_instance', actions: ['no-op'] });
  expect(() => validateAwsTerraformFailoverPlan(stage, foreign)).toThrow();
  const wrongControl = structuredClone(receipt);
  const control = wrongControl.changes.at(-1);
  if (!control) throw new Error('Missing test power control');
  control.actions = ['delete'];
  expect(() => validateAwsTerraformFailoverPlan(stage, wrongControl)).toThrow();
  for (const [phase, actions] of [
    ['start', ['update']],
    ['release', ['delete']],
  ] as const) {
    const next = structuredClone(receipt);
    next.configurationSha256 = f.stages[phase].configurationSha256;
    const nextControl = next.changes.at(-1);
    if (!nextControl) throw new Error('Missing test power control');
    nextControl.actions = [...actions];
    expect(() => validateAwsTerraformFailoverPlan(f.stages[phase], next)).not.toThrow();
    next.changes.pop();
    if (phase === 'release') {
      next.noChanges = true;
      expect(() => validateAwsTerraformFailoverPlan(f.stages[phase], next)).not.toThrow();
    } else {
      expect(() => validateAwsTerraformFailoverPlan(f.stages[phase], next)).toThrow();
    }
  }
});

async function executionFixture() {
  const f = fixture();
  const failover = buildAwsTerraformFailover(f.plan, 1, instanceId, f.configuration, hash(f.configuration));
  const directory = await mkdtemp(join(tmpdir(), 'aws-tf-failover-'));
  directories.push(directory);
  const owner = {
    deploymentId: f.plan.deploymentName,
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: f.plan.accountId,
    region: f.plan.region,
  };
  const storage = await CeDeploymentStore.open(directory, owner);
  let configuration = f.configuration;
  let applied = 'release';
  let failAfterStop = false;
  const calls: string[] = [];
  const session = {
    async reviseConfiguration(expected: string, next: string) {
      expect(hash(configuration)).toBe(expected);
      configuration = next;
      return hash(next);
    },
    async plan() {
      const phase =
        hash(configuration) === failover.stages.stop.configurationSha256
          ? 'stop'
          : hash(configuration) === failover.stages.start.configurationSha256
            ? 'start'
            : 'release';
      const stage = failover.stages[phase];
      const control =
        phase === 'release'
          ? applied === 'release'
            ? []
            : [{ address: stage.controlAddress, type: 'aws_ec2_instance_state', actions: ['delete'] }]
          : [
              {
                address: stage.controlAddress,
                type: 'aws_ec2_instance_state',
                actions: [phase === 'stop' ? 'create' : 'update'],
              },
            ];
      return {
        schemaVersion: 1 as const,
        deploymentId: stage.deploymentId,
        engine: 'terraform' as const,
        backendIdentity: `local:${stage.deploymentId}`,
        configurationSha256: stage.configurationSha256,
        providerLockSha256: 'a'.repeat(64),
        planSha256: hash(`${phase}-${applied}`),
        changes: [
          ...stage.retainedAddresses.map(({ address, type }) => ({ address, type, actions: ['no-op'] })),
          ...control,
        ],
        noChanges: control.length === 0,
      };
    },
    async apply(receipt: { configurationSha256: string }) {
      const phase = Object.values(failover.stages).find(
        (stage) => stage.configurationSha256 === receipt.configurationSha256,
      )?.phase;
      if (!phase) throw new Error('Unknown configuration');
      calls.push(phase);
      applied = phase;
      if (phase === 'stop' && failAfterStop) {
        failAfterStop = false;
        throw new Error('lost response');
      }
    },
  } as unknown as TerraformSession;
  return { ...f, failover, storage, session, calls, setFailAfterStop: () => (failAfterStop = true) };
}

test('executes stop, exact outage, start, restoration, release and a final no-change plan', async () => {
  const f = await executionFixture();
  const evidence: string[] = [];
  const result = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async (phase) => {
      evidence.push(phase);
      return { acceptance: 'passed' };
    },
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  expect(result.status).toBe('failover-complete');
  expect(f.calls).toEqual(['stop', 'start', 'release']);
  expect(evidence).toEqual(['outage', 'recovered']);
  expect(result.traffic).toBe('unknown');
});

test('resumes the exact submitted stop plan after an ambiguous response', async () => {
  const f = await executionFixture();
  f.setFailAfterStop();
  await expect(
    runAwsTerraformFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      f.session,
      f.storage,
      async () => ({ acceptance: 'passed' }),
      {},
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {} },
    ),
  ).rejects.toThrow('lost response');
  const result = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async () => ({ acceptance: 'passed' }),
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {} },
  );
  expect(result.status).toBe('failover-complete');
  expect(f.calls).toEqual(['stop', 'stop', 'start', 'release']);
});

test('late restoration fails timing acceptance after restorative release and no-change', async () => {
  const f = await executionFixture();
  let now = Date.now();
  const result = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async (phase) => {
      if (phase === 'recovered') now += 212_977;
      return { acceptance: 'passed' };
    },
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {}, now: () => now },
  );
  expect(f.calls).toEqual(['stop', 'start', 'release']);
  expect(result.status).toBe('failover-acceptance-failed');
  expect(result.restorationTiming.status).toBe('failed');
  expect(result.restorationTiming.elapsedMs).toBe(212_977);
  expect(result.restorationTiming.thresholdMs).toBe(45_000);
});

test('restoration timing includes apply and survives an interrupted convergence without resetting origin', async () => {
  const f = await executionFixture();
  let now = Date.now();
  const originalApply = f.session.apply.bind(f.session);
  f.session.apply = async (...args) => {
    await originalApply(...args);
    if (args[0].configurationSha256 === f.failover.stages.start.configurationSha256) now += 45_001;
  };
  await expect(
    runAwsTerraformFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      f.session,
      f.storage,
      async (phase) => {
        if (phase === 'recovered') throw new Error('interrupted observation');
        return { acceptance: 'passed' };
      },
      {},
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {}, now: () => now },
    ),
  ).rejects.toThrow('interrupted observation');
  const before = (await f.storage.read(`${f.failover.planId}-checkpoint.json`)) as TestCheckpoint;
  const result = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async () => ({ acceptance: 'passed' }),
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {}, now: () => now },
  );
  expect(result.restorationTiming.originalAttemptAt).toBe(before.attempts.start.observedAt);
  expect(result.restorationTiming.elapsedMs).toBe(45_001);
  expect(result.status).toBe('failover-acceptance-failed');
  expect(f.calls).toEqual(['stop', 'start', 'release']);
});

test('exact timing boundary passes and old complete checkpoints cannot invent a timing origin', async () => {
  const f = await executionFixture();
  let now = Date.now();
  const result = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async (phase) => {
      if (phase === 'recovered') now += 45_000;
      return { acceptance: 'passed' };
    },
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {}, now: () => now },
  );
  expect(result.status).toBe('failover-complete');
  expect(result.restorationTiming.elapsedMs).toBe(45_000);
  const checkpoint = (await f.storage.read(`${f.failover.planId}-checkpoint.json`)) as TestCheckpoint;
  delete (checkpoint as Partial<TestCheckpoint>).attempts;
  delete (checkpoint as Partial<TestCheckpoint>).timings;
  await f.storage.write(`${f.failover.planId}-checkpoint.json`, checkpoint);
  const legacy = await runAwsTerraformFailover(
    f.plan,
    f.failover,
    f.failover.planSha256,
    f.session,
    f.storage,
    async () => ({ acceptance: 'passed' }),
    {},
    undefined,
    { attempts: 1, intervalMs: 0, wait: async () => {}, now: () => now },
  );
  expect(legacy.status).toBe('failover-acceptance-unknown');
  expect(legacy.restorationTiming.status).toBe('unknown');
});

test('rejects forged persisted timing and foreign original attempt bindings', async () => {
  const f = await executionFixture();
  const run = () =>
    runAwsTerraformFailover(
      f.plan,
      f.failover,
      f.failover.planSha256,
      f.session,
      f.storage,
      async () => ({ acceptance: 'passed' }),
      {},
      undefined,
      { attempts: 1, intervalMs: 0, wait: async () => {} },
    );
  await run();
  const path = `${f.failover.planId}-checkpoint.json`;
  const original = (await f.storage.read(path)) as TestCheckpoint;
  for (const mutate of [
    (v: TestCheckpoint) => (v.timings.recovered.elapsedMs += 1),
    (v: TestCheckpoint) => (v.timings.recovered.thresholdMs = 300_000),
    (v: TestCheckpoint) => (v.attempts.start.instanceId = 'i-foreign'),
    (v: TestCheckpoint) => (v.attempts.start.observedAt = 'malformed'),
  ]) {
    const value = structuredClone(original);
    mutate(value);
    await f.storage.write(path, value);
    await expect(run()).rejects.toThrow();
  }
});
