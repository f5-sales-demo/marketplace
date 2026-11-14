import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInstalledCaptureInputChecks } from '../src/installed-capture-input-checks';
import { readOwnedInstalledInput } from '../src/installed-runtime';
import { monitorOriginalInputs } from '../src/original-input-monitor';

test('capture polling uses admitted identities while execution and final checks still hash all monitors', async () => {
  const events: string[] = [];
  let providers = false;
  const monitor = (name: string) => ({
    assertOriginal: async () => {
      events.push(`${name}:digest`);
    },
    assertOriginalIdentity: async () => {
      events.push(`${name}:identity`);
    },
  });
  const original = monitor('original'),
    provider = monitor('provider');
  let now = 1000;
  const checks = createInstalledCaptureInputChecks({
    verifyStore: async () => {
      events.push('store');
    },
    monitors: () => (providers ? [original, provider] : [original]),
    budget: { start: 1000, deadline: 7201000 },
    clock: () => now,
  });
  await checks.assertCaptureWithinDeadline();
  expect(events).toEqual(['store', 'original:identity']);
  providers = true;
  events.length = 0;
  await checks.assertWithinDeadline();
  expect(events).toEqual(['store', 'original:digest', 'provider:digest']);
  now = 7201000;
  events.length = 0;
  await expect(checks.assertCaptureWithinDeadline()).rejects.toThrow('budget');
  expect(events).toEqual([]);
  await checks.assertInputs();
  expect(events).toEqual(['store', 'original:digest', 'provider:digest']);
});

test('capture clocks do not renew after slow identity checks or accept a backward original clock', async () => {
  let now = 1000;
  const checks = createInstalledCaptureInputChecks({
    verifyStore: async () => {},
    monitors: () => [
      {
        assertOriginal: async () => {},
        assertOriginalIdentity: async () => {
          now = 7201000;
        },
      },
    ],
    budget: { start: 1000, deadline: 7201000 },
    clock: () => now,
  });
  await expect(checks.assertCaptureWithinDeadline()).rejects.toThrow('budget');
  now = 999;
  await expect(checks.assertCaptureWithinDeadline()).rejects.toThrow('budget');
});

test('real admitted file replacement permanently refuses capture identities and full final digest checks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-capture-inputs-'));
  const path = join(root, 'input.private');
  await writeFile(path, 'original-bytes', { mode: 0o400 });
  const binding = (await readOwnedInstalledInput(path)).binding;
  const original = await monitorOriginalInputs({ input: binding });
  const checks = createInstalledCaptureInputChecks({
    verifyStore: async () => {},
    monitors: () => [original],
    budget: { start: 1000, deadline: 7201000 },
    clock: () => 1000,
  });
  try {
    await checks.assertCaptureWithinDeadline();
    await rm(path);
    await writeFile(path, 'original-bytes', { mode: 0o400 });
    await expect(checks.assertCaptureWithinDeadline()).rejects.toThrow();
    await expect(checks.assertInputs()).rejects.toThrow();
  } finally {
    original.close();
    await rm(root, { recursive: true });
  }
});

test('input checks require a complete original budget and executable callbacks before use', () => {
  const good = {
    verifyStore: async () => {},
    monitors: () => [],
    budget: { start: 1000, deadline: 7201000 },
    clock: () => 1000,
  };
  for (const change of [
    { budget: { start: 1000, deadline: 7201001 } },
    { clock: undefined },
    { monitors: undefined },
  ]) {
    expect(() => createInstalledCaptureInputChecks({ ...good, ...change } as typeof good)).toThrow();
  }
});

test('compiled input checks capture immutable guards and budget rather than later caller substitutions', async () => {
  let identities = 0,
    digests = 0;
  const original = {
    verifyStore: async () => {},
    monitors: () => [
      {
        assertOriginal: async () => {
          digests++;
        },
        assertOriginalIdentity: async () => {
          identities++;
        },
      },
    ],
    budget: { start: 1000, deadline: 7201000 },
    clock: () => 1000,
  };
  const checks = createInstalledCaptureInputChecks(original);
  original.budget.deadline = 1000;
  original.clock = () => 7201000;
  original.monitors = () => {
    throw new Error('replacement monitor getter');
  };
  original.verifyStore = async () => {
    throw new Error('replacement store guard');
  };
  await checks.assertCaptureWithinDeadline();
  await checks.assertInputs();
  expect(identities).toBe(1);
  expect(digests).toBe(1);
  expect(Object.isFrozen(checks)).toBe(true);
});
