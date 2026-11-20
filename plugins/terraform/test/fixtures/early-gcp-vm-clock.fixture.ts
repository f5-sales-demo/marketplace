import { expect, mock, test } from 'bun:test';

const { linuxMonotonicMs: realClock } = await import('../../src/linux-clock');
const realNow = Date.now.bind(Date);
let advance = 0;
Date.now = () => realNow() + advance;
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => realClock() + advance }));
const evidence = await import('../../src/gcp-vm-evidence');
const inventories = await import('../../src/installed-initial-inventory');
const path = new URL('../test/fixtures/early-gcp-vm.fixture.ts', import.meta.resolve('../../src/gcp-vm-evidence')).href;
const { withEarlyVmFixture } = await import(path);
type Input = import('./early-gcp-vm.fixture').EarlyVmFixtureInput;

test('sealed initial absence remains original after five minutes while new VM observations stay fresh', async () => {
  advance = 0;
  await withEarlyVmFixture(async (input: Input) => {
    const initial = await inventories.readOriginalApplyGcpInventory(input.baseline);
    const times = initial.cloud.map((row) => [row.evidence.startedAt, row.evidence.finishedAt]);
    advance = 300001;
    try {
      const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      if (!packet) throw new Error('Original VM fixture required');
      expect((await evidence.readOriginalEarlyGcpVmEvidence(packet)).instanceId).toBe(
        input.identity.targetId as string,
      );
      const later = await inventories.readOriginalApplyGcpInventory(input.baseline);
      expect(later.startedMonotonicMs).toBe(initial.startedMonotonicMs);
      expect(later.boundMonotonicMs).toBe(initial.boundMonotonicMs);
      expect(later.cloud.map((row) => [row.evidence.startedAt, row.evidence.finishedAt])).toEqual(times);
    } finally {
      advance = 0;
    }
  });
}, 60000);

test('stale current operation or VM observations permanently retire their packet', async () => {
  advance = 0;
  await withEarlyVmFixture(async (input: Input) => {
    const packet = await evidence.collectOriginalEarlyGcpVmEvidence(input);
    if (!packet) throw new Error('Original VM fixture required');
    advance = 300001;
    try {
      await expect(evidence.readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('Fresh');
    } finally {
      advance = 0;
    }
    await expect(evidence.readOriginalEarlyGcpVmEvidence(packet)).rejects.toThrow('retired');
  });
}, 60000);
