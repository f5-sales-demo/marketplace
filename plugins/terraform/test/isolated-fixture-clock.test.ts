/** Synthetic expiry must not move an independent original executor clock. */
import { expect, test } from 'bun:test';
import { createIsolatedFixtureClock } from './isolated-fixture-clock';

test('a scoped expiry survives awaited reads while independent execution retains its original clock', async () => {
  const clock = createIsolatedFixtureClock(() => 1000);
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const expired = clock.withOffset(7200001, async () => {
    expect(clock.read()).toBe(7201001);
    entered();
    await released;
    expect(clock.read()).toBe(7201001);
    return clock.read();
  });
  try {
    await ready;
    expect(clock.read()).toBe(1000);
    expect(
      await clock.withOffset(300001, async () => {
        await Promise.resolve();
        return clock.read();
      }),
    ).toBe(301001);
    expect(clock.read()).toBe(1000);
  } finally {
    release();
  }
  expect(await expired).toBe(7201001);
  expect(clock.read()).toBe(1000);
});

test('a rejected or nested expiry restores only its own caller clock', async () => {
  const clock = createIsolatedFixtureClock(() => 1000);
  await expect(
    clock.withOffset(300001, async () => {
      await clock.withOffset(7200001, async () => expect(clock.read()).toBe(7201001));
      expect(clock.read()).toBe(301001);
      throw new Error('retained expiry');
    }),
  ).rejects.toThrow('retained expiry');
  expect(clock.read()).toBe(1000);
});
