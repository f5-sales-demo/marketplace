import { describe, expect, test } from 'bun:test';
import { parseTasks, reconcileTasks, renderTasks, seedTasks, validateTasks } from '../scripts/presentation-tracker.mjs';

const inventory = [
  {
    name: 'example',
    version: '1.0.0',
    fingerprint: 'abc',
    surfaces: [
      {
        id: 'example.tool.outside_src',
        scope: 'registered tool outside_src (extensions/integration.ts)',
        fingerprint: 'abc',
      },
    ],
  },
];
const links = {
  shared: 'https://github.com/f5-sales-demo/marketplace/issues/1',
  example: 'https://github.com/f5-sales-demo/marketplace/issues/2',
};
describe('presentation tracker evidence and coverage gates', () => {
  test('every actual surface has eight gates and every plugin has seven delivery gates', () => {
    const tasks = seedTasks(inventory, links);
    expect(tasks).toHaveLength(19); // four shared, eight surface, seven delivery
    expect(validateTasks(tasks, inventory, links)).toEqual([]);
  });
  test('duplicate and omitted IDs cannot pass', () => {
    const tasks = seedTasks(inventory, links);
    expect(validateTasks([...tasks, tasks[0]], inventory, links).join()).toContain('duplicate');
    expect(validateTasks(tasks.slice(1), inventory, links).join()).toContain('missing');
  });
  test('VERIFIED requires a receipt and complete provenance; BLOCKED needs next action', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'VERIFIED';
    expect(validateTasks(tasks, inventory, links).join()).toContain('receipt');
    tasks[4].receipt = 'private:acceptance-001';
    expect(validateTasks(tasks, inventory, links).join()).toContain('provenance');
    tasks[4].evidence = `scenario=read-only; outcome=pass; source=${'a'.repeat(40)}; plugin=1.0.0; runtime=23.5.1; host=Mac`;
    expect(validateTasks(tasks, inventory, links)).toEqual([]);
    tasks[4].status = 'BLOCKED';
    expect(validateTasks(tasks, inventory, links).join()).toContain('next action');
  });
  test('N/A needs a reason and applies only to unexposed capability gates', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'NOT APPLICABLE';
    tasks[4].blocker = 'No service attached; next action: configure service';
    expect(validateTasks(tasks, inventory, links).join()).toContain('NOT APPLICABLE');
  });
  test('roundtrip and repeated regeneration preserve edited evidence and literal text', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].evidence = 'literal a | b\nzero=0 false=false';
    expect(parseTasks(renderTasks(tasks))).toEqual(tasks);
    expect(reconcileTasks(tasks, tasks)).toEqual(tasks);
  });
  test('source drift reopens acceptance while preserving prior receipts', () => {
    const tasks = seedTasks(inventory, links);
    tasks[4].status = 'VERIFIED';
    tasks[4].receipt = 'private:prior';
    const changed = seedTasks(
      [{ ...inventory[0], surfaces: [{ ...inventory[0].surfaces[0], fingerprint: 'changed' }] }],
      links,
    );
    const result = reconcileTasks(changed, tasks);
    expect(result[4].status).toBe('TODO');
    expect(result[4].receipt).toBe('private:prior');
    expect(result[4].blocker).toContain('invalidated');
  });
  test('removed surfaces require explicit retirement rather than discarding receipts', () => {
    expect(() => reconcileTasks([], seedTasks(inventory, links))).toThrow('retire');
  });
});
