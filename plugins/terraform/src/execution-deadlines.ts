/** Immutable budgets for admitted execution; transport and credentials require their own qualification. */
export interface ExecutionDeadlines {
  readonly schemaVersion: 1;
  readonly command: string;
  readonly started: number;
  readonly startup: number;
  readonly operation: number;
  readonly finalCapture: number;
}
type Phase = 'startup' | 'operation' | 'finalCapture';
const commands = new Set(['version', 'init', 'validate', 'plan', 'show', 'output', 'state', 'apply']);
const finalCaptureMs = 300_000;

export function executionDeadlines(command: string, started: number): ExecutionDeadlines {
  if (
    !commands.has(command) ||
    !Number.isFinite(started) ||
    started < 0 ||
    started > Number.MAX_SAFE_INTEGER - 7_500_000
  )
    throw new Error('Reviewed command and finite original monotonic start required');
  const operation = started + (command === 'apply' ? 7_200_000 : 60_000);
  return Object.freeze({
    schemaVersion: 1,
    command,
    started,
    startup: started + 15_000,
    operation,
    finalCapture: operation + finalCaptureMs,
  });
}

/** The final window is reserved at admission; action completion never extends any deadline. */
export function requireDeadline(deadlines: ExecutionDeadlines, phase: Phase, now: number): number {
  if (!deadlines || !['startup', 'operation', 'finalCapture'].includes(phase))
    throw new Error('Reviewed execution deadline phase required');
  const expected = executionDeadlines(deadlines.command, deadlines.started);
  if (
    Object.keys(deadlines).sort().join(',') !== Object.keys(expected).sort().join(',') ||
    (Object.keys(expected) as Array<keyof ExecutionDeadlines>).some((key) => deadlines[key] !== expected[key]) ||
    !Number.isFinite(now) ||
    now < deadlines.started
  )
    throw new Error('Original execution deadline binding or monotonic clock changed');
  const remaining = deadlines[phase] - now;
  if (remaining <= 0) throw new Error('Original execution deadline exhausted');
  return remaining;
}
