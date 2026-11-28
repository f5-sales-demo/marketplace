import { expect, test } from 'bun:test';
import {
  bindCleanupObservationConcurrency,
  mapCleanupObservations,
  readCleanupObservationConcurrency,
} from '../../src/ce/bounded-cleanup-observations';
import { boundedGcpCleanupObservers } from '../../src/ce/capture-cleanup-admission';
import { inspectPublicTerraformOwnership } from '../../src/ce/terraform-public-ownership';
import { verifyPublicTerraformLiveOwnership } from '../../src/ce/terraform-public-teardown';
import type { GcloudExecApi } from '../../src/gcloud/exec';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('six-read authority belongs to the issued API identity and survives only the qualified wrapper', () => {
  const api = bindCleanupObservationConcurrency({ exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }) }, 6);
  expect(readCleanupObservationConcurrency(api)).toBe(6);
  expect(readCleanupObservationConcurrency({ ...api, readConcurrency: 6 })).toBe(1);
  expect(readCleanupObservationConcurrency({ readConcurrency: 6 })).toBe(1);
  const f = observerOwnershipFixture();
  expect(readCleanupObservationConcurrency(boundedGcpCleanupObservers(api, f.runtime.observePlatform).api)).toBe(6);
});

test('six-read batches retain original ordering and never admit a seventh observation', async () => {
  let active = 0,
    maximum = 0;
  const result = await mapCleanupObservations(
    Array.from({ length: 17 }, (_, i) => i),
    async (value) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return value;
    },
    undefined,
    6,
  );
  expect(result).toEqual(Array.from({ length: 17 }, (_, i) => i));
  expect(maximum).toBe(6);
  expect(active).toBe(0);
});

test('six-read refusal drains every started observation and prevents a later batch', async () => {
  const wait = gate(),
    begun = gate(),
    reason = new Error('original identity replaced');
  let started = 0,
    finished = false;
  const pending = mapCleanupObservations(
    Array.from({ length: 13 }, (_, i) => i),
    async (value) => {
      if (++started === 6) begun.release();
      if (value === 0) throw reason;
      await wait.promise;
      return value;
    },
    undefined,
    6,
  ).catch((error) => {
    finished = true;
    return error;
  });
  await Promise.race([begun.promise, pending]);
  try {
    expect(started).toBe(6);
    expect(finished).toBe(false);
  } finally {
    wait.release();
    await pending;
  }
  expect(await pending).toBe(reason);
  expect(started).toBe(6);
});

test('six-read cancellation preserves the original reason and drains before another batch', async () => {
  const wait = gate(),
    begun = gate(),
    controller = new AbortController();
  const reason = new Error('fixed opening deadline');
  let started = 0;
  const pending = mapCleanupObservations(
    Array.from({ length: 13 }, (_, i) => i),
    async (value) => {
      if (++started === 6) begun.release();
      await wait.promise;
      return value;
    },
    controller.signal,
    6,
  ).catch((error) => error);
  await Promise.race([begun.promise, pending]);
  try {
    expect(started).toBe(6);
  } finally {
    controller.abort(reason);
    wait.release();
    await pending;
  }
  expect(await pending).toBe(reason);
  expect(started).toBe(6);
});

test('both original inventory passes preserve identities through six-read ownership consumers', async () => {
  const f = observerOwnershipFixture(),
    original = f.runtime.api.exec.bind(f.runtime.api);
  let active = 0,
    maximum = 0;
  const api: GcloudExecApi = {
    exec: async (command, args, options) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await Promise.resolve();
        return await original(command, args, options);
      } finally {
        active--;
      }
    },
  };
  bindCleanupObservationConcurrency(api, 6);
  const wrapped = boundedGcpCleanupObservers(api, f.runtime.observePlatform);
  const runtime = { ...f.runtime, ...wrapped };
  const owned = await inspectPublicTerraformOwnership(runtime, f.i, f.receipt);
  expect(owned.resources.map((r) => r.selfLink)).toEqual(f.scope.map((r) => r.selfLink));
  expect(owned.addresses).toHaveLength(21);
  expect(await verifyPublicTerraformLiveOwnership(runtime, f.i, owned)).toEqual([]);
  expect(maximum).toBe(6);
  expect(active).toBe(0);
});

test('unsupported concurrency still refuses before granting authority or starting observations', async () => {
  for (const concurrency of [2, 4, 7]) {
    let calls = 0;
    expect(() => bindCleanupObservationConcurrency({}, concurrency as 1 | 3)).toThrow('read concurrency');
    await expect(
      mapCleanupObservations(
        [1],
        async () => {
          calls++;
        },
        undefined,
        concurrency as 1 | 3,
      ),
    ).rejects.toThrow('read concurrency');
    expect(calls).toBe(0);
  }
});
