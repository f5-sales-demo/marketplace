import { expect, test } from 'bun:test';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { fixture } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const changedOutput of [false, true])
  test(`delete-only source retains complete native output and refuses changed closure bytes: ${changedOutput}`, async () => {
    const { createHash } = await import('node:crypto');
    const { readFile, readdir, realpath, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { createInstalledApplyController } = await import('../src/installed-apply-controller');
    const { admitFinalReaderReserve } = await import('../src/reader-final-reserve');
    const { signalFreeTerraformExecutor } = await import('../src/signal-free-executor');
    await fixture(
      async (context, store) => {
        let outcome: 'success' | 'failure' = 'failure';
        try {
          const { openInstalledDeleteCapture } = await import('../src/installed-delete-capture');
          const plan = await context.readOriginalPlanSource?.();
          if (!plan) throw new Error('Original destroy plan required');
          const saved = (await store.read('gcp-terraform-input-identity.json')) as {
            intent: import('../../gcloud/src/ce/types').GcpCeIntent;
          };
          const capture = await openInstalledDeleteCapture({ context, store, plan, intent: saved.intent });
          let started = false,
            finalized = false;
          let originalStdoutPath = '';
          const controller = createInstalledApplyController(
            context,
            {
              ...capture,
              async start(admission, callback) {
                if (!callback) throw new Error('Original native callback required');
                await expect(capture.start({ ...admission }, callback)).rejects.toThrow('Original');
                await expect(capture.start(admission, { ...callback })).rejects.toThrow('Original');
                await capture.start(admission, callback);
                started = true;
              },
              async finalCapture(finished, reserve, callback) {
                if (!reserve || !callback) throw new Error('Original native final sources required');
                await expect(capture.finalCapture(finished, reserve, { ...callback })).rejects.toThrow('Original');
                await expect(
                  capture.finalCapture(
                    { ...finished, finalDeadlineMs: finished.finalDeadlineMs + 1 },
                    reserve,
                    callback,
                  ),
                ).rejects.toThrow('Original');
                await capture.finalCapture(finished, reserve, callback);
                finalized = true;
              },
            },
            { persist: async () => {} },
          );
          await controller.prepare?.(context);
          const python = await realpath(context.inputs.python.path);
          const executable = {
            path: python,
            sha256: createHash('sha256')
              .update(await readFile(python))
              .digest('hex'),
          };
          await writeFile(
            join(context.executionDirectory, 'apply'),
            "import sys\nprint('offline original delete actor stdout')\nprint('offline original delete actor stderr', file=sys.stderr)\n",
            { mode: 0o600 },
          );
          const execute = signalFreeTerraformExecutor({
            python: executable,
            executable,
            originalStartMs: context.budget.start,
            originalDeadlineMs: context.budget.deadline,
            assertOriginal: context.assertInputs,
            beforeRelease: (admission) => controller.start(admission),
            async finalCapture(finished) {
              originalStdoutPath = finished.stdoutPath;
              if (!finished.identity) throw new Error('Original native actor identity required');
              const reserve = admitFinalReaderReserve({
                identity: finished.identity,
                originalStartMs: context.budget.start,
                originalDeadlineMs: context.budget.deadline,
                finalStartedMs: finished.finalStartedMs,
                finalDeadlineMs: finished.finalDeadlineMs,
                assertOriginal: context.assertInputs,
              });
              await controller.finalCapture(finished, reserve);
            },
          });
          const result = await execute({ cwd: context.executionDirectory, args: ['apply', 'saved.tfplan'], env: {} });
          expect(result.code).toBe(0);
          expect(started).toBe(true);
          expect(finalized).toBe(true);
          if (changedOutput) {
            if (!originalStdoutPath) throw new Error('Original output file required');
            await writeFile(originalStdoutPath, 'foreign closure bytes');
            await expect(controller.closeAfterExecutorExit()).rejects.toThrow('Original input monitor detected');
            await expect(capture.closeAfterExecutorExit()).rejects.toThrow('Original');
            await expect(capture.closeAfterExecutorExit()).rejects.toThrow('Original');
            await expect(capture.start({} as never)).rejects.toThrow('Original');
          } else await controller.closeAfterExecutorExit();
          const records = await Promise.all(
            (await readdir(store.directory))
              .filter((name) => name.startsWith('gcp-delete-capture-'))
              .map(async (name) => JSON.parse(await readFile(join(store.directory, name), 'utf8'))),
          );
          const final = records.find((record) => record.phase === 'final');
          expect(final.completion.originalGroupClosed).toBe(true);
          expect(final.submitted).toBe(true);
          expect(final.actualExitCode).toBe(0);
          expect(records.filter((record) => record.phase === 'started')).toHaveLength(1);
          expect(records.filter((record) => record.phase === 'output')).toHaveLength(2);
          expect(
            records
              .filter((record) => record.phase === 'output')
              .map((record) => Buffer.from(record.bytesBase64, 'base64').toString())
              .sort(),
          ).toEqual(['offline original delete actor stderr\n', 'offline original delete actor stdout\n']);
          expect(
            records.every(
              (record) => record.executionAuthorized === false && record.independentAbsenceQualified === false,
            ),
          ).toBe(true);
          outcome = 'success';
        } finally {
          await retainOwnedTestCapture(store.directory, `delete-only-original-native-actor-${changedOutput}`, outcome);
        }
      },
      'destroy',
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

for (const mode of ['foreign-owner', 'foreign-directory', 'copied-plan', 'foreign-intent'] as const)
  test(`delete capture refuses a mismatched original source binding: ${mode}`, async () => {
    const { openInstalledDeleteCapture } = await import('../src/installed-delete-capture');
    await fixture(async (context, store) => {
      const plan = await context.readOriginalPlanSource?.();
      if (!plan) throw new Error('Original destroy plan required');
      const saved = (await store.read('gcp-terraform-input-identity.json')) as {
        intent: import('../../gcloud/src/ce/types').GcpCeIntent;
      };
      const changedContext =
        mode === 'foreign-owner'
          ? { ...context, owner: { ...context.owner, account: 'example-other-project' } }
          : mode === 'foreign-directory'
            ? { ...context, executionDirectory: '/example/foreign' }
            : context;
      const changedIntent = mode === 'foreign-intent' ? { ...saved.intent, deploymentName: 'foreign' } : saved.intent;
      await expect(
        openInstalledDeleteCapture({
          context: changedContext,
          store,
          plan: mode === 'copied-plan' ? { ...plan } : plan,
          intent: changedIntent,
        }),
      ).rejects.toThrow('Original');
    }, 'destroy');
  });

for (const changedPlan of [false, true])
  test(`original delete closure rechecks durable inputs after actual runner retirement: ${changedPlan}`, async () => {
    const { openInstalledDeleteCapture } = await import('../src/installed-delete-capture');
    let worker: Awaited<ReturnType<typeof openInstalledDeleteCapture>> | undefined;
    let originalPlan: Parameters<typeof openInstalledDeleteCapture>[0]['plan'] | undefined;
    let retainedStore: Parameters<Parameters<typeof fixture>[0]>[1] | undefined;
    await fixture(
      async (context, store) => {
        const plan = await context.readOriginalPlanSource?.();
        if (!plan) throw new Error('Original destroy plan required');
        const saved = (await store.read('gcp-terraform-input-identity.json')) as {
          intent: import('../../gcloud/src/ce/types').GcpCeIntent;
        };
        originalPlan = plan;
        worker = await openInstalledDeleteCapture({ context, store, plan, intent: saved.intent });
        retainedStore = store;
        await worker.prepare?.(context);
      },
      'destroy',
      true,
      () => false,
      undefined,
      undefined,
      undefined,
      false,
      7200000,
      async () => {
        if (!worker || !retainedStore) throw new Error('Original deletion stage required');
        if (!originalPlan) throw new Error('Original retired plan required');
        const { assertOriginalTerraformPlanProjection } = await import('../src/runner');
        await expect(assertOriginalTerraformPlanProjection(originalPlan)).rejects.toThrow('retired');
        let outcome: 'success' | 'failure' = 'failure';
        try {
          if (changedPlan) {
            const { writeFile } = await import('node:fs/promises');
            const { join } = await import('node:path');
            await writeFile(join(originalPlan.directory, 'saved.tfplan'), 'foreign retired-plan bytes');
            await expect(worker.closeAfterExecutorExit()).rejects.toThrow('Original');
          } else await worker.closeAfterExecutorExit();
          await expect(assertOriginalTerraformPlanProjection(originalPlan)).rejects.toThrow('retired');
          outcome = 'success';
        } finally {
          await retainOwnedTestCapture(
            retainedStore.directory,
            `delete-original-retired-runner-plan-${changedPlan}`,
            outcome,
          );
        }
      },
    );
  });
