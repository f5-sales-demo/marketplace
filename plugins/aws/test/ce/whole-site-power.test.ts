import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import {
  type AwsPowerBindings,
  type AwsPowerEvidence,
  type AwsPowerMaintenance,
  type AwsWholeSitePowerDriver,
  buildAwsWholeSitePowerPlan,
  runAwsWholeSitePower,
  verifyAwsWholeSitePowerPlan,
} from '../../src/ce/whole-site-power';
import { foundationPlan } from './terraform-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
const transition = '11111111-1111-4111-8111-111111111111';

async function fixture(engine: 'native' | 'terraform' = 'native') {
  const source = foundationPlan();
  const { planId: _id, planSha256: _sha, ...body } = source;
  body.engine = engine;
  body.intent = {
    ...body.intent,
    engine,
    topology: { nodeCount: 1, sites: [{ name: body.intent.siteName, nodeIndexes: [1] }] },
    interfaces: body.intent.interfaces.map((item) => ({ ...item, subnets: item.subnets.slice(0, 1) })),
  };
  Object.assign(body, {
    interfaces: structuredClone(body.intent.interfaces),
    topology: structuredClone(body.intent.topology),
  });
  Object.assign(body, {
    accountId: body.intent.accountId,
    region: body.intent.region,
    deploymentName: body.intent.deploymentName,
    routing: structuredClone(body.intent.routing),
  });
  const planSha256 = canonicalSha256(body);
  const base = { ...body, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const owner = {
    deploymentId: base.deploymentName,
    engine,
    provider: 'aws' as const,
    account: base.accountId,
    region: base.region,
  };
  const bindings: AwsPowerBindings = {
    sourcePlanSha256: base.planSha256,
    owner,
    servicesSha256: canonicalSha256({ services: 'retained-fixture' }),
    nodes: siteBindings(base).flatMap(({ site, binding }) =>
      site.nodeIndexes.map((nodeIndex, offset) => ({
        nodeIndex,
        nodeName: binding.nodes[offset],
        siteName: site.name,
        instanceId: `i-${String(nodeIndex).padStart(16, '0')}`,
        interfaces: base.interfaces.map((item) => ({
          index: item.index,
          role: item.role,
          id: `eni-${String(nodeIndex * 10 + item.index).padStart(16, '0')}`,
          mac: `02:00:00:00:00:${String(nodeIndex * 10 + item.index).padStart(2, '0')}`,
          device: item.guestDevice ?? `ens${5 + item.index}`,
        })),
      })),
    ),
  };
  const directory = await mkdtemp(join(tmpdir(), 'aws-whole-power-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, owner);
  let now = Date.parse('2026-10-19T00:00:00Z');
  let cloud: 'running' | 'stopped' = 'running';
  let services: 'active' | 'withdrawn' = 'active';
  let freshness = true;
  let receiptAge = 0;
  let lose: string | undefined;
  let reconciliation: 'completed' | 'pending' | 'unknown' = 'completed';
  const current = structuredClone(bindings);
  const calls: string[] = [];
  const driver: AwsWholeSitePowerDriver = {
    engine,
    readBindings: async () => structuredClone(current),
    observe: async (plan, gate): Promise<AwsPowerEvidence> => ({
      source: 'live',
      planSha256: plan.planSha256,
      bindingsSha256: plan.bindingsSha256,
      gate,
      collectedAt: new Date(now - receiptAge).toISOString(),
      identity: 'verified',
      cloud,
      services,
      traffic: services === 'active' ? 'passing' : 'blocked',
      registration: 'healthy',
      configuration: 'verified',
      versions: 'stable',
      interfaces: 'up',
      canSatisfyInterfaceMutationGate: freshness,
    }),
    execute: async (_plan, effect) => {
      calls.push(effect);
      if (effect === 'withdraw') services = 'withdrawn';
      else if (effect === 'stop') cloud = 'stopped';
      else if (effect === 'start') cloud = 'running';
      else if (effect === 'restore') services = 'active';
      if (lose === effect) {
        lose = undefined;
        throw new Error('lost response');
      }
    },
    reconcile: async () => reconciliation,
    finish: async () => ({ engine, noChanges: true }),
  };
  const stop = buildAwsWholeSitePowerPlan(base, 'stop', bindings, transition);
  return {
    base,
    bindings,
    storage,
    stop,
    calls,
    driver,
    clock: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    freshness: (value: boolean) => {
      freshness = value;
    },
    age: (value: number) => {
      receiptAge = value;
    },
    lose: (effect: string) => {
      lose = effect;
    },
    reconcile: (value: typeof reconciliation) => {
      reconciliation = value;
    },
    drift: () => {
      current.nodes[0].interfaces[0].id = 'eni-ffffffffffffffff';
    },
  };
}

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine}: stop retains maintenance, then start restores the same identities`, async () => {
    const f = await fixture(engine);
    const stopped = await runAwsWholeSitePower(
      f.base,
      f.stop,
      f.stop.planSha256,
      f.storage,
      f.driver,
      undefined,
      f.clock,
    );
    expect(stopped.status).toBe('site-stopped');
    expect(f.calls).toEqual(['withdraw', 'stop']);
    expect(stopped.originalCeHeartbeat).toBe('unknown');
    expect(stopped.fullCeAcceptance).toBe(false);
    const maintenance = 'maintenance' in stopped ? stopped.maintenance : undefined;
    expect(maintenance).toBeDefined();
    const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.bindings, transition, maintenance);
    f.advance(1000);
    const started = await runAwsWholeSitePower(
      f.base,
      start,
      start.planSha256,
      f.storage,
      f.driver,
      undefined,
      f.clock,
    );
    expect(started.status).toBe('site-started');
    expect(f.calls).toEqual(['withdraw', 'stop', 'start', 'restore', 'release']);
    const second = buildAwsWholeSitePowerPlan(f.base, 'stop', f.bindings, '22222222-2222-4222-8222-222222222222');
    expect(second.planSha256).not.toBe(f.stop.planSha256);
    expect(
      (await runAwsWholeSitePower(f.base, second, second.planSha256, f.storage, f.driver, undefined, f.clock)).status,
    ).toBe('site-stopped');
  });
}

test('missing CE freshness cannot authorize power mutation despite a current collector receipt', async () => {
  const f = await fixture();
  f.freshness(false);
  const result = await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  expect(result.status).toBe('power-pending');
  expect(f.calls).toEqual([]);
});

for (const age of [31_000, -1]) {
  test(`rejects stale or future collector receipts (${age}) before mutation`, async () => {
    const f = await fixture();
    f.age(age);
    expect(
      (await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock)).status,
    ).toBe('power-pending');
    expect(f.calls).toEqual([]);
  });
}

test('start rejects missing, foreign and unretained stopped maintenance', async () => {
  const f = await fixture();
  expect(() => buildAwsWholeSitePowerPlan(f.base, 'start', f.bindings, transition)).toThrow('maintenance receipt');
  const fakeBody = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-stopped' as const,
    sourcePlanSha256: f.base.planSha256,
    transitionId: transition,
    stopPlanSha256: f.stop.planSha256,
    bindingsSha256: f.stop.bindingsSha256,
    stoppedEvidenceSha256: 'a'.repeat(64),
    originalAttemptAt: new Date(f.clock()).toISOString(),
    observedAt: new Date(f.clock()).toISOString(),
  };
  const maintenance: AwsPowerMaintenance = { ...fakeBody, receiptSha256: canonicalSha256(fakeBody) };
  const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.bindings, transition, maintenance);
  await expect(
    runAwsWholeSitePower(f.base, start, start.planSha256, f.storage, f.driver, undefined, f.clock),
  ).rejects.toThrow();
  expect(f.calls).toEqual([]);
  expect(() =>
    buildAwsWholeSitePowerPlan(f.base, 'start', f.bindings, transition, {
      ...maintenance,
      bindingsSha256: 'b'.repeat(64),
    }),
  ).toThrow('another deployment');
});

test('live identity drift and wrong-engine execution reject before mutation', async () => {
  const f = await fixture();
  f.drift();
  await expect(
    runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock),
  ).rejects.toThrow('identities');
  await expect(
    runAwsWholeSitePower(
      f.base,
      f.stop,
      f.stop.planSha256,
      f.storage,
      { ...f.driver, engine: 'terraform' },
      undefined,
      f.clock,
    ),
  ).rejects.toThrow('owning engine');
  expect(f.calls).toEqual([]);
});

test('unresolved or duplicate interface identities cannot be compiled', async () => {
  const f = await fixture();
  const b = structuredClone(f.bindings);
  b.nodes[0].interfaces[0].id = '__ENI_1_0__';
  expect(() => buildAwsWholeSitePowerPlan(f.base, 'stop', b, transition)).toThrow('unresolved');
  b.nodes[0].interfaces[0] = { ...b.nodes[0].interfaces[1], index: 0 };
  expect(() => buildAwsWholeSitePowerPlan(f.base, 'stop', b, transition)).toThrow('duplicated');
  expect(() => verifyAwsWholeSitePowerPlan(f.base, { ...f.stop, operation: 'start' })).toThrow();
});

test('lost stop response resumes from live reconciliation without mutation replay or timing reset', async () => {
  const f = await fixture();
  f.lose('stop');
  await expect(
    runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock),
  ).rejects.toThrow('lost response');
  const first = (await f.storage.read(`${f.stop.planId}-checkpoint.json`)) as {
    attempts: { stop: { originalAttemptAt: string } };
  };
  f.advance(6000);
  const result = await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  expect(result.status).toBe('site-stopped');
  expect(f.calls).toEqual(['withdraw', 'stop']);
  if ('maintenance' in result) expect(result.maintenance.originalAttemptAt).toBe(first.attempts.stop.originalAttemptAt);
});

test('acknowledged but unreconciled withdrawal remains pending and is never replayed', async () => {
  const f = await fixture();
  f.reconcile('pending');
  expect(
    (await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock)).status,
  ).toBe('power-pending');
  f.reconcile('unknown');
  expect(
    (await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock)).status,
  ).toBe('power-pending');
  expect(f.calls).toEqual(['withdraw']);
  f.reconcile('completed');
  expect(
    (await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock)).status,
  ).toBe('site-stopped');
  expect(f.calls).toEqual(['withdraw', 'stop']);
});

test('checkpoint cannot skip withdrawal or invent an original submission timestamp', async () => {
  const f = await fixture();
  f.freshness(false);
  await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  const key = `${f.stop.planId}-checkpoint.json`;
  const state = (await f.storage.read(key)) as Record<string, unknown>;
  await f.storage.write(key, { ...state, step: 3 });
  await expect(
    runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock),
  ).rejects.toThrow('Completed whole-site');
  expect(f.calls).toEqual([]);
});

test('reapplying a completed stop preserves the exact maintenance receipt used by a planned start', async () => {
  const f = await fixture();
  const first = await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  if (!('maintenance' in first)) throw new Error('Expected stopped maintenance');
  const start = buildAwsWholeSitePowerPlan(f.base, 'start', f.bindings, transition, first.maintenance);
  f.advance(6000);
  const repeated = await runAwsWholeSitePower(
    f.base,
    f.stop,
    f.stop.planSha256,
    f.storage,
    f.driver,
    undefined,
    f.clock,
  );
  if (!('maintenance' in repeated)) throw new Error('Expected retained stopped maintenance');
  expect(repeated.maintenance).toEqual(first.maintenance);
  expect(f.calls).toEqual(['withdraw', 'stop']);
  expect(
    (await runAwsWholeSitePower(f.base, start, start.planSha256, f.storage, f.driver, undefined, f.clock)).status,
  ).toBe('site-started');
});

test('interruption between stopped evidence and maintenance persistence recreates the original receipt', async () => {
  const f = await fixture();
  const first = await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  if (!('maintenance' in first)) throw new Error('Expected stopped maintenance');
  await rm(join(f.storage.directory, `${f.stop.planId}-maintenance.json`));
  f.advance(6000);
  const resumed = await runAwsWholeSitePower(
    f.base,
    f.stop,
    f.stop.planSha256,
    f.storage,
    f.driver,
    undefined,
    f.clock,
  );
  if (!('maintenance' in resumed)) throw new Error('Expected resumed maintenance');
  expect(resumed.maintenance).toEqual(first.maintenance);
  expect(f.calls).toEqual(['withdraw', 'stop']);
});
for (const target of ['evidence', 'maintenance'] as const) {
  test(`completed stop rejects altered retained ${target} without overwriting provenance`, async () => {
    const f = await fixture();
    await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
    const name = `${f.stop.planId}-${target === 'evidence' ? 'final-stopped-evidence' : 'maintenance'}.json`;
    const prior = (await f.storage.read(name)) as Record<string, unknown>;
    const changed =
      target === 'evidence'
        ? { ...prior, bindingsSha256: 'f'.repeat(64) }
        : { ...prior, stoppedEvidenceSha256: 'f'.repeat(64) };
    await f.storage.write(name, changed);
    await expect(
      runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock),
    ).rejects.toThrow();
    expect(await f.storage.read(name)).toEqual(changed);
    expect(f.calls).toEqual(['withdraw', 'stop']);
  });
}

test('interruption before provider dispatch preserves the original attempt and submits only once on resume', async () => {
  const f = await fixture();
  const execute = f.driver.execute;
  let interrupted = false;
  f.driver.execute = async (plan, effect, signal) => {
    if (!interrupted) {
      interrupted = true;
      throw Error('interrupted before provider dispatch');
    }
    return execute(plan, effect, signal);
  };
  f.driver.reconcile = async (_plan, effect) => (f.calls.includes(effect) ? 'completed' : 'not-submitted');
  await expect(
    runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock),
  ).rejects.toThrow('interrupted before provider dispatch');
  const first = (await f.storage.read(`${f.stop.planId}-checkpoint.json`)) as {
    attempts: { withdraw: { originalAttemptAt: string } };
  };
  f.advance(6000);
  const result = await runAwsWholeSitePower(f.base, f.stop, f.stop.planSha256, f.storage, f.driver, undefined, f.clock);
  expect(result.status).toBe('site-stopped');
  expect(f.calls).toEqual(['withdraw', 'stop']);
  const final = (await f.storage.read(`${f.stop.planId}-checkpoint.json`)) as {
    attempts: { withdraw: { originalAttemptAt: string } };
  };
  expect(final.attempts.withdraw.originalAttemptAt).toBe(first.attempts.withdraw.originalAttemptAt);
});
