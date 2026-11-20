/** Cooperative synthetic apply lifetime follows its original controller budget. */
import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { assertOriginalApplyLifetime } from '../src/installed-apply-controller';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';

test('a delayed original callback cannot lose its owning apply to an unrelated fixture timer', async () => {
  await withApplyInventory(async ({ before }) => {
    const originalDeadline = before.original.budget.deadline;
    await Bun.sleep(31000);
    await assertOriginalApplyLifetime(before);
    const stat = await readFile(`/proc/${before.execution.identity.pid}/stat`, 'utf8');
    const fields = stat
      .slice(stat.lastIndexOf(') ') + 2)
      .trim()
      .split(/\s+/);
    expect(['R', 'S', 'D', 'I']).toContain(fields[0]);
    expect(fields[19]).toBe(before.execution.identity.start);
    expect(before.original.budget.deadline).toBe(originalDeadline);
  });
}, 60000);
