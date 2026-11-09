import { linuxMonotonicMs } from './linux-clock';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

export interface FinalReaderReserveAdmission {
  readonly identity: ExecutionCaptureAdmission['identity'];
  readonly originalStartMs: number;
  readonly originalDeadlineMs: number;
  readonly finalStartedMs: number;
  readonly finalDeadlineMs: number;
  assertOriginal(): Promise<void>;
}
export interface FinalReaderReserveSnapshot {
  readonly schemaVersion: 1;
  readonly kind: 'original-final-reader-reserve';
  readonly identity: ExecutionCaptureAdmission['identity'];
  readonly originalStartMs: number;
  readonly originalDeadlineMs: number;
  readonly finalStartedMs: number;
  readonly finalDeadlineMs: number;
}
export type FinalReaderReserve = Readonly<FinalReaderReserveSnapshot>;
const admissions = new WeakMap<
  FinalReaderReserve,
  { snapshot: FinalReaderReserveSnapshot; assertOriginal(): Promise<void> }
>();
const windowKeys = ['originalStartMs', 'originalDeadlineMs', 'finalStartedMs', 'finalDeadlineMs'] as const;
const originalWindows = new Map<string, Pick<FinalReaderReserveSnapshot, (typeof windowKeys)[number]>>();
function withinWindow(snapshot: FinalReaderReserveSnapshot) {
  const current = linuxMonotonicMs();
  if (current < snapshot.finalStartedMs || current >= snapshot.finalDeadlineMs)
    throw new Error('Original final reader reserve is exhausted or has not started');
}
/** Compiled capture admission only. Tool receipts and cloned objects cannot issue this authority. */
export function admitFinalReaderReserve(input: FinalReaderReserveAdmission): FinalReaderReserve {
  if (
    !input ||
    typeof input.assertOriginal !== 'function' ||
    !input.identity ||
    !Number.isSafeInteger(input.identity.pid) ||
    input.identity.pid <= 0 ||
    input.identity.group !== input.identity.pid ||
    typeof input.identity.start !== 'string' ||
    !/^[0-9]+$/.test(input.identity.start) ||
    typeof input.identity.boot !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.identity.boot) ||
    ![input.originalStartMs, input.originalDeadlineMs, input.finalStartedMs, input.finalDeadlineMs].every(
      Number.isSafeInteger,
    ) ||
    input.originalStartMs < 0 ||
    input.originalDeadlineMs - input.originalStartMs !== 7_200_000 ||
    input.finalStartedMs < input.originalStartMs ||
    input.finalDeadlineMs - input.finalStartedMs !== 300_000
  )
    throw new Error('Trusted original fixed operation and final reader budgets required');
  const snapshot = Object.freeze({
    schemaVersion: 1 as const,
    kind: 'original-final-reader-reserve' as const,
    identity: Object.freeze({ ...input.identity }),
    originalStartMs: input.originalStartMs,
    originalDeadlineMs: input.originalDeadlineMs,
    finalStartedMs: input.finalStartedMs,
    finalDeadlineMs: input.finalDeadlineMs,
  });
  withinWindow(snapshot);
  const key = `${snapshot.identity.boot}:${snapshot.identity.pid}:${snapshot.identity.start}`;
  const original = originalWindows.get(key);
  if (original && windowKeys.some((field) => original[field] !== snapshot[field]))
    throw new Error('Original final reader window cannot be renewed');
  if (!original)
    originalWindows.set(
      key,
      Object.freeze({
        originalStartMs: snapshot.originalStartMs,
        originalDeadlineMs: snapshot.originalDeadlineMs,
        finalStartedMs: snapshot.finalStartedMs,
        finalDeadlineMs: snapshot.finalDeadlineMs,
      }),
    );
  admissions.set(snapshot, { snapshot, assertOriginal: input.assertOriginal });
  return snapshot;
}
export function inspectFinalReaderReserve(reserve: FinalReaderReserve): FinalReaderReserveSnapshot {
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  return admission.snapshot;
}
export async function assertFinalReaderReserve(reserve: FinalReaderReserve): Promise<void> {
  const snapshot = inspectFinalReaderReserve(reserve);
  withinWindow(snapshot);
  const admission = admissions.get(reserve);
  if (!admission) throw new Error('An admitted original final reader reserve is required');
  await admission.assertOriginal();
  withinWindow(snapshot);
}
