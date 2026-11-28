import { randomUUID } from 'node:crypto';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { assertOriginalApplyCallback, assertOriginalApplyGroupClosed } from './installed-apply-controller';
import {
  assertOriginalApplyGcpInventoryCallback,
  type InstalledInitialInventoryInput,
  type InstalledInitialInventoryOptions,
  type OriginalApplyGcpInventory,
  type OriginalInitialGcpInventory,
  openInstalledInitialInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
import type { InstalledGcpCapture } from './installed-runtime';
import {
  closeOriginalGcpInventoryScope,
  inspectOriginalGcpInventoryScope,
  prepareOriginalGcpInventoryScope,
} from './original-gcp-inventory-scope';
import { assertFinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

export type InstalledInventoryCaptureInput = Omit<InstalledInitialInventoryInput, 'scope'>;
/** Concrete original absence stage for the enclosing collector. Capturing and
 * binding its baseline grants neither mutation authority nor guest acceptance.
 */
export async function openInstalledInventoryCaptureStage(
  input: InstalledInventoryCaptureInput,
  options: InstalledInitialInventoryOptions = {},
) {
  const { context, store, platform } = input;
  const scope = await prepareOriginalGcpInventoryScope(context, store);
  const declared = await inspectOriginalGcpInventoryScope(scope);
  const inventory = await openInstalledInitialInventory({ context, store, platform, scope }, options);
  let snapshot: OriginalInitialGcpInventory | undefined;
  let baseline: OriginalApplyGcpInventory | undefined;
  let preparation: Promise<void> | undefined;
  let before: OriginalApplyCallbackContext | undefined;
  let after: OriginalApplyCallbackContext | undefined;
  let actor: ExecutionCaptureAdmission | undefined;
  let started = false,
    finalStarted = false,
    parentClosed = false,
    closed = false;
  let closure: Promise<void> | undefined;
  const budget = Object.freeze({ ...context.budget });
  const retain = async (phase: string, extra: Record<string, unknown> = {}) => {
    await store.verify();
    await store.write(`gcp-inventory-stage-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-inventory-capture-stage-event',
      phase,
      owner: context.owner,
      planSha256: declared.planSha256,
      originalBudget: budget,
      resources: declared.resources,
      executor: actor?.identity,
      ...extra,
      executionAuthorized: false,
      guestAcceptanceComplete: false,
    });
  };
  const within = async () => {
    if (closed || finalStarted) throw new Error('Original inventory capture lifetime retired');
    await context.assertInputs();
    await context.assertWithinDeadline();
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original inventory operation budget changed');
  };
  const worker: InstalledGcpCapture = {
    prepare(original) {
      if (original !== context || started || closed || finalStarted)
        return Promise.reject(new Error('Original inventory preparation context differs'));
      preparation ??= (async () => {
        try {
          await within();
          snapshot = await inventory.capture();
          const observed = await inventory.inspect(snapshot);
          if (observed.planSha256 !== declared.planSha256 || observed.resources.length !== declared.resources.length)
            throw new Error('Original inventory prepared coverage differs');
          await retain('captured', { cloudCount: observed.cloudCount, platformCount: observed.platformCount });
        } catch (error) {
          await retain('preparation-refused', { errorType: error instanceof Error ? error.name : typeof error });
          throw error;
        }
      })();
      return preparation;
    },
    async start(admission, callback) {
      if (!callback) throw new Error('Original inventory before callback required');
      await assertOriginalApplyCallback(callback);
      if (callback.original !== context || callback.phase !== 'before' || callback.execution !== admission)
        throw new Error('Original inventory actual apply admission required');
      if (!preparation) throw new Error('Original inventory preflight must precede startup');
      await preparation;
      await assertOriginalApplyCallback(callback);
      if (started || finalStarted || closed || !snapshot)
        throw new Error('Original inventory startup already claimed or unavailable');
      started = true;
      actor = admission;
      before = callback;
      try {
        baseline = await inventory.bindForApply(snapshot, callback);
        await retain('bound');
      } catch (error) {
        await retain('binding-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
    },
    async assertOriginal() {
      await within();
      if (snapshot && !started) await inventory.assertSnapshot(snapshot);
      if (baseline && before) await assertOriginalApplyGcpInventoryCallback(baseline, before);
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.phase !== 'after' ||
        callback.original !== context ||
        callback.reserve !== reserve
      )
        throw new Error('Original inventory reserved final callback required');
      await assertOriginalApplyCallback(callback);
      if (finalStarted || closed) throw new Error('Original inventory final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        !capture.identity ||
        (['pid', 'group', 'start', 'boot'] as const).some(
          (key) => capture.identity?.[key] !== callback.execution.identity[key],
        )
      )
        throw new Error('Original inventory final actor or budget differs');
      finalStarted = true;
      after = callback;
      parentClosed = capture.originalGroupClosed;
      await assertFinalReaderReserve(reserve);
      if (!baseline) {
        await retain('final-unbound', { finalReserve: timing, beforeBaselineUnavailable: true });
        throw new Error('Original inventory final capture incomplete; baseline was not bound');
      }
      try {
        await assertOriginalApplyGcpInventoryCallback(baseline, callback);
        const source = await readOriginalApplyGcpInventory(baseline, callback);
        await retain('final-bound', { finalReserve: timing, cloudCount: source.cloud.length });
        await assertFinalReaderReserve(reserve);
      } catch (error) {
        await retain('final-refused', {
          errorType: error instanceof Error ? error.name : typeof error,
          finalReserve: timing,
        });
        throw error;
      }
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        if (started && !finalStarted) throw new Error('Original inventory parent closure required');
        if (started && !parentClosed) await assertOriginalApplyGroupClosed(after);
        await inventory.close();
        closeOriginalGcpInventoryScope(scope);
        closed = true;
      })();
      return closure;
    },
  };
  return Object.freeze({
    ...worker,
    coverage: () =>
      Object.freeze({
        resources: snapshot ? declared.resources.length : 0,
        baselineBound: !!baseline,
        executionAuthorized: false,
        guestAcceptanceComplete: false,
      }),
    async readSnapshot() {
      if (!snapshot || closed || finalStarted) throw new Error('Original inventory snapshot unavailable');
      await inventory.assertSnapshot(snapshot);
      return snapshot;
    },
    async readBaseline(callback: OriginalApplyCallbackContext) {
      if (!baseline || closed) throw new Error('Original bound inventory source unavailable');
      await assertOriginalApplyGcpInventoryCallback(baseline, callback);
      return baseline;
    },
  });
}
