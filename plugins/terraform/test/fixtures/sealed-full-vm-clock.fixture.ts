import { expect, mock, test } from 'bun:test';

const { linuxMonotonicMs: realClock } = await import('../../src/linux-clock');
const realNow = Date.now.bind(Date);
let advance = 0;
Date.now = () => realNow() + advance;
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => realClock() + advance }));
const { joinOriginalGcpVmEvidence } = await import('../../src/gcp-vm-evidence');
const root = new URL('../test/fixtures/', import.meta.resolve('../../src/gcp-vm-evidence'));
const { withEarlyVmFixture } = await import(new URL('early-gcp-vm.fixture.ts', root).href);
const { fullVmFixture } = await import(new URL('sealed-full-vm.fixture.ts', root).href);

test('full VM joins old sealed absence to fresh current observations without rebasing timestamps', async () => {
  await withEarlyVmFixture(async (input: import('./early-gcp-vm.fixture').EarlyVmFixtureInput) => {
    advance = 300001;
    try {
      const original = await fullVmFixture(input);
      const joined = await joinOriginalGcpVmEvidence(original);
      expect(joined.instanceId).toBe(input.identity.targetId as string);
      expect(Date.now() - joined.absenceFinishedAt).toBeGreaterThan(300000);
      advance += 300001;
      await expect(joinOriginalGcpVmEvidence(original)).rejects.toThrow('Fresh');
    } finally {
      advance = 0;
    }
  });
}, 60000);
