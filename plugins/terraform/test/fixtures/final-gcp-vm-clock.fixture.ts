import { expect, mock, test } from 'bun:test';

const { linuxMonotonicMs: originalClock } = await import('../../src/linux-clock');
let offset = 0;
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => originalClock() + offset }));
const evidence = await import('../../src/gcp-vm-evidence');
const inventories = await import('../../src/installed-initial-inventory');
const { inspectFinalReaderReserve } = await import('../../src/reader-final-reserve');
const path = new URL('../test/fixtures/early-gcp-vm.fixture.ts', import.meta.resolve('../../src/gcp-vm-evidence'));
const { withEarlyVmFixture } = await import(path.href);
type Input = import('./early-gcp-vm.fixture').EarlyVmFixtureInput;

test('original VM and serial capture hand off under the original final reserve after operation expiry', async () => {
  let original: unknown, initial: Awaited<ReturnType<typeof inventories.readOriginalApplyGcpInventory>> | undefined;
  await withEarlyVmFixture(
    async (input: Input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      initial = await inventories.readOriginalApplyGcpInventory(input.baseline);
      offset = input.callback.original.budget.deadline - originalClock() + 1;
    },
    async (input: Input) => {
      if (!initial || !input.callback.reserve) throw new Error('Original initial and final sources required');
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, input);
      const view = await evidence.readOriginalFinalGcpVmEvidence(packet);
      const timing = inspectFinalReaderReserve(input.callback.reserve);
      expect(view.finalStartedMs).toBe(timing.finalStartedMs);
      expect(view.finalDeadlineMs).toBe(timing.finalDeadlineMs);
      expect(view.instanceId).toBe(input.identity.targetId as string);
      expect(view.applyRpcQualified).toBe(false);
      const later = await inventories.readOriginalApplyGcpInventory(input.baseline, input.callback);
      expect(later.cloud.map((row) => row.evidence.startedAt)).toEqual(
        initial.cloud.map((row) => row.evidence.startedAt),
      );
      expect((await evidence.collectOriginalFinalGcpSerialEvidence(packet, '0')).instanceId).toBe(view.instanceId);
      await expect(evidence.readOriginalEarlyGcpVmEvidence(original)).rejects.toThrow('retired');
    },
    'deadline',
  );
}, 60000);

test('final VM handoff expiry cannot be undone by restoring the test clock', async () => {
  offset = 0;
  let original: unknown;
  await withEarlyVmFixture(
    async (input: Input) => {
      original = await evidence.collectOriginalEarlyGcpVmEvidence(input);
      offset = input.callback.original.budget.deadline - originalClock() + 1;
    },
    async (input: Input) => {
      const packet = await evidence.handoffOriginalEarlyGcpVmEvidence(original, input);
      const prior = offset;
      offset += 300001;
      await expect(evidence.readOriginalFinalGcpVmEvidence(packet)).rejects.toThrow();
      offset = prior;
      await expect(evidence.readOriginalFinalGcpVmEvidence(packet)).rejects.toThrow('retired');
    },
    'deadline',
  );
}, 60000);
