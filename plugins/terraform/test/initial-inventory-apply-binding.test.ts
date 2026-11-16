import { expect, test } from 'bun:test';
import { readFile, rename, writeFile } from 'node:fs/promises';
import * as inventories from '../src/installed-initial-inventory';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

test('fresh full initial inventory binds to the actual apply and exposes original per-resource absence', async () => {
  expect(typeof inventories.readOriginalApplyGcpInventory).toBe('function');
  await withApplyInventory(async ({ packet, before, stage, snapshot }) => {
    expect(await stage.bindForApply(snapshot, before)).toBe(packet);
    const view = await inventories.readOriginalApplyGcpInventory(packet);
    expect(view.resources).toHaveLength(21);
    expect(view.cloud).toHaveLength(17);
    expect(view.cloud.filter((row) => row.target.kind === 'instance')).toHaveLength(4);
    expect(view.executionAuthorized).toBe(false);
    expect(view.creationOwnershipQualified).toBe(false);
    for (const row of view.cloud) expect(JSON.parse(row.raw.toString()).error.code).toBe(404);
    await expect(inventories.readOriginalApplyGcpInventory({ ...packet })).rejects.toThrow('Original');
    await expect(stage.bindForApply(snapshot, { ...before })).rejects.toThrow('Original');
  });
}, 60000);

test('a changed baseline file cannot be restored into apply-bound original inventory', async () => {
  expect(typeof inventories.readOriginalApplyGcpInventory).toBe('function');
  await withApplyInventory(async ({ packet }) => {
    const view = await inventories.readOriginalApplyGcpInventory(packet);
    const row = view.cloud[0];
    const bytes = await readFile(row.evidence.path);
    const replacement = `${row.evidence.path}.replacement`;
    await writeFile(replacement, 'changed original baseline', { flag: 'wx', mode: 0o400 });
    await rename(replacement, row.evidence.path);
    await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow();
    await writeFile(replacement, bytes, { flag: 'wx', mode: 0o400 });
    await rename(replacement, row.evidence.path);
    await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
  }, false);
}, 60000);

import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('apply-bound baseline preserves freshness at submission and the original operation deadline', async () => {
  const result = await runIsolatedClockFixture('initial-inventory-apply-clock.fixture.ts');
  expect(result.exitCode).toBe(0);
}, 180000);

test('late receipt and Platform mutations remain rejected across asynchronous baseline reads', async () => {
  const result = await runIsolatedClockFixture('initial-inventory-late-mutation.fixture.ts');
  expect(result.exitCode).toBe(0);
}, 180000);
