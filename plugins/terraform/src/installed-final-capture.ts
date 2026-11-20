import { isAbsolute, join, resolve } from 'node:path';
import { freezeAdmittedCaptureInputs } from './installed-capture-context';
import type { OriginalInputBinding } from './original-input-monitor';
import { admitFinalReaderReserve, type FinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission, FinalExecutionCapture } from './signal-free-executor';

type Identity = ExecutionCaptureAdmission['identity'];
export interface InstalledCaptureInvocation {
  readonly identity: Identity;
  readonly budget?: Readonly<{ start: number; deadline: number }>;
  readonly groupDirectory: string;
  readonly groupInputs: Readonly<Record<string, OriginalInputBinding>>;
  readonly capture?: { finalCapture(capture: FinalExecutionCapture, reserve?: FinalReaderReserve): Promise<void> };
}
function key(identity: Identity) {
  if (
    !identity ||
    !Number.isSafeInteger(identity.pid) ||
    identity.pid <= 0 ||
    identity.group !== identity.pid ||
    !/^[0-9]+$/.test(identity.start) ||
    !/^[a-f0-9-]{36}$/.test(identity.boot)
  )
    throw new Error('Original installed capture execution identity required');
  return `${identity.boot}:${identity.pid}:${identity.start}`;
}

/** Admit each original invocation once; later executions cannot redirect its capture. */
export class InstalledCaptureInvocations {
  private readonly records = new Map<string, InstalledCaptureInvocation>();
  admit(input: InstalledCaptureInvocation) {
    const identityKey = key(input.identity);
    if (this.records.has(identityKey)) throw new Error('Original installed capture already admitted');
    if (
      input.budget &&
      (!Number.isSafeInteger(input.budget.start) ||
        input.budget.start < 0 ||
        !Number.isSafeInteger(input.budget.deadline) ||
        input.budget.deadline - input.budget.start !== 7_200_000)
    )
      throw new Error('Original installed capture operation budget required');
    if (!isAbsolute(input.groupDirectory) || resolve(input.groupDirectory) !== input.groupDirectory)
      throw new Error('Original installed capture directory required');
    const groupInputs = freezeAdmittedCaptureInputs(input.groupInputs);
    if (
      Object.keys(groupInputs).sort().join(',') !== 'claim,lifetime' ||
      groupInputs.claim.path !== join(input.groupDirectory, 'claim.json') ||
      groupInputs.lifetime.path !== join(input.groupDirectory, 'lifetime.json')
    )
      throw new Error('Original installed capture group inputs required');
    const record = Object.freeze({
      identity: Object.freeze({ ...input.identity }),
      ...(input.budget ? { budget: Object.freeze({ ...input.budget }) } : {}),
      groupDirectory: input.groupDirectory,
      groupInputs,
      capture: input.capture,
    });
    this.records.set(identityKey, record);
    return record;
  }
  find(finished: FinalExecutionCapture) {
    if (!finished.identity || finished.pid !== finished.identity.pid)
      throw new Error('Original final capture identity unavailable');
    const record = this.records.get(key(finished.identity));
    if (!record) throw new Error('Original final capture invocation unavailable');
    return record;
  }
}

export interface InstalledFinalCaptureHooks {
  persist(finished: FinalExecutionCapture): Promise<void>;
  verify(record: InstalledCaptureInvocation): Promise<void>;
  assertInputs(): Promise<void>;
}

/** Final capture always runs for the matching started invocation, including unresolved groups.
 * Persistence/metadata failures are retained and reported after capture and all final checks.
 * Independent executor-group closure remains a separate release/disposal gate.
 */
export async function finalizeInstalledCapture(
  invocations: InstalledCaptureInvocations,
  finished: FinalExecutionCapture,
  hooks: InstalledFinalCaptureHooks,
) {
  const failures: unknown[] = [];
  const attempt = async (operation: () => Promise<void>) => {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  };
  await attempt(() => hooks.persist(finished));
  let record: InstalledCaptureInvocation | undefined;
  try {
    record = invocations.find(finished);
  } catch (error) {
    failures.push(error);
  }
  if (record) {
    const original = record;
    await attempt(() => hooks.verify(original));
    const capture = original.capture;
    if (capture) {
      let reserve: FinalReaderReserve | undefined;
      if (original.budget)
        await attempt(async () => {
          if (finished.originalDeadlineMs !== original.budget?.deadline)
            throw new Error('Original final capture operation budget changed');
          const verify = hooks.verify,
            assertInputs = hooks.assertInputs;
          reserve = admitFinalReaderReserve({
            identity: original.identity,
            originalStartMs: original.budget.start,
            originalDeadlineMs: original.budget.deadline,
            finalStartedMs: finished.finalStartedMs,
            finalDeadlineMs: finished.finalDeadlineMs,
            assertOriginal: async () => {
              await verify(original);
              await assertInputs();
              await verify(original);
            },
          });
        });
      await attempt(() => capture.finalCapture(finished, reserve));
    }
  }
  await attempt(hooks.assertInputs);
  if (record) {
    const original = record;
    await attempt(() => hooks.verify(original));
  }
  if (failures.length) throw new AggregateError(failures, 'Original installed final capture is incomplete');
}
