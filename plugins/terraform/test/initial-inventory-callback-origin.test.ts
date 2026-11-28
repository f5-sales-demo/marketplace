import { expect, test } from 'bun:test';
import * as inventories from '../src/installed-initial-inventory';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

test('apply-bound baseline proves the exact original callback before independent VM reads', async () => {
  expect(typeof inventories.assertOriginalApplyGcpInventoryCallback).toBe('function');
  await withApplyInventory(
    async ({ packet, before }) => {
      await inventories.assertOriginalApplyGcpInventoryCallback(packet, before);
      await expect(inventories.assertOriginalApplyGcpInventoryCallback({ ...packet }, before)).rejects.toThrow(
        'Original',
      );
      await expect(inventories.assertOriginalApplyGcpInventoryCallback(packet, { ...before })).rejects.toThrow(
        'Original',
      );
      await inventories.assertOriginalApplyGcpInventoryCallback(packet, before);
    },
    true,
    async ({ packet, final }) => {
      await inventories.assertOriginalApplyGcpInventoryCallback(packet, final);
    },
  );
}, 60000);

test('a separate actual apply with identical plan bytes cannot borrow the baseline', async () => {
  expect(typeof inventories.assertOriginalApplyGcpInventoryCallback).toBe('function');
  await withApplyInventory(async ({ packet, before }) => {
    await withApplyInventory(async ({ packet: other, before: otherBefore }) => {
      expect((await inventories.readOriginalApplyGcpInventory(packet)).planSha256).toBe(
        (await inventories.readOriginalApplyGcpInventory(other)).planSha256,
      );
      await expect(inventories.assertOriginalApplyGcpInventoryCallback(packet, otherBefore)).rejects.toThrow('differs');
      await inventories.assertOriginalApplyGcpInventoryCallback(packet, before);
    });
  });
}, 60000);

test('expired before baseline preserves exact original final access without reopening before work', async () => {
  let ended: import('../src/installed-apply-controller').OriginalApplyCallbackContext | undefined;
  await withApplyInventory(
    async ({ before }) => {
      ended = before;
    },
    true,
    async ({ packet, final }) => {
      if (!ended) throw new Error('Original before callback required');
      await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
      await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
      await expect(inventories.assertOriginalApplyGcpInventoryCallback(packet, ended)).rejects.toThrow('retired');
      const retained = await inventories.readOriginalApplyGcpInventory(packet, final);
      expect(retained.resources).toHaveLength(21);
      expect(retained.cloud).toHaveLength(17);
      expect(retained.executor).toEqual(final.execution.identity);
      expect(retained.executionAuthorized).toBe(false);
      expect(retained.creationOwnershipQualified).toBe(false);
      await inventories.assertOriginalApplyGcpInventoryCallback(packet, final);
      await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
    },
  );
}, 60000);

test('expired before baseline cannot hide changed absence evidence from the original final callback', async () => {
  const { readFile, rename, writeFile } = await import('node:fs/promises');
  let path: string | undefined;
  await withApplyInventory(
    async ({ packet }) => {
      path = (await inventories.readOriginalApplyGcpInventory(packet)).cloud[0].evidence.path;
    },
    true,
    async ({ packet, final }) => {
      if (!path) throw new Error('Original absence path required');
      await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
      const originalFinal = await inventories.readOriginalApplyGcpInventory(packet, final);
      expect(originalFinal.cloud[0].evidence.path).toBe(path);
      expect(originalFinal.executionAuthorized).toBe(false);
      const bytes = await readFile(path);
      const replacement = `${path}.replacement`;
      await writeFile(replacement, 'changed original baseline after before expiry', { flag: 'wx', mode: 0o400 });
      await rename(replacement, path);
      await expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow();
      await writeFile(replacement, bytes, { flag: 'wx', mode: 0o400 });
      await rename(replacement, path);
      await expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow('retired');
      await expect(inventories.assertOriginalApplyGcpInventoryCallback(packet, final)).rejects.toThrow('retired');
    },
  );
}, 60000);
