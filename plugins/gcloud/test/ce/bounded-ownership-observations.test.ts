import { expect, test } from 'bun:test';
import { bindCleanupObservationConcurrency } from '../../src/ce/bounded-cleanup-observations';
import { boundedGcpCleanupObservers } from '../../src/ce/capture-cleanup-admission';
import { inspectPublicTerraformOwnership } from '../../src/ce/terraform-public-ownership';
import { verifyPublicTerraformLiveOwnership } from '../../src/ce/terraform-public-teardown';
import type { GcloudExecApi } from '../../src/gcloud/exec';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

function counted(f: ReturnType<typeof observerOwnershipFixture>, qualified = true) {
  const original = f.runtime.api.exec.bind(f.runtime.api);
  let active = 0,
    maximum = 0;
  const calls: string[][] = [];
  const api: GcloudExecApi = {
    exec: async (command, args, options) => {
      active++;
      maximum = Math.max(maximum, active);
      calls.push([...args]);
      try {
        await Promise.resolve();
        return await original(command, args, options);
      } finally {
        active--;
      }
    },
  };
  if (qualified) bindCleanupObservationConcurrency(api, 3);
  return { runtime: { ...f.runtime, api }, maximum: () => maximum, active: () => active, calls };
}
test('initial ownership uses qualified bounded reads while preserving all original resource ordering', async () => {
  const f = observerOwnershipFixture(),
    c = counted(f);
  const owned = await inspectPublicTerraformOwnership(c.runtime, f.i, f.receipt);
  expect(c.maximum()).toBe(3);
  expect(c.active()).toBe(0);
  expect(owned.resources.map((r) => r.selfLink)).toEqual(f.scope.map((r) => r.selfLink));
  expect(owned.addresses).toHaveLength(21);
});
test('live ownership recheck uses the same bounded source capability and exact identities', async () => {
  const f = observerOwnershipFixture();
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  const c = counted(f);
  expect(await verifyPublicTerraformLiveOwnership(c.runtime, f.i, owned)).toEqual([]);
  expect(c.maximum()).toBe(3);
  expect(c.active()).toBe(0);
});
test('unqualified copied metadata cannot enable parallel ownership reads', async () => {
  const f = observerOwnershipFixture(),
    c = counted(f, false);
  Object.assign(c.runtime.api, { readConcurrency: 3 });
  const owned = await inspectPublicTerraformOwnership(c.runtime, f.i, f.receipt);
  await verifyPublicTerraformLiveOwnership(c.runtime, f.i, owned);
  expect(c.maximum()).toBe(1);
  expect(c.active()).toBe(0);
});
test('replacement refusal drains the started ownership batch without issuing later observations', async () => {
  const f = observerOwnershipFixture(),
    owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  const original = f.runtime.api.exec.bind(f.runtime.api);
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let started = 0,
    active = 0,
    finished = false;
  const api: GcloudExecApi = {
    exec: async (command, args, options) => {
      const index = started++;
      active++;
      try {
        if (index === 2) await gate;
        const result = await original(command, args, options);
        return index === 1
          ? { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), id: 'foreign' }) }
          : result;
      } finally {
        active--;
      }
    },
  };
  bindCleanupObservationConcurrency(api, 3);
  const pending = verifyPublicTerraformLiveOwnership({ ...f.runtime, api }, f.i, owned).catch((error) => {
    finished = true;
    return error;
  });
  try {
    await Bun.sleep(5);
    expect(started).toBe(3);
    expect(finished).toBe(false);
  } finally {
    release();
    await pending;
  }
  expect(await pending).toBeInstanceOf(Error);
  expect(started).toBe(3);
  expect(active).toBe(0);
});
test('original caller abort remains authoritative after all in-flight ownership reads settle', async () => {
  const f = observerOwnershipFixture(),
    owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  const original = f.runtime.api.exec.bind(f.runtime.api),
    controller = new AbortController();
  const reason = new Error('original opening budget');
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let started = 0;
  const api: GcloudExecApi = {
    exec: async (command, args, options) => {
      started++;
      expect(options?.signal).toBe(controller.signal);
      await gate;
      return original(command, args, options);
    },
  };
  bindCleanupObservationConcurrency(api, 3);
  const pending = verifyPublicTerraformLiveOwnership({ ...f.runtime, api }, f.i, owned, controller.signal).catch(
    (error) => error,
  );
  try {
    await Bun.sleep(5);
    expect(started).toBe(3);
  } finally {
    controller.abort(reason);
    release();
    await pending;
  }
  expect(await pending).toBe(reason);
  expect(started).toBe(3);
});

test('bounded cleanup wrappers preserve only the original source-issued read capability', async () => {
  const f = observerOwnershipFixture(),
    c = counted(f);
  const wrapped = boundedGcpCleanupObservers(c.runtime.api, c.runtime.observePlatform);
  const owned = await inspectPublicTerraformOwnership({ ...c.runtime, ...wrapped }, f.i, f.receipt);
  expect(c.maximum()).toBe(3);
  expect(owned.addresses).toHaveLength(21);
  expect(c.active()).toBe(0);
});
