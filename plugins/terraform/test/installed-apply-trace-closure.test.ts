import { expect, test } from 'bun:test';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { openInstalledApplyTraceStage } from '../src/installed-apply-trace-stage';
import { assertOriginalTerraformPlanProjection } from '../src/runner';
import { fixture } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

test('creation trace preflight closes after its actual owning runner plan lease retires', async () => {
  let stage: Awaited<ReturnType<typeof openInstalledApplyTraceStage>> | undefined;
  let store: Parameters<Parameters<typeof fixture>[0]>[1] | undefined;
  let plan: Parameters<typeof assertOriginalTerraformPlanProjection>[0];
  await fixture(
    async (context, originalStore) => {
      store = originalStore;
      plan = await context.readOriginalPlanSource?.();
      const providers = await context.readProviderInputs();
      const provider = providers['registry.terraform.io/hashicorp/google:terraform-provider-google_v8.12.0_x5'];
      if (!provider) throw new Error('Original source-qualified provider required');
      stage = await openInstalledApplyTraceStage({
        context,
        store: originalStore,
        providerPath: provider.path,
        onResponse: async () => {},
      });
      await stage.prepare?.(context);
    },
    '',
    true,
    () => false,
    (intent) =>
      JSON.stringify(
        translateGcpTerraformObserverSiteCompute(
          intent,
          GCP_XCSH15178_OBSERVER_ARTIFACTS.versions,
          intent.observer as NonNullable<typeof intent.observer>,
          createGcpTerraformRequestReason(intent),
        ).configuration,
      ),
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
    7200000,
    async () => {
      if (!stage || !store || !plan) throw new Error('Original trace preflight sources required');
      let outcome: 'success' | 'failure' = 'failure';
      try {
        await expect(assertOriginalTerraformPlanProjection(plan)).rejects.toThrow('retired');
        await stage.closeAfterExecutorExit();
        outcome = 'success';
      } finally {
        await retainOwnedTestCapture(store.directory, 'creation-trace-retired-original-plan', outcome);
      }
    },
  );
});

test('failed native startup retains original output closure before UI coverage refuses capture', async () => {
  const { createHash } = await import('node:crypto');
  const { readFile, readdir, realpath, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { assertOriginalApplyGroupClosed, createInstalledApplyController } = await import(
    '../src/installed-apply-controller'
  );
  const { admitFinalReaderReserve } = await import('../src/reader-final-reserve');
  const { signalFreeTerraformExecutor } = await import('../src/signal-free-executor');
  await fixture(
    async (context, store) => {
      let outcome: 'success' | 'failure' = 'failure';
      try {
        const providers = await context.readProviderInputs();
        const provider = providers['registry.terraform.io/hashicorp/google:terraform-provider-google_v8.12.0_x5'];
        if (!provider) throw new Error('Original trace fixture provider required');
        const stage = await openInstalledApplyTraceStage({
          context,
          store,
          providerPath: provider.path,
          onResponse: async () => {
            throw new Error('Offline refused startup has no insert response');
          },
        });
        let after: import('../src/installed-apply-controller').OriginalApplyCallbackContext | undefined;
        const events: Readonly<Record<string, unknown>>[] = [];
        const controller = createInstalledApplyController(
          context,
          {
            ...stage,
            async finalCapture(finished, reserve, callback) {
              if (!callback) throw new Error('Original trace final callback required');
              after = callback;
              await stage.finalCapture(finished, reserve, callback);
            },
          },
          {
            persist: async (event) => {
              events.push(event);
            },
          },
        );
        await controller.prepare?.(context);
        const python = await realpath(context.inputs.python.path);
        const executable = {
          path: python,
          sha256: createHash('sha256')
            .update(await readFile(python))
            .digest('hex'),
        };
        await writeFile(join(context.executionDirectory, 'apply'), 'raise SystemExit(0)\n', { mode: 0o600 });
        const execute = signalFreeTerraformExecutor({
          python: executable,
          executable,
          originalStartMs: context.budget.start,
          originalDeadlineMs: context.budget.deadline,
          assertOriginal: context.assertInputs,
          async beforeRelease(admission) {
            await controller.start(admission);
            await expect(controller.closeAfterExecutorExit()).rejects.toThrow('executor closure required');
            throw new Error('Intentional offline trace startup refusal before submission');
          },
          async finalCapture(finished) {
            expect(finished.submitted).toBe(false);
            expect(finished.originalGroupClosed).toBe(false);
            await writeFile(
              join(context.executionDirectory, 'trace-parent-final.private.json'),
              JSON.stringify(finished),
              { mode: 0o400, flag: 'wx' },
            );
            if (!finished.identity) throw new Error('Original native trace parent required');
            const reserve = admitFinalReaderReserve({
              identity: finished.identity,
              originalStartMs: context.budget.start,
              originalDeadlineMs: context.budget.deadline,
              finalStartedMs: finished.finalStartedMs,
              finalDeadlineMs: finished.finalDeadlineMs,
              assertOriginal: context.assertInputs,
            });
            await expect(controller.finalCapture(finished, reserve)).rejects.toThrow('trace capture incomplete');
          },
        });
        const result = await execute({ cwd: context.executionDirectory, args: ['apply', 'saved.tfplan'], env: {} });
        expect(result.code).toBe(1);
        if (!after) throw new Error('Original failed final callback required');
        await assertOriginalApplyGroupClosed(after);
        await expect(assertOriginalApplyGroupClosed({ ...after })).rejects.toThrow(
          'Original final apply callback required',
        );
        // The initial false snapshot survives; only the same output issuer's
        // independent proof admits closure, without accepting parser coverage.
        expect(events.filter((event) => event.phase === 'group-closure-source')).toHaveLength(1);
        expect(events.some((event) => event.phase === 'final-failed')).toBe(true);
        expect(stage.coverage().failed).toBe(true);
        expect(stage.coverage().completed).toBe(false);
        expect(stage.coverage().responses).toBe(0);
        await expect(controller.closeAfterExecutorExit()).rejects.toThrow('Original trace closure incomplete');
        await assertOriginalApplyGroupClosed(after);
        const retained = await Promise.all(
          (await readdir(store.directory))
            .filter((name) => name.startsWith('gcp-apply-trace-'))
            .map(
              (name) =>
                store.read(name) as Promise<{ phase: string; errorMessage?: string; executionQualified: boolean }>,
            ),
        );
        expect(
          retained.some(
            (event) =>
              event.phase === 'final-refused' && event.errorMessage === 'Original UI descriptor completion differs',
          ),
        ).toBe(true);
        expect(retained.every((event) => event.executionQualified === false)).toBe(true);
        outcome = 'success';
      } finally {
        await retainOwnedTestCapture(store.directory, 'creation-trace-refused-native-startup', outcome);
      }
    },
    '',
    true,
    () => false,
    (intent) =>
      JSON.stringify(
        translateGcpTerraformObserverSiteCompute(
          intent,
          GCP_XCSH15178_OBSERVER_ARTIFACTS.versions,
          intent.observer as NonNullable<typeof intent.observer>,
          createGcpTerraformRequestReason(intent),
        ).configuration,
      ),
    undefined,
    GCP_XCSH15178_OBSERVER_ARTIFACTS.providerLock,
    true,
  );
}, 60000);
