import { describe, expect, test } from 'bun:test';
import {
  parseRetiredTasks,
  parseTasks,
  reconcileTasks,
  renderRetiredTasks,
  renderTasks,
  seedTasks,
  validateTasks,
} from '../scripts/presentation-tracker.mjs';

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

test('retired rows preserve history with a reason, removal SHA and delivery link', () => {
  const previous = seedTasks(inventory, links);
  previous[4].receipt = 'private:historic';
  const expected = seedTasks([{ ...inventory[0], surfaces: [] }], links);
  const retirement = {
    reason: 'Removed private progress lifecycle registration',
    removalSha: 'b'.repeat(40),
    delivery: links.example,
  };
  const retired = [];
  const current = reconcileTasks(expected, previous, {
    retirements: Object.fromEntries(
      previous.filter((t) => t.id.startsWith('example.tool.')).map((t) => [t.id, retirement]),
    ),
    retired,
  });
  expect(current.map((t) => t.id)).toEqual(expected.map((t) => t.id));
  expect(retired).toHaveLength(8);
  expect(retired[0].receipt).toBe('private:historic');
  expect(retired[0].reason).toBe(retirement.reason);
  expect(validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, retired)).toEqual([]);
  expect(validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, [...retired, retired[0]]).join()).toContain(
    'duplicate',
  );
  expect(
    validateTasks(current, [{ ...inventory[0], surfaces: [] }], links, [{ ...retired[0], reason: '' }]).join(),
  ).toContain('reason');
  expect(() =>
    reconcileTasks(expected, previous, { retirements: { [previous[4].id]: retirement }, retired: [] }),
  ).toThrow('retire');
});

test('retired appendix roundtrips all historical cells and stays out of active tasks', () => {
  const prior = seedTasks(inventory, links)[4];
  const retired = [
    {
      ...prior,
      evidence: 'literal a | b\nfalse=false',
      receipt: 'private:old',
      reason: 'Removed lifecycle',
      removalSha: 'c'.repeat(40),
      removalDelivery: links.example,
    },
  ];
  const text = renderTasks([seedTasks(inventory, links)[0]]) + renderRetiredTasks(retired);
  expect(parseTasks(text)).toHaveLength(1);
  expect(parseRetiredTasks(text)).toEqual(retired);
});
