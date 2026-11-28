import { expect, mock, test } from 'bun:test';
import { createIsolatedFixtureClock } from '../isolated-fixture-clock';

const { linuxMonotonicMs: realClock } = await import('../../src/linux-clock');
const clock = createIsolatedFixtureClock(realClock);
mock.module('../../src/linux-clock', () => ({ linuxMonotonicMs: clock.read }));
const inventories = await import('../../src/installed-initial-inventory');
const path = new URL(
  '../test/fixtures/original-apply-inventory.fixture.ts',
  import.meta.resolve('../../src/installed-initial-inventory'),
).href;
const { withApplyInventory } = await import(path);

test('apply-bound initial absence remains immutable after its pre-submit freshness window', async () => {
  await withApplyInventory(async ({ packet }: { packet: unknown }) => {
    const first = await inventories.readOriginalApplyGcpInventory(packet);
    const later = await clock.withOffset(300001, () => inventories.readOriginalApplyGcpInventory(packet));
    expect(later.startedMonotonicMs).toBe(first.startedMonotonicMs);
    expect(later.boundMonotonicMs).toBe(first.boundMonotonicMs);
    expect(later.resources).toHaveLength(21);
    expect(later.executionAuthorized).toBe(false);
  });
}, 60000);

test('a failed original operation lifetime cannot be revived by clock restoration', async () => {
  await withApplyInventory(async ({ packet }: { packet: unknown }) => {
    await clock.withOffset(7200001, () =>
      expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('budget'),
    );
    await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
  });
}, 60000);

test('only the original final callback exposes the baseline during its separate final reserve', async () => {
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
      await clock.withOffset(300001, () =>
        expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow(),
      );
      await expect(inventories.readOriginalApplyGcpInventory(packet, final)).rejects.toThrow('retired');
    },
  );
}, 60000);
