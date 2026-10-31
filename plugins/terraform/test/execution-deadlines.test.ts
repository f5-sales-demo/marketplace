import { expect, test } from 'bun:test';
import { executionDeadlines, requireDeadline } from '../src/execution-deadlines';

test('apply retains two hours, startup fifteen seconds and a separate final capture window', () => {
  expect(executionDeadlines('apply', 100)).toEqual({
    schemaVersion: 1,
    command: 'apply',
    started: 100,
    startup: 15100,
    operation: 7200100,
    finalCapture: 7500100,
  });
  expect(executionDeadlines('plan', 100).operation).toBe(60100);
  expect(executionDeadlines('validate', 100).operation).toBe(60100);
});

test('completion and failure reserve final capture without resetting the operation clock', () => {
  const deadlines = executionDeadlines('apply', 0);
  requireDeadline(deadlines, 'operation', 61000);
  requireDeadline(deadlines, 'operation', 7199999);
  expect(() => requireDeadline(deadlines, 'operation', 7200000)).toThrow('exhausted');
  requireDeadline(deadlines, 'finalCapture', 7499999);
  expect(() => requireDeadline(deadlines, 'finalCapture', 7500000)).toThrow('exhausted');
  expect(deadlines.operation).toBe(7200000);
  expect(Object.isFrozen(deadlines)).toBe(true);
});

test('invalid commands, clocks, tampered budgets and unknown phases refuse', () => {
  for (const command of ['', 'destroy', 'apply\n', 'shell']) expect(() => executionDeadlines(command, 0)).toThrow();
  for (const clock of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    expect(() => executionDeadlines('apply', clock)).toThrow();
  const deadlines = executionDeadlines('plan', 100);
  for (const now of [99, NaN, Infinity]) expect(() => requireDeadline(deadlines, 'startup', now)).toThrow();
  for (const changed of [
    { ...deadlines, schemaVersion: 2 },
    { ...deadlines, operation: 7200100 },
    { ...deadlines, finalCapture: deadlines.finalCapture + 1 },
    { ...deadlines, startup: deadlines.startup + 1 },
    { ...deadlines, unexpected: true },
  ])
    expect(() => requireDeadline(changed as typeof deadlines, 'operation', 100)).toThrow();
  expect(() => requireDeadline(deadlines, 'unknown' as 'operation', 100)).toThrow();
});
