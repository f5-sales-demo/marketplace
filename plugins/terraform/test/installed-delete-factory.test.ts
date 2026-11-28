import { expect, test } from 'bun:test';
import { translateGcpTerraformObserverSiteCompute } from '../../gcloud/src/ce/observer-plan';
import { createGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import { GCP_XCSH15178_OBSERVER_ARTIFACTS } from '../../gcloud/src/ce/terraform-public-artifacts';
import { createInstalledGcpCaptureFactory } from '../src/installed-capture-factory';
import type { CeTerraformRuntimeRequest } from '../src/service';
import { fixture } from './original-gcp-inventory-fixture';
import { retainOwnedTestCapture } from './retained-test-capture';

for (const mode of ['destroy', 'destroy-partial', 'destroy-empty'])
  test(`complete factory admits original delete-only preflight without creation or guest access: ${mode}`, async () => {
    await fixture(
      async (context, store) => {
        const request = {
          owner: context.owner,
          directory: store.directory,
          resume: true,
          deployment: {
            deploymentId: context.owner.deploymentId,
            engine: 'terraform',
            scope: { cloud: 'gcp', account: context.owner.account, region: context.owner.region },
          },
          platform: {
            storage: async () => store,
            gcpBootstrapSource: () => {
              throw new Error('Delete-only capture must not open bootstrap');
            },
            gcpBootstrapObservation: () => {
              throw new Error('Delete-only capture must not require registration');
            },
          },
        } as unknown as CeTerraformRuntimeRequest;
        const capture = createInstalledGcpCaptureFactory()(request, context);
        await capture.prepare?.(context);
        await expect(capture.prepare?.({ ...context })).rejects.toThrow('Original');
        await capture.assertOriginal();
        await capture.closeAfterExecutorExit();
        if (!capture.readClosedReaderGroupInputs) throw new Error('Original delete source accessor required');
        const inputs = await capture.readClosedReaderGroupInputs();
        const { readFile } = await import('node:fs/promises');
        const bindings = Object.values(inputs);
        expect(bindings).toHaveLength(1);
        const groups = JSON.parse(await readFile(bindings[0].path, 'utf8'));
        expect(groups.requiredSources).toEqual(['delete-output']);
        expect(groups.sources).toEqual([{ name: 'delete-output', attemptCount: 0, witnesses: [] }]);
        expect(groups.executionAccepted).toBe(false);
        expect(groups.guestAcceptanceComplete).toBe(false);
        const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
        await assertOriginalReaderGroupInputs({
          inputs,
          owner: context.owner,
          requiredSources: groups.requiredSources,
        });
        await retainOwnedTestCapture(store.directory, `delete-only-preflight-${mode}`, 'success');
      },
      mode,
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
  });

for (const [changedOutput, emptyStderr] of [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const)
  test(`delete-only factory retains complete native output and refuses changed closure bytes: ${changedOutput}, empty stderr: ${emptyStderr}`, async () => {
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
          const request = {
            owner: context.owner,
            directory: store.directory,
            resume: true,
            deployment: {
              deploymentId: context.owner.deploymentId,
              engine: 'terraform',
              scope: { cloud: 'gcp', account: context.owner.account, region: context.owner.region },
            },
            platform: { storage: async () => store },
          } as unknown as CeTerraformRuntimeRequest;
          const capture = createInstalledGcpCaptureFactory()(request, context);
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
            emptyStderr
              ? "print('offline original delete actor stdout')\n"
              : "import sys\nprint('offline original delete actor stdout')\nprint('offline original delete actor stderr', file=sys.stderr)\n",
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
            await expect(capture.closeAfterExecutorExit()).rejects.toThrow('closure');
            await expect(capture.closeAfterExecutorExit()).rejects.toThrow('closure');
            await expect(capture.start({} as never)).rejects.toThrow('closed');
          } else {
            await controller.closeAfterExecutorExit();
            if (!capture.readClosedReaderGroupInputs) throw new Error('Original delete source accessor required');
            const inputs = await capture.readClosedReaderGroupInputs();
            const groups = JSON.parse(await readFile(Object.values(inputs)[0].path, 'utf8'));
            expect(groups.requiredSources).toEqual(['delete-output']);
            expect(groups.sources).toEqual([{ name: 'delete-output', attemptCount: 0, witnesses: [] }]);
            const { assertOriginalReaderGroupInputs } = await import('../src/original-reader-group-closure');
            await assertOriginalReaderGroupInputs({ inputs, owner: context.owner, requiredSources: ['delete-output'] });
            const { collectInstalledOriginalDeleteReaderSources } = await import('../src/installed-delete-capture');
            await expect(collectInstalledOriginalDeleteReaderSources({ ...capture })).rejects.toThrow('source-issued');
            // A persisted zero-reader set does not authorize altered executor
            // output, including an originally empty stderr channel.
            const target = emptyStderr ? join(originalStdoutPath, '..', 'stderr.private') : originalStdoutPath;
            await writeFile(target, 'changed after original closure');
            await expect(capture.readClosedReaderGroupInputs()).rejects.toThrow('Original input monitor detected');
          }
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
          expect(records.filter((record) => record.phase === 'output')).toHaveLength(emptyStderr ? 1 : 2);
          if (emptyStderr) {
            expect(final.completion.stderr.bytes).toBe(0);
            expect(final.completion.stderr.sha256).toBe(createHash('sha256').update('').digest('hex'));
          }
          expect(
            records
              .filter((record) => record.phase === 'output')
              .map((record) => Buffer.from(record.bytesBase64, 'base64').toString())
              .sort(),
          ).toEqual(
            emptyStderr
              ? ['offline original delete actor stdout\n']
              : ['offline original delete actor stderr\n', 'offline original delete actor stdout\n'],
          );
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
