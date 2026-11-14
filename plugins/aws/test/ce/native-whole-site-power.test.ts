import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { dispatchAwsNativePowerState, reconcileAwsNativePowerState } from '../../src/ce/native-whole-site-power';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { powerIdentityFixture } from './whole-site-power-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0)) await rm(d, { recursive: true });
});
async function fixture(operation: 'stop' | 'start' = 'stop') {
  const f = powerIdentityFixture();
  const identities = await f.read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identities.owner,
    nodes: identities.nodes,
    servicesSha256: canonicalSha256({ syntheticRetainedServices: [] }),
  };
  const transition = '11111111-1111-4111-8111-111111111111';
  const stop = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, transition);
  const body = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-stopped' as const,
    sourcePlanSha256: f.base.planSha256,
    transitionId: transition,
    stopPlanSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    stoppedEvidenceSha256: 'a'.repeat(64),
    originalAttemptAt: '2026-10-19T00:00:00.000Z',
    observedAt: '2026-10-19T00:00:01.000Z',
  };
  const maintenance = { ...body, receiptSha256: canonicalSha256(body) };
  const plan =
    operation === 'stop' ? stop : buildAwsWholeSitePowerPlan(f.base, 'start', bindings, transition, maintenance);
  const directory = await mkdtemp(join(tmpdir(), 'native-whole-power-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect: operation,
    originalAttemptAt: '2026-10-19T00:00:02.000Z',
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: operation }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: operation === 'stop' ? 3 : 1,
    attempts: { [operation]: attempt },
    pending: attempt,
    complete: false,
    evidence: {},
  });
  const original = f.api.exec;
  const mutations: string[][] = [];
  let lose = false;
  let malformed = false;
  f.instance.State.Name = operation === 'stop' ? 'running' : 'stopped';
  f.api.exec = async (command, args, options) => {
    if (args[1] !== 'stop-instances' && args[1] !== 'start-instances') return original(command, args, options);
    mutations.push(args);
    const previous = f.instance.State.Name;
    f.instance.State.Name = operation === 'stop' ? 'stopping' : 'pending';
    if (lose) throw Error('lost provider response');
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        malformed
          ? {}
          : {
              [operation === 'stop' ? 'StoppingInstances' : 'StartingInstances']: [
                {
                  InstanceId: f.instance.InstanceId,
                  PreviousState: { Name: previous },
                  CurrentState: { Name: f.instance.State.Name },
                },
              ],
            },
      ),
    };
  };
  return {
    ...f,
    plan,
    storage,
    attempt,
    mutations,
    lose: () => {
      lose = true;
    },
    malformed: () => {
      malformed = true;
    },
    dispatch: () => dispatchAwsNativePowerState(f.base, plan, plan.planSha256, operation, storage, f.api, f.runtime),
    reconcile: () =>
      reconcileAwsNativePowerState(f.base, plan, operation, attempt.originalAttemptAt, storage, f.api, f.runtime),
  };
}
for (const operation of ['stop', 'start'] as const) {
  test(`${operation}: exact native dispatch acknowledgement requires independent cloud convergence`, async () => {
    const f = await fixture(operation);
    await f.dispatch();
    expect(f.mutations).toHaveLength(1);
    expect(await f.reconcile()).toBe('pending');
    f.instance.State.Name = operation === 'stop' ? 'stopped' : 'running';
    expect(await f.reconcile()).toBe('completed');
    expect(f.mutations[0]).toContain(f.instance.InstanceId);
    expect(f.mutations[0]).toContain('ce-profile');
    expect(f.mutations[0]).not.toContain('--force');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    expect(f.mutations).toHaveLength(1);
  });
  test(`${operation}: lost response is reconciled without repeating the provider mutation`, async () => {
    const f = await fixture(operation);
    f.lose();
    await expect(f.dispatch()).rejects.toThrow('lost provider response');
    f.instance.State.Name = operation === 'stop' ? 'stopped' : 'running';
    expect(await f.reconcile()).toBe('completed');
    await expect(f.dispatch()).rejects.toThrow('submitted');
    expect(f.mutations).toHaveLength(1);
  });
}
test('absence of the private write-ahead marker proves no native provider submission', async () => {
  const f = await fixture();
  expect(await f.reconcile()).toBe('not-submitted');
  expect(f.mutations).toEqual([]);
});
test('wrong authorization and missing original attempt reject before native mutation', async () => {
  const f = await fixture();
  await expect(
    dispatchAwsNativePowerState(f.base, f.plan, 'f'.repeat(64), 'stop', f.storage, f.api, f.runtime),
  ).rejects.toThrow('authorization');
  await f.storage.write(`${f.plan.planId}-checkpoint.json`, { schemaVersion: 1 });
  await expect(f.dispatch()).rejects.toThrow();
  expect(f.mutations).toEqual([]);
});
test('changed native instance/MAC ownership rejects before submission', async () => {
  const f = await fixture();
  f.enis[0].MacAddress = '02:11:22:33:44:55';
  await expect(f.dispatch()).rejects.toThrow();
  expect(f.mutations).toEqual([]);
});
test('malformed acknowledgement remains submitted and cannot be replayed', async () => {
  const f = await fixture();
  f.malformed();
  await expect(f.dispatch()).rejects.toThrow('acknowledgement');
  await expect(f.dispatch()).rejects.toThrow('submitted');
  expect(f.mutations).toHaveLength(1);
});
test('original native submission time cannot be replaced during reconciliation', async () => {
  const f = await fixture();
  await f.dispatch();
  await expect(
    reconcileAwsNativePowerState(f.base, f.plan, 'stop', '2026-10-19T00:01:00.000Z', f.storage, f.api, f.runtime),
  ).rejects.toThrow('original attempt');
  expect(f.mutations).toHaveLength(1);
});

test('foreign engine/store and altered saved plan reject without dispatch', async () => {
  const f = await fixture();
  const other = powerIdentityFixture('terraform');
  await expect(
    dispatchAwsNativePowerState(other.base, f.plan, f.plan.planSha256, 'stop', f.storage, f.api, f.runtime),
  ).rejects.toThrow();
  const foreign = await CeDeploymentStore.open(directories[directories.length - 1], {
    ...f.storage.owner,
    engine: 'terraform',
  }).catch(() => undefined);
  expect(foreign).toBeUndefined();
  await f.storage.write(`${f.plan.planId}.json`, { ...f.plan, bindingsSha256: 'f'.repeat(64) });
  await expect(f.dispatch()).rejects.toThrow('saved immutable plan');
  expect(f.mutations).toEqual([]);
});
test('tampered write-ahead marker rejects reconciliation without replay', async () => {
  const f = await fixture();
  await f.dispatch();
  const name = `${f.plan.planId}-stop-native-dispatch.json`;
  const marker = (await f.storage.read(name)) as Record<string, unknown>;
  await f.storage.write(name, { ...marker, instanceId: 'i-11111111111111111' });
  await expect(f.reconcile()).rejects.toThrow('marker differs');
  await expect(f.dispatch()).rejects.toThrow('submitted');
  expect(f.mutations).toHaveLength(1);
});
test('unavailable or foreign cloud evidence cannot complete a submitted transition', async () => {
  const f = await fixture();
  await f.dispatch();
  f.instance.State.Name = 'stopped';
  f.identity();
  await expect(f.reconcile()).rejects.toThrow('account differs');
  expect(f.mutations).toHaveLength(1);
});
test('concurrent native dispatches submit the original attempt at most once', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.dispatch(), f.dispatch()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  expect(f.mutations).toHaveLength(1);
});
test('aborted native dispatch does not persist a provider marker or mutate', async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    dispatchAwsNativePowerState(
      f.base,
      f.plan,
      f.plan.planSha256,
      'stop',
      f.storage,
      f.api,
      f.runtime,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(await f.reconcile()).toBe('not-submitted');
  expect(f.mutations).toEqual([]);
});
