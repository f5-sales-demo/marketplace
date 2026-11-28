/** Original final callback/reserve; no command, signal or cloud submission. */
import { expect, test } from 'bun:test';
import { signalFreeFinalGuestWorkerExecutor, signalFreeFinalReaderExecutor } from '../src/signal-free-executor';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';

test('final guest worker uses the real parent reserve and never enlarges isolated command limits', async () => {
  await withEarlyVmFixture(
    async () => {},
    async (input) => {
      const { callback } = input;
      const reserve = callback.reserve;
      if (!reserve) throw new Error('Original final reserve required');
      const python = callback.original.inputs.python;
      const policy = {
        python,
        executable: python,
        originalStartMs: callback.original.budget.start,
        originalDeadlineMs: callback.original.budget.deadline,
        timeoutMs: 300000,
        assertOriginal: callback.original.assertInputs,
        finalCapture: async () => {},
      };
      expect(typeof signalFreeFinalGuestWorkerExecutor(policy, reserve)).toBe('function');
      expect(() => signalFreeFinalReaderExecutor(policy, reserve)).toThrow('sixty-second');
      expect(() => signalFreeFinalGuestWorkerExecutor({ ...policy, timeoutMs: 300001 }, reserve)).toThrow();
      expect(() =>
        signalFreeFinalGuestWorkerExecutor({ ...policy, originalDeadlineMs: policy.originalDeadlineMs + 1 }, reserve),
      ).toThrow();
      expect(() => signalFreeFinalGuestWorkerExecutor(policy, { ...reserve })).toThrow();
    },
  );
}, 60000);
