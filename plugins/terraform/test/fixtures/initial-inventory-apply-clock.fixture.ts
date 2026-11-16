import { expect, mock, test } from 'bun:test';

const { linuxMonotonicMs: realClock } = await import('../../src/linux-clock');
let advance = 0;
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: () => realClock() + advance }));
const inventories = await import('../../src/installed-initial-inventory');
const path = new URL(
  '../test/fixtures/original-apply-inventory.fixture.ts',
  import.meta.resolve('../../src/installed-initial-inventory'),
).href;
const { withApplyInventory } = await import(path);

test('apply-bound initial absence remains immutable after its pre-submit freshness window', async () => {
  advance = 0;
  await withApplyInventory(async ({ packet }: { packet: unknown }) => {
    const first = await inventories.readOriginalApplyGcpInventory(packet);
    advance = 300001;
    const later = await inventories.readOriginalApplyGcpInventory(packet);
    expect(later.startedMonotonicMs).toBe(first.startedMonotonicMs);
    expect(later.boundMonotonicMs).toBe(first.boundMonotonicMs);
    expect(later.resources).toHaveLength(21);
    expect(later.executionAuthorized).toBe(false);
  });
  advance = 0;
}, 60000);

test('a failed original operation lifetime cannot be revived by clock restoration', async () => {
  advance = 0;
  await withApplyInventory(async ({ packet }: { packet: unknown }) => {
    advance = 7200001;
    await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('budget');
    advance = 0;
    await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
  });
}, 60000);

test('only the original final callback exposes the baseline during its separate final reserve', async () => {
  advance = 0;
  await withApplyInventory(
    async () => {},
    true,
    async ({
      packet,
      final,
    }: {
      packet: unknown;
      final: import('../../src/installed-apply-controller').OriginalApplyCallbackContext;
    }) => {
      const retained = await inventories.readOriginalApplyGcpInventory(packet, final);
      expect(retained.resources).toHaveLength(21);
      expect(retained.executionAuthorized).toBe(false);
      await expect(inventories.readOriginalApplyGcpInventory({ ...(packet as object) }, final)).rejects.toThrow(
        'Original',
      );
      advance = 300001;
      try {
        await expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow();
      } finally {
        advance = 0;
      }
      await expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow('retired');
    },
  );
}, 60000);
