import { expect, mock, test } from 'bun:test';

const { linuxMonotonicMs: originalClock } = await import('../../src/linux-clock');
let offset = 0;
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => originalClock() + offset }));
const controller = await import('../../src/installed-apply-controller');
const { inspectFinalReaderReserve } = await import('../../src/reader-final-reserve');
const path = new URL(
  '../test/fixtures/apply-group-closure.fixture.ts',
  import.meta.resolve('../../src/installed-apply-controller'),
);
const { withGroupClosure } = await import(path.href);

test('an original completed stream cannot renew its final callback after reserve expiry', async () => {
  await expect(
    withGroupClosure(async (input: import('./apply-group-closure.fixture').GroupClosureFixtureInput) => {
      if (!input.final.reserve) throw new Error('Original final reserve required');
      const snapshot = inspectFinalReaderReserve(input.final.reserve);
      const originalDeadline = input.final.original.budget.deadline;
      expect(input.finished.originalGroupClosed).toBe(false);
      expect(input.completion.originalGroupClosed).toBe(true);
      offset = snapshot.finalDeadlineMs - originalClock() + 1;
      await expect(controller.acknowledgeOriginalApplyGroupClosure(input.final, input.completion)).rejects.toThrow();
      expect(input.final.original.budget.deadline).toBe(originalDeadline);
      expect(input.events.filter((row) => row.phase === 'group-closure-source')).toHaveLength(0);
    }),
  ).rejects.toThrow();
}, 60000);
