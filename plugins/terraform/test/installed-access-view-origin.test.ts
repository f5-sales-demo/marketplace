/** Source views are opaque capabilities; consistency packets cannot mint them. */
import { expect, test } from 'bun:test';
import { readOriginalInstalledGcpCeAccess } from '../src/installed-ce-access';
import { readOriginalInstalledGcpObserverAccess } from '../src/installed-observer-access';

test('caller-created access views cannot provide original source or guest authority', async () => {
  for (const value of [
    null,
    {},
    { guestAcceptanceComplete: true, executionAuthorized: true },
    { callback: {}, vm: {}, key: {}, trust: {}, clients: {}, initialized: true },
  ]) {
    await expect(readOriginalInstalledGcpCeAccess(value, {} as never)).rejects.toThrow('Original');
    await expect(readOriginalInstalledGcpObserverAccess(value, {} as never)).rejects.toThrow('Original');
  }
});
