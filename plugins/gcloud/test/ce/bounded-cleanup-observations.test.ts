import { expect, test } from 'bun:test';
import { mapCleanupObservations, readCleanupObservationConcurrency } from '../../src/ce/bounded-cleanup-observations';

const gate = () => {
  let release: () => void = () => {};
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
};
test('bounded observations preserve source order despite completion order', async () => {
  const gates = [gate(), gate(), gate()];
  const begun = gate();
  let started = 0;
  const pending = mapCleanupObservations(
    [0, 1, 2],
    async (value) => {
      if (++started === 3) begun.release();
      await gates[value].promise;
      return value * 2;
    },
    undefined,
    3,
  );
  await begun.promise;
  gates[2].release();
  gates[1].release();
  gates[0].release();
  expect(await pending).toEqual([0, 2, 4]);
});
test('bounded observation batches never exceed three started reads', async () => {
  let active = 0,
    maximum = 0;
  const reads: number[] = [];
  const result = await mapCleanupObservations(
    Array.from({ length: 11 }, (_, n) => n),
    async (value) => {
      active++;
      maximum = Math.max(maximum, active);
      reads.push(value);
      await Promise.resolve();
      active--;
      return value;
    },
    undefined,
    3,
  );
  expect(maximum).toBe(3);
  expect(result).toEqual(reads);
  expect(active).toBe(0);
});
test('failed batch settles every started read before refusal and starts no next batch', async () => {
  const wait = gate(),
    begun = gate();
  const error = new Error('ownership replaced');
  const starts: number[] = [];
  let finished = false;
  const pending = mapCleanupObservations(
    [0, 1, 2, 3, 4],
    async (value) => {
      starts.push(value);
      if (starts.length === 3) begun.release();
      if (value === 0) throw error;
      await wait.promise;
      return value;
    },
    undefined,
    3,
  );
  const observed = pending.catch((e) => {
    finished = true;
    return e;
  });
  await begun.promise;
  await Promise.resolve();
  expect(finished).toBe(false);
  wait.release();
  expect(await observed).toBe(error);
  expect(starts).toEqual([0, 1, 2]);
});
test('parent abort drains started reads and cannot reset the parent deadline', async () => {
  const wait = gate(),
    begun = gate();
  const controller = new AbortController();
  const reason = new Error('original deadline');
  const starts: number[] = [];
  const pending = mapCleanupObservations(
    [0, 1, 2, 3],
    async (value) => {
      starts.push(value);
      if (starts.length === 3) begun.release();
      await wait.promise;
      return value;
    },
    controller.signal,
    3,
  );
  const observed = pending.catch((e) => e);
  await begun.promise;
  controller.abort(reason);
  wait.release();
  expect(await observed).toBe(reason);
  expect(starts).toEqual([0, 1, 2]);
});
test('unqualified and copied API payloads retain sequential observations', async () => {
  expect(readCleanupObservationConcurrency({ readConcurrency: 3 })).toBe(1);
  let active = 0,
    maximum = 0;
  await mapCleanupObservations([0, 1, 2], async () => {
    active++;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
  });
  expect(maximum).toBe(1);
});
test('empty inventory starts no observations', async () => {
  let calls = 0;
  expect(
    await mapCleanupObservations([], async () => {
      calls++;
    }),
  ).toEqual([]);
  expect(calls).toBe(0);
});
test('invalid concurrency refuses before observations', async () => {
  let calls = 0;
  await expect(
    mapCleanupObservations(
      [1],
      async () => {
        calls++;
      },
      undefined,
      2 as 1 | 3,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
