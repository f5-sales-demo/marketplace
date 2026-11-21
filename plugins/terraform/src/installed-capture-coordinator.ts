import { assertOriginalApplyCallback, type OriginalApplyCallbackContext } from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import type { InstalledGcpCapture } from './installed-runtime';
import { assertFinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission, FinalExecutionCapture } from './signal-free-executor';

export interface InstalledCaptureStage {
  readonly name: string;
  readonly worker: InstalledGcpCapture;
  /** Wait for predecessor settlement, including refusal, before this final capture. */
  readonly finalAfter?: readonly string[];
  /** Keep shared sources open until dependent closure settles, including refusal. */
  readonly closeAfter?: readonly string[];
}
export interface InstalledCaptureCoordinatorOptions {
  /** Compiled source initializer only; never a tool argument or an authority grant. */
  stages(context: InstalledCaptureContext): Promise<readonly InstalledCaptureStage[]>;
  persist(event: Readonly<Record<string, unknown>>): Promise<void>;
}
const sameActor = (a: ExecutionCaptureAdmission['identity'], b: ExecutionCaptureAdmission['identity']) =>
  (['pid', 'group', 'start', 'boot'] as const).every((key) => a[key] === b[key]);

/** Coordinates original stages. Stage coverage, guest acceptance and execution
 * authorization must be established by the enclosing concrete factory.
 */
export function createInstalledCaptureCoordinator(
  context: InstalledCaptureContext,
  options: InstalledCaptureCoordinatorOptions,
): InstalledGcpCapture {
  const initialize = options.stages,
    persist = options.persist;
  const budget = Object.freeze({ ...context.budget });
  let preparation: Promise<void> | undefined;
  let stages: readonly InstalledCaptureStage[] | undefined;
  let graphsQualified = false;
  let actor: ExecutionCaptureAdmission | undefined;
  let before: OriginalApplyCallbackContext | undefined;
  let startupClaimed = false,
    finalClaimed = false,
    closing = false,
    closed = false;
  let operationFailure: unknown;
  let finalPromise: Promise<void> | undefined;
  let finalCapture: FinalExecutionCapture | undefined;
  let after: OriginalApplyCallbackContext | undefined;
  let closePromise: Promise<void> | undefined;
  const record = (phase: string, name?: string, error?: unknown) =>
    persist(
      Object.freeze({
        schemaVersion: 1,
        kind: 'original-installed-capture-coordinator-event',
        phase,
        ...(name ? { stage: name } : {}),
        ...(error ? { errorType: error instanceof Error ? error.name : typeof error } : {}),
        owner: context.owner,
        budget,
        executionQualified: false,
      }),
    );
  const inputs = async () => {
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original collector operation budget changed');
    await context.assertInputs();
  };
  const within = async () => {
    await inputs();
    await context.assertWithinDeadline();
  };
  const checkCallback = async (value: OriginalApplyCallbackContext, phase: 'before' | 'after') => {
    await assertOriginalApplyCallback(value);
    if (value.phase !== phase || value.original !== context || value.execution.directory !== context.executionDirectory)
      throw new Error('Original collector callback context differs');
    if (actor && !sameActor(actor.identity, value.execution.identity))
      throw new Error('Original collector execution actor differs');
    if (before && before.nonce !== value.nonce) throw new Error('Original collector callback lifetime differs');
  };
  const stageSet = () => {
    if (!stages) throw new Error('Original collector stages are not prepared');
    return stages;
  };
  const captureGuard = async () => {
    if (!after?.reserve) throw new Error('Original collector final callback required');
    await inputs();
    await checkCallback(after, 'after');
    await assertFinalReaderReserve(after.reserve);
  };
  const aggregate = (failures: unknown[], message: string) => {
    if (failures.length) throw new AggregateError(failures, message);
  };
  return {
    prepare(original) {
      if (original !== context || startupClaimed || finalClaimed || closing || closed)
        return Promise.reject(new Error('Original collector preparation context or lifecycle differs'));
      preparation ??= (async () => {
        try {
          await within();
          const supplied = await initialize(context);
          if (
            !supplied.length ||
            supplied.some((stage) => !/^[a-z][a-z0-9-]{0,63}$/.test(stage.name)) ||
            new Set(supplied.map((stage) => stage.name)).size !== supplied.length
          )
            throw new Error('Unique original collector stages required');
          stages = Object.freeze(
            supplied.map((stage) =>
              Object.freeze({
                name: stage.name,
                finalAfter: Object.freeze([...(stage.finalAfter ?? [])]),
                closeAfter: Object.freeze([...(stage.closeAfter ?? [])]),
                worker: Object.freeze({
                  prepare: stage.worker.prepare?.bind(stage.worker),
                  start: stage.worker.start.bind(stage.worker),
                  assertOriginal: stage.worker.assertOriginal.bind(stage.worker),
                  finalCapture: stage.worker.finalCapture.bind(stage.worker),
                  closeAfterExecutorExit: stage.worker.closeAfterExecutorExit.bind(stage.worker),
                }),
              }),
            ),
          );
          for (const [key, phase] of [
            ['finalAfter', 'final'],
            ['closeAfter', 'closure'],
          ] as const) {
            const visiting = new Set<string>(),
              visited = new Set<string>();
            const visit = (name: string) => {
              if (visiting.has(name)) throw new Error(`Original collector ${phase} dependencies are cyclic`);
              if (visited.has(name)) return;
              const stage = stageSet().find((stage) => stage.name === name);
              if (!stage) throw new Error(`Original collector ${phase} dependency is unavailable`);
              visiting.add(name);
              for (const dependency of stage[key] ?? []) visit(dependency);
              visiting.delete(name);
              visited.add(name);
            };
            for (const stage of stages) visit(stage.name);
          }
          graphsQualified = true;
          for (const stage of stages) {
            await within();
            await stage.worker.prepare?.(context);
            await within();
            await record('prepared', stage.name);
          }
        } catch (error) {
          operationFailure ??= error;
          try {
            await record('preparation-refused', undefined, error);
          } catch (retention) {
            throw new AggregateError([error, retention], 'Original collector preparation retention failed');
          }
          throw error;
        }
      })();
      return preparation;
    },
    async start(admission, callback) {
      if (!callback) throw new Error('Original collector before callback required');
      await checkCallback(callback, 'before');
      if (startupClaimed || finalClaimed || closing || closed || operationFailure)
        throw new Error('Original collector startup already claimed or refused');
      if (!preparation) throw new Error('Original collector preparation required before startup');
      await preparation;
      await checkCallback(callback, 'before');
      if (startupClaimed || finalClaimed || closing || closed || operationFailure)
        throw new Error('Original collector startup already claimed or refused');
      if (
        admission !== callback.execution ||
        !sameActor(admission.identity, callback.execution.identity) ||
        admission.directory !== context.executionDirectory ||
        admission.originalStartMs !== budget.start ||
        admission.originalDeadlineMs !== budget.deadline ||
        admission.args[0] !== 'apply'
      )
        throw new Error('Original collector apply admission differs');
      startupClaimed = true;
      actor = admission;
      before = callback;
      try {
        for (const stage of stageSet()) {
          await checkCallback(callback, 'before');
          await stage.worker.start(admission, callback);
          await checkCallback(callback, 'before');
          await record('started', stage.name);
        }
      } catch (error) {
        operationFailure ??= error;
        try {
          await record('startup-refused', undefined, error);
        } catch (retention) {
          throw new AggregateError([error, retention], 'Original collector startup retention failed');
        }
        throw error;
      }
    },
    async assertOriginal() {
      if (closed || closing || finalClaimed || operationFailure)
        throw new Error('Original collector lifetime retired or refused');
      await within();
      if (stages) for (const stage of stages) await stage.worker.assertOriginal();
      await within();
    },
    async finalCapture(capture, reserve, callback) {
      if (!callback || !reserve || callback.reserve !== reserve)
        throw new Error('Original collector after callback and actual reserve required');
      await checkCallback(callback, 'after');
      if (finalClaimed || closed || closing) throw new Error('Original collector final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !capture.identity ||
        !sameActor(capture.identity, callback.execution.identity) ||
        capture.pid !== capture.identity.pid ||
        capture.originalDeadlineMs !== budget.deadline ||
        timing.originalStartMs !== budget.start ||
        timing.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        capture.signalsSent !== false
      )
        throw new Error('Original collector final actor or unchanged budget differs');
      finalClaimed = true;
      finalCapture = capture;
      after = callback;
      finalPromise = (async () => {
        const failures: unknown[] = [];
        try {
          await record('final-started');
        } catch (error) {
          failures.push(error);
        }
        const pending = new Map<string, Promise<void>>();
        const captureStage = (name: string): Promise<void> => {
          const existing = pending.get(name);
          if (existing) return existing;
          const stage = stageSet().find((stage) => stage.name === name);
          if (!stage) return Promise.reject(new Error('Original collector final stage unavailable'));
          const promise = (async () => {
            await Promise.allSettled((stage.finalAfter ?? []).map(captureStage));
            try {
              await captureGuard();
              await stage.worker.finalCapture(capture, reserve, callback);
              await captureGuard();
              await record('final-captured', name);
            } catch (error) {
              failures.push(error);
              try {
                await record('final-refused', name, error);
              } catch (retention) {
                failures.push(retention);
              }
            }
          })();
          pending.set(name, promise);
          return promise;
        };
        await Promise.allSettled(stageSet().map((stage) => captureStage(stage.name)));
        aggregate(failures, 'Original collector final capture incomplete');
      })();
      await finalPromise;
    },
    closeAfterExecutorExit() {
      closePromise ??= (async () => {
        if (!stages || !graphsQualified) throw new Error('Original collector closure dependencies are unavailable');
        if (startupClaimed && (!finalClaimed || !finalPromise || !finalCapture?.originalGroupClosed))
          throw new Error('Original collector final capture and parent closure required');
        closing = true;
        const failures: unknown[] = [];
        try {
          await finalPromise;
        } catch (error) {
          failures.push(error);
        }
        try {
          await inputs();
        } catch (error) {
          failures.push(error);
        }
        const pending = new Map<string, Promise<void>>();
        const closeStage = (name: string): Promise<void> => {
          const existing = pending.get(name);
          if (existing) return existing;
          const stage = stageSet().find((stage) => stage.name === name);
          if (!stage) return Promise.reject(new Error('Original collector closure stage unavailable'));
          const promise = (async () => {
            await Promise.allSettled((stage.closeAfter ?? []).map(closeStage));
            try {
              await stage.worker.closeAfterExecutorExit();
              await record('stage-closed', stage.name);
            } catch (error) {
              try {
                await record('closure-refused', stage.name, error);
              } catch (retention) {
                throw new AggregateError([error, retention], 'Original collector closure retention failed');
              }
              throw error;
            }
          })();
          pending.set(name, promise);
          return promise;
        };
        const outcomes = await Promise.allSettled(stageSet().map((stage) => closeStage(stage.name)));
        for (const outcome of outcomes) if (outcome.status === 'rejected') failures.push(outcome.reason);
        aggregate(failures, 'Original collector closure incomplete; failed captures retained');
        await record(startupClaimed ? 'closed' : 'preflight-closed');
        closed = true;
      })();
      return closePromise;
    },
  };
}
