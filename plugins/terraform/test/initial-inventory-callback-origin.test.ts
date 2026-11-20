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
