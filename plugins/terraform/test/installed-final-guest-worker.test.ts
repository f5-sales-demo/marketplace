/** A final worker cannot start from serialized callback fields or a claimed reserve. */
import { expect, test } from 'bun:test';
import { openInstalledFinalGuestWorker } from '../src/installed-guest-worker';

test('final guest entry rejects unissued or before callback objects before source inputs/startup', async () => {
  for (const callback of [
    {},
    { phase: 'before' },
    { phase: 'after', reserve: { finalStartedMs: 1, finalDeadlineMs: 300001 } },
  ])
    await expect(openInstalledFinalGuestWorker({} as never, callback as never)).rejects.toThrow('Original');
});
