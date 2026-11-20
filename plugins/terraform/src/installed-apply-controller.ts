import { randomUUID } from 'node:crypto';
import type { InstalledCaptureContext } from './installed-capture-context';
import type { InstalledGcpCapture } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import {
  type OriginalOutputCompletion,
  readOriginalExecutionCompletion,
  readOriginalExecutionPrefix,
} from './original-output-stream';
import { assertFinalReaderReserve, type FinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

export interface OriginalApplyCallbackContext {
  readonly schemaVersion: 1;
  readonly kind: 'original-installed-apply-callback';
  readonly phase: 'before' | 'after';
  readonly nonce: string;
  readonly original: InstalledCaptureContext;
  readonly execution: ExecutionCaptureAdmission;
  readonly reserve?: FinalReaderReserve;
  assertOriginal(): Promise<void>;
}
const callbacks = new WeakMap<OriginalApplyCallbackContext, () => Promise<void>>();
const lifetimes = new WeakMap<OriginalApplyCallbackContext, () => Promise<void>>();
const groupClosures = new WeakMap<OriginalApplyCallbackContext, (completion: unknown) => Promise<void>>();
/** Consume the same original output issuer's independent group-closure proof.
 * This does not renew the final reserve or qualify an apply, guest or insertion. */
export async function acknowledgeOriginalApplyGroupClosure(callback: unknown, completion: unknown): Promise<void> {
  const acknowledge =
    callback && typeof callback === 'object' ? groupClosures.get(callback as OriginalApplyCallbackContext) : undefined;
  if (!acknowledge) throw new Error('Original final apply callback required for group closure');
  await acknowledge(completion);
}

/** Ongoing original operation verification; this never authorizes startup release or renews its budget. */
export async function assertOriginalApplyLifetime(value: OriginalApplyCallbackContext) {
  const verify = lifetimes.get(value);
  if (!verify) throw new Error('Original operation lifetime callback required');
  await verify();
}
export async function assertOriginalApplyCallback(value: OriginalApplyCallbackContext) {
  const verify = callbacks.get(value);
  if (!verify) throw new Error('Original apply callback context required');
  await verify();
}
interface ControllerHooks {
  /** Compiled server hooks only; never a tool argument. */
  clock?(): number;
  persist(event: Record<string, unknown>): Promise<void>;
}
const sameIdentity = (left: ExecutionCaptureAdmission['identity'], right: ExecutionCaptureAdmission['identity']) =>
  ['pid', 'group', 'start', 'boot'].every((key) => left[key as keyof typeof left] === right[key as keyof typeof right]);

/** Original-budget orchestration around an admitted worker. This does not qualify
 * a guest collector, provider insertion, expiry or execution authority. */
export function createInstalledApplyController(
  original: InstalledCaptureContext,
  worker: InstalledGcpCapture,
  hooks: ControllerHooks,
): InstalledGcpCapture {
  const now = hooks.clock ?? linuxMonotonicMs,
    persist = hooks.persist;
  const methods = {
    prepare: worker.prepare?.bind(worker),
    start: worker.start.bind(worker),
    assertOriginal: worker.assertOriginal.bind(worker),
    finalCapture: worker.finalCapture.bind(worker),
    close: worker.closeAfterExecutorExit.bind(worker),
  };
  const nonce = randomUUID();
  let sequence = 0,
    prepared = false,
    started: ExecutionCaptureAdmission | undefined,
    finalStarted = false,
    groupClosed = false,
    closed = false;
  let preparation: Promise<void> | undefined;
  const within = async () => {
    await original.assertInputs();
    if (now() < original.budget.start || now() >= original.budget.deadline)
      throw new Error('Original apply operation budget exhausted');
    await original.assertWithinDeadline();
  };
  const record = async (phase: string, extra: Record<string, unknown> = {}) =>
    persist({
      schemaVersion: 1,
      kind: 'original-installed-apply-controller-event',
      nonce,
      sequence: ++sequence,
      phase,
      observedMs: now(),
      owner: original.owner,
      authentication: original.authentication,
      budget: original.budget,
      executionIdentity: started?.identity,
      ...extra,
      executionQualified: false,
    });
  const refuse = async (phase: string, error: unknown): Promise<never> => {
    try {
      await record(phase, { errorType: error instanceof Error ? error.name : typeof error });
    } catch (retention) {
      throw new AggregateError([error, retention], 'Original apply failure and retention failed');
    }
    throw error;
  };
  const callback = (phase: 'before' | 'after', execution: ExecutionCaptureAdmission, reserve?: FinalReaderReserve) => {
    const verify = async () => {
      if (closed || !started || !sameIdentity(execution.identity, started.identity))
        throw new Error('Original apply callback identity or lifecycle changed');
      if (phase === 'before') {
        if (finalStarted) throw new Error('Original before callback retired');
        await within();
        if (now() >= execution.startupDeadlineMs) throw new Error('Original apply startup deadline elapsed');
      } else {
        if (!finalStarted || !reserve) throw new Error('Original final callback reserve required');
        await original.assertInputs();
        await assertFinalReaderReserve(reserve);
        await original.assertInputs();
      }
    };
    const value = {
      schemaVersion: 1 as const,
      kind: 'original-installed-apply-callback' as const,
      phase,
      nonce,
      execution,
      reserve,
      async assertOriginal(this: OriginalApplyCallbackContext) {
        await assertOriginalApplyCallback(this);
      },
    } as OriginalApplyCallbackContext;
    // Original credentials remain available to the trusted worker but never enter event summaries.
    Object.defineProperty(value, 'original', { value: original, enumerable: false });
    Object.freeze(value);
    callbacks.set(value, verify);
    if (phase === 'after') {
      let claimed: OriginalOutputCompletion | undefined;
      let acknowledgement: Promise<void> | undefined;
      const verifyClosure = async (candidate: unknown) => {
        await assertOriginalApplyCallback(value);
        const completion = candidate as OriginalOutputCompletion;
        const source = readOriginalExecutionCompletion(execution.output, completion);
        const prefix = await readOriginalExecutionPrefix(execution.output);
        if (
          source.directory !== original.executionDirectory ||
          prefix.directory !== original.executionDirectory ||
          !sameIdentity(source.identity, execution.identity) ||
          !sameIdentity(prefix.identity, execution.identity) ||
          source.completion.originalGroupClosed !== true ||
          prefix.stdout.bytes !== source.completion.stdout.bytes ||
          prefix.stdout.sha256 !== source.completion.stdout.sha256 ||
          prefix.stderr.bytes !== source.completion.stderr.bytes ||
          prefix.stderr.sha256 !== source.completion.stderr.sha256
        )
          throw new Error('Original final group closure source or complete prefix differs');
        await assertOriginalApplyCallback(value);
        readOriginalExecutionCompletion(execution.output, completion);
        return source;
      };
      let verificationQueue: Promise<void> = Promise.resolve();
      const acknowledge = async (candidate: unknown) => {
        await verifyClosure(candidate);
        if (acknowledgement) {
          if (claimed !== candidate) throw new Error('Original group closure already claimed by another completion');
          await acknowledgement;
          await verifyClosure(candidate);
          return;
        }
        claimed = candidate as OriginalOutputCompletion;
        acknowledgement = (async () => {
          try {
            const source = await verifyClosure(candidate);
            await record('group-closure-source', {
              originalGroupClosed: true,
              sourceStdoutBytes: source.completion.stdout.bytes,
              sourceStdoutSha256: source.completion.stdout.sha256,
              sourceStderrBytes: source.completion.stderr.bytes,
              sourceStderrSha256: source.completion.stderr.sha256,
            });
            await verifyClosure(candidate);
            groupClosed = true;
          } catch (error) {
            await refuse('group-closure-failed', error);
          }
        })();
        await acknowledgement;
      };
      groupClosures.set(value, (candidate) => {
        const pending = verificationQueue.then(() => acknowledge(candidate));
        // Preserve each caller's refusal while serializing subsequent original reads.
        verificationQueue = pending.then(
          () => undefined,
          () => undefined,
        );
        return pending;
      });
    }

    if (phase === 'before') {
      const identity = () => {
        if (closed || finalStarted || !started || !sameIdentity(execution.identity, started.identity))
          throw new Error('Original operation lifetime retired or identity changed');
      };
      lifetimes.set(value, async () => {
        identity();
        await within();
        identity();
      });
    }
    return value;
  };
  return {
    async prepare() {
      if (closed || started || finalStarted) throw new Error('Original apply preparation retired');
      preparation ??= (async () => {
        try {
          await within();
          await record('prepare-start');
          await methods.prepare?.(original);
          await within();
          await record('prepared');
          prepared = true;
        } catch (error) {
          await refuse('prepare-failed', error);
        }
      })();
      await preparation;
    },
    async start(admission) {
      if (!prepared) throw new Error('Original apply controller must be prepared before release');
      if (started || closed || finalStarted) throw new Error('Original apply execution already claimed');
      if (admission.directory !== original.executionDirectory) throw new Error('Original apply workspace differs');
      if (
        admission.args[0] !== 'apply' ||
        admission.originalStartMs !== original.budget.start ||
        admission.originalDeadlineMs !== original.budget.deadline
      )
        throw new Error('Original apply invocation or budget differs');
      if (
        !Number.isSafeInteger(admission.identity.pid) ||
        admission.identity.pid <= 0 ||
        admission.identity.group !== admission.identity.pid ||
        !/^[0-9]+$/.test(admission.identity.start) ||
        !/^[a-f0-9-]{36}$/.test(admission.identity.boot)
      )
        throw new Error('Original apply execution identity required');
      await within();
      if (now() >= admission.startupDeadlineMs) throw new Error('Original apply startup deadline elapsed');
      started = Object.freeze({
        ...admission,
        identity: Object.freeze({ ...admission.identity }),
        args: Object.freeze([...admission.args]),
      });
      await record('before-start');
      const bound = callback('before', started);
      await assertOriginalApplyCallback(bound);
      await methods.start(started, bound);
      await assertOriginalApplyCallback(bound);
      await record('before-complete');
    },
    async assertOriginal() {
      if (closed) throw new Error('Original apply controller closed');
      await within();
      if (prepared) await methods.assertOriginal();
    },
    async finalCapture(finished, reserve) {
      if (
        !started ||
        !finished.identity ||
        !sameIdentity(started.identity, finished.identity) ||
        finished.pid !== started.identity.pid
      )
        throw new Error('Original apply final identity differs');
      if (finalStarted) throw new Error('Original apply final capture already claimed');
      if (finished.originalDeadlineMs !== original.budget.deadline)
        throw new Error('Original apply final budget differs');
      if (!reserve) throw new Error('Original apply final reserve required');
      {
        const snapshot = inspectFinalReaderReserve(reserve);
        if (
          !sameIdentity(snapshot.identity, started.identity) ||
          snapshot.originalStartMs !== original.budget.start ||
          snapshot.originalDeadlineMs !== original.budget.deadline ||
          snapshot.finalStartedMs !== finished.finalStartedMs ||
          snapshot.finalDeadlineMs !== finished.finalDeadlineMs
        )
          throw new Error('Original apply final reserve differs');
      }
      finalStarted = true;
      groupClosed = finished.originalGroupClosed;
      const failures: unknown[] = [];
      const attempt = async (fn: () => Promise<void>) => {
        try {
          await fn();
          return true;
        } catch (error) {
          failures.push(error);
          return false;
        }
      };
      await attempt(() =>
        record('final-start', {
          finalStartedMs: finished.finalStartedMs,
          finalDeadlineMs: finished.finalDeadlineMs,
          originalGroupClosed: groupClosed,
        }),
      );
      const bound = callback('after', started, reserve);
      const authorized = await attempt(() => assertOriginalApplyCallback(bound));
      if (authorized) {
        await attempt(() => methods.finalCapture(finished, reserve, bound));
        await attempt(() => assertOriginalApplyCallback(bound));
      }
      if (!failures.length) await attempt(() => record('final-complete'));
      else
        await attempt(() =>
          record('final-failed', {
            failureTypes: failures.map((error) => (error instanceof Error ? error.name : typeof error)),
          }),
        );
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(failures, 'Original apply final capture and retention incomplete');
    },
    async closeAfterExecutorExit() {
      if (closed) return;
      if (started && (!finalStarted || !groupClosed)) throw new Error('Original apply executor closure required');
      await original.assertInputs();
      await methods.close();
      await record('closed');
      closed = true;
    },
  };
}
