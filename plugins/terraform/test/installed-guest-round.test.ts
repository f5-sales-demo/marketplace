import { expect, test } from 'bun:test';
import { collectInstalledOriginalGuestRound } from '../src/installed-guest-worker';

test('unissued worker packets cannot start installed collection or supply an identity', async () => {
  let invoked = false;
  for (const value of [
    null,
    {},
    {
      root: '/private/fixture',
      command() {
        invoked = true;
      },
      evidence() {
        invoked = true;
        return { identity: { pid: 123 }, guestAcceptanceComplete: true };
      },
    },
  ]) {
    await expect(collectInstalledOriginalGuestRound(value)).rejects.toThrow(/Original/);
  }
  expect(invoked).toBe(false);
});
