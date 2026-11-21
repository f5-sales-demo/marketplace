/** Plain consistency values cannot substitute for original factory views. */
import { expect, test } from 'bun:test';
import { openInstalledGcpGuestBinding } from '../src/installed-guest-binding';

test('guest binding refuses unissued CE/observer/source callback packets before worker startup', async () => {
  for (const ce of [null, {}, { guestAcceptanceComplete: true, executionAuthorized: true }]) {
    await expect(openInstalledGcpGuestBinding({ ce, observer: {}, callback: {} as never })).rejects.toThrow('Original');
  }
});
