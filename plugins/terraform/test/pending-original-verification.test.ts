import { expect, test } from 'bun:test';
import { sharePendingOriginalVerification } from '../src/pending-original-verification';

test('shares only pending scans of the same original verification mode', async () => {
  const began = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  let reads = 0,
    availableChecks = 0;
  const guard = sharePendingOriginalVerification(
    async (full) => {
      expect(full).toBe(true);
      reads++;
      began.resolve();
      await finish.promise;
    },
    () => {
      availableChecks++;
    },
  );
  const waiters = Array.from({ length: 6 }, () => guard());
  await began.promise;
  expect(reads).toBe(1);
  finish.resolve();
  await Promise.all(waiters);
  expect(reads).toBe(1);
  expect(availableChecks).toBeGreaterThanOrEqual(12);
});
test('a settled scan never satisfies a later boundary or reuses original bytes', async () => {
  let reads = 0;
  const guard = sharePendingOriginalVerification(
    async () => {
      reads++;
    },
    () => {},
  );
  await guard();
  await guard();
  expect(reads).toBe(2);
});
test('identity-only scans cannot satisfy full byte admission even while pending', async () => {
  const began = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  const modes: boolean[] = [];
  const guard = sharePendingOriginalVerification(
    async (full) => {
      modes.push(full);
      if (!full) {
        began.resolve();
        await finish.promise;
      }
    },
    () => {},
  );
  const identity = guard(false);
  await began.promise;
  await guard(true);
  expect(modes).toEqual([false, true]);
  finish.resolve();
  await identity;
});
test('full scans cannot swallow a separate identity boundary while pending', async () => {
  const began = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  const modes: boolean[] = [];
  const guard = sharePendingOriginalVerification(
    async (full) => {
      modes.push(full);
      if (full) {
        began.resolve();
        await finish.promise;
      }
    },
    () => {},
  );
  const full = guard();
  await began.promise;
  await guard(false);
  expect(modes).toEqual([true, false]);
  finish.resolve();
  await full;
});
test('retirement during a shared scan rejects every waiter and permanently refuses later boundaries', async () => {
  const began = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  const retiredError = new Error('Original transport retired');
  let retired = false,
    reads = 0;
  const guard = sharePendingOriginalVerification(
    async () => {
      reads++;
      began.resolve();
      await finish.promise;
    },
    () => {
      if (retired) throw retiredError;
    },
  );
  const results = Promise.allSettled(Array.from({ length: 6 }, () => guard()));
  await began.promise;
  retired = true;
  finish.resolve();
  for (const result of await results) {
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe(retiredError);
  }
  retired = false;
  await expect(guard(false)).rejects.toBe(retiredError);
  expect(reads).toBe(1);
});
test('one original refusal rejects both pending modes and survives apparent restoration', async () => {
  const began = Promise.withResolvers<void>(),
    finish = Promise.withResolvers<void>();
  const original = new Error('Original identity replaced');
  let calls = 0;
  const guard = sharePendingOriginalVerification(
    async (full) => {
      calls++;
      if (full) {
        began.resolve();
        await finish.promise;
      } else throw original;
    },
    () => {},
  );
  const full = guard();
  const caughtFull = full.catch((error) => error);
  await began.promise;
  await expect(guard(false)).rejects.toBe(original);
  finish.resolve();
  expect(await caughtFull).toBe(original);
  await expect(guard()).rejects.toBe(original);
  expect(calls).toBe(2);
});
test('original availability is checked before any verification can begin', async () => {
  const original = new Error('Original authority unavailable');
  let calls = 0;
  const guard = sharePendingOriginalVerification(
    async () => {
      calls++;
    },
    () => {
      throw original;
    },
  );
  await expect(guard()).rejects.toBe(original);
  expect(calls).toBe(0);
});
