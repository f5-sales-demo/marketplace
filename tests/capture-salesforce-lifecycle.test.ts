import { expect, test } from 'bun:test';
import { createCaptureExecution, viewport } from '../scripts/salesforce-capture-controls';

test('viewport clamps offsets and preserves the final page without losing lines', () => {
  const lines = Array.from({ length: 17 }, (_, i) => `line ${i}`);
  expect(viewport(lines, 8, 999)).toEqual({ offset: 13, rows: lines.slice(13), totalLines: 17 });
  expect(viewport(lines, 8, -1).offset).toBe(0);
});

test('teardown aborts owned execution, rejects late updates and stops animation once', async () => {
  for (const reason of ['cancel', 'context-replacement', 'shutdown'] as const) {
    let stops = 0;
    const updates: unknown[] = [];
    const component = { stopAnimation: () => stops++, updateResult: (value: unknown) => updates.push(value) };
    const run = createCaptureExecution(component);
    run.update({ partial: true });
    run.retire(reason);
    run.retire(reason);
    run.update({ late: true });
    expect(run.signal.aborted).toBe(true);
    expect(stops).toBe(1);
    expect(updates).toEqual([{ partial: true }]);
    expect(run.lateUpdates).toBe(1);
  }
});

test('completed executions reject late callbacks without affecting a replacement', () => {
  const updates: unknown[] = [];
  let stops = 0;
  const component = { stopAnimation: () => stops++, updateResult: (value: unknown) => updates.push(value) };
  const completed = createCaptureExecution(component);
  completed.complete();
  completed.complete();
  const replacement = createCaptureExecution(component);
  completed.update({ old: true });
  replacement.update({ current: true });
  expect(completed.signal.aborted).toBe(false);
  expect(completed.lateUpdates).toBe(1);
  expect(stops).toBe(1);
  expect(updates).toEqual([{ current: true }]);
});
