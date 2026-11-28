import { expect, test } from 'bun:test';
import { bindCleanupObservationConcurrency } from '../../src/ce/bounded-cleanup-observations';
import { gcpTeardownResourceObservationArgs } from '../../src/ce/deployment-teardown';
import {
  assertOriginalObserverLiveBindings,
  inspectPublicTerraformOwnership,
} from '../../src/ce/terraform-public-ownership';
import type { GcloudExecApi } from '../../src/gcloud/exec';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

function harness(qualified = true) {
  const f = observerOwnershipFixture();
  const original = f.runtime.api.exec.bind(f.runtime.api);
  const inventory = new Set(f.scope.map((r) => JSON.stringify(gcpTeardownResourceObservationArgs(r))));
  const seen = new Set<string>();
  const calls: string[][] = [];
  let active = 0,
    maximum = 0;
  let intercept: GcloudExecApi['exec'] | undefined;
  const api: GcloudExecApi = {
    exec: async (command, args, options) => {
      active++;
      maximum = Math.max(active, maximum);
      calls.push([...args]);
      try {
        const result = await (intercept ?? original)(command, args, options);
        if (inventory.has(JSON.stringify(args))) seen.add(JSON.stringify(args));
        return result;
      } finally {
        active--;
      }
    },
  };
  if (qualified) bindCleanupObservationConcurrency(api, 3);
  return {
    f,
    api,
    original,
    inventory,
    seen,
    calls,
    active: () => active,
    maximum: () => maximum,
    intercept: (fn: GcloudExecApi['exec']) => {
      intercept = fn;
    },
    runtime: { ...f.runtime, api },
  };
}
const supplementalFirewall = (args: string[]) => args.includes('--format=json(id,selfLink,creationTimestamp)');

test('qualified supplemental firewall verification starts only after every inventory read completes', async () => {
  const h = harness();
  h.intercept(async (command, args, options) => {
    if (supplementalFirewall(args)) expect(h.seen.size).toBe(h.inventory.size);
    return h.original(command, args, options);
  });
  const owned = await inspectPublicTerraformOwnership(h.runtime, h.f.i, h.f.receipt);
  expect(owned.resources.map((r) => r.selfLink)).toEqual(h.f.scope.map((r) => r.selfLink));
  expect(owned.addresses).toHaveLength(21);
  expect(h.maximum()).toBe(3);
  expect(h.active()).toBe(0);
});

test('independent observer disk and VM verification share the issued three-read bound', async () => {
  const h = harness();
  const resources = h.f.scope.map((r) => ({ ...r, id: String(h.f.live.get(r.selfLink)?.id) }));
  await assertOriginalObserverLiveBindings(h.runtime, h.f.i, resources);
  expect(h.calls).toHaveLength(2);
  expect(h.maximum()).toBe(2);
  expect(h.active()).toBe(0);
});

test('copied API metadata preserves sequential observer and firewall verification', async () => {
  const h = harness(false);
  Object.assign(h.api, { readConcurrency: 3 });
  const owned = await inspectPublicTerraformOwnership(h.runtime, h.f.i, h.f.receipt);
  expect(owned.complete).toBe(true);
  expect(h.maximum()).toBe(1);
  expect(h.active()).toBe(0);
});

test('changed firewall identity drains its entire supplemental batch and starts no later reads', async () => {
  const h = harness();
  let release = () => {},
    started = 0,
    finished = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.intercept(async (command, args, options) => {
    const index = supplementalFirewall(args) ? started++ : -1;
    if (index === 2) await gate;
    const result = await h.original(command, args, options);
    return index === 0 ? { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), id: '999' }) } : result;
  });
  const pending = inspectPublicTerraformOwnership(h.runtime, h.f.i, h.f.receipt).catch((error) => {
    finished = true;
    return error;
  });
  try {
    await Bun.sleep(10);
    expect(started).toBe(3);
    expect(finished).toBe(false);
  } finally {
    release();
    await pending;
  }
  expect(await pending).toBeInstanceOf(Error);
  expect(started).toBe(3);
  expect(h.active()).toBe(0);
  expect(h.calls.some((args) => args.includes('--format=json(id,selfLink,sourceImage,sourceImageId)'))).toBe(false);
});

test('caller cancellation drains the supplemental batch under the original signal', async () => {
  const h = harness();
  const controller = new AbortController(),
    reason = new Error('original publication deadline');
  let release = () => {},
    started = 0;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.intercept(async (command, args, options) => {
    expect(options?.signal).toBe(controller.signal);
    if (supplementalFirewall(args)) {
      started++;
      await gate;
    }
    return h.original(command, args, options);
  });
  const pending = inspectPublicTerraformOwnership(h.runtime, h.f.i, h.f.receipt, controller.signal).catch(
    (error) => error,
  );
  try {
    await Bun.sleep(10);
    expect(started).toBe(3);
  } finally {
    controller.abort(reason);
    release();
    await pending;
  }
  expect(await pending).toBe(reason);
  expect(started).toBe(3);
  expect(h.active()).toBe(0);
});

test('qualified verification retains ambiguous firewall insert refusal', async () => {
  const h = harness();
  h.intercept(async (command, args, options) => {
    const result = await h.original(command, args, options);
    if (args.includes('operations')) {
      const rows = JSON.parse(result.stdout);
      return { ...result, stdout: JSON.stringify([...rows, ...rows]) };
    }
    return result;
  });
  await expect(inspectPublicTerraformOwnership(h.runtime, h.f.i, h.f.receipt)).rejects.toThrow(
    'insert target identity',
  );
  expect(h.active()).toBe(0);
});

test('observer image refusal drains the concurrently started VM read', async () => {
  const h = harness();
  let release = () => {},
    finished = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  h.intercept(async (command, args, options) => {
    if (args.includes('instances')) await gate;
    const result = await h.original(command, args, options);
    return args.includes('disks')
      ? { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), sourceImageId: '999' }) }
      : result;
  });
  const resources = h.f.scope.map((r) => ({ ...r, id: String(h.f.live.get(r.selfLink)?.id) }));
  const pending = assertOriginalObserverLiveBindings(h.runtime, h.f.i, resources).catch((error) => {
    finished = true;
    return error;
  });
  try {
    await Bun.sleep(10);
    expect(h.calls).toHaveLength(2);
    expect(finished).toBe(false);
  } finally {
    release();
    await pending;
  }
  expect(String(await pending)).toContain('numeric image binding');
  expect(h.active()).toBe(0);
});

test('partial observer disk is checked without inferring the missing VM', async () => {
  const h = harness();
  const disk = h.f.scope.find((r) => r.kind === 'disk' && r.selfLink.endsWith('/ce-test-observer'));
  if (!disk) throw new Error('Missing original fixture disk');
  await assertOriginalObserverLiveBindings(h.runtime, h.f.i, [
    { ...disk, id: String(h.f.live.get(disk.selfLink)?.id) },
  ]);
  expect(h.calls).toHaveLength(1);
  expect(h.calls[0]).toContain('disks');
});
