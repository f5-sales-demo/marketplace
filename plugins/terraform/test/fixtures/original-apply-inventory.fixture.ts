/** Actual plan/context and gated output issuers with explicit offline HTTP observations. */
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { GcpCeIntent } from '../../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { originalGcpBootstrapSource } from '../../../platform/src/ce/gcp-bootstrap-evidence';
import {
  type GcpBootstrapObservationSourceBinding,
  openOriginalGcpBootstrapObservation,
} from '../../../platform/src/ce/gcp-bootstrap-observation';
import {
  createInstalledApplyController,
  type OriginalApplyCallbackContext,
} from '../../src/installed-apply-controller';
import type { InstalledCaptureContext } from '../../src/installed-capture-context';
import { createInstalledCaptureCoordinator } from '../../src/installed-capture-coordinator';
import * as inventories from '../../src/installed-initial-inventory';
import { openInstalledInventoryCaptureStage } from '../../src/installed-inventory-capture-stage';
import { linuxMonotonicMs } from '../../src/linux-clock';
import { prepareOriginalGcpInventoryScope } from '../../src/original-gcp-inventory-scope';
import { admitFinalReaderReserve } from '../../src/reader-final-reserve';
import { type FinalExecutionCapture, signalFreeTerraformExecutor } from '../../src/signal-free-executor';
import { authInfo, fixture, roots } from '../original-gcp-inventory-fixture';

export async function withApplyInventory(
  run: (value: {
    packet: inventories.OriginalApplyGcpInventory;
    before: OriginalApplyCallbackContext;
    stage: Awaited<ReturnType<typeof inventories.openInstalledInitialInventory>>;
    snapshot: inventories.OriginalInitialGcpInventory;
    store: CeDeploymentStore;
  }) => Promise<void>,
  ha = true,
  finalRun?: (value: {
    packet: inventories.OriginalApplyGcpInventory;
    final: OriginalApplyCallbackContext;
    capture: FinalExecutionCapture;
  }) => Promise<void>,
  output?: (
    context: InstalledCaptureContext,
    store: CeDeploymentStore,
  ) => Promise<{
    prefix: string;
    tail: string;
    stdoutPrefix?: string;
    stdoutTail?: string;
  }>,
  expectedOutcome?: 'deadline' | 'capture',
  configuration?: (intent: GcpCeIntent) => string,
  prepareIntent?: (intent: GcpCeIntent, store: CeDeploymentStore) => Promise<void>,
  providerLock?: string,
  coordinatedInventory = false,
  finalClock?: () => number,
  sourceCaptureInputs = false,
  operationRemainingMs = 7200000,
) {
  await fixture(
    async (context, store, invocation) => {
      const scope = await prepareOriginalGcpInventoryScope(context, store);
      const fetcher = (async (url: string | URL | Request) => {
        const path = new URL(String(url)).pathname;
        if (path === '/token')
          return Response.json({ access_token: 'synthetic', token_type: 'Bearer', expires_in: 3599 });
        if (path === '/oauth2/v2/tokeninfo') return Response.json(authInfo);
        if (path === '/v1/projects/example-project')
          return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
        return Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 });
      }) as typeof fetch;
      const platform = {
        gcpBootstrapSource: () => originalGcpBootstrapSource,
        gcpBootstrapObservation: async (
          _owner: unknown,
          _name: string,
          binding: GcpBootstrapObservationSourceBinding,
        ) =>
          openOriginalGcpBootstrapObservation(
            {
              ...binding,
              store,
              origin: context.environment.XCSH_API_URL,
              credential: context.environment.XCSH_API_TOKEN,
            },
            { fetcher: async () => Response.json({ error: 'synthetic missing resource' }, { status: 404 }) },
          ),
      };
      const stage = await inventories.openInstalledInitialInventory({ context, scope, store, platform }, { fetcher });
      const inventoryWorker = coordinatedInventory
        ? await openInstalledInventoryCaptureStage({ context, store, platform }, { fetcher })
        : undefined;
      if (inventoryWorker) await inventoryWorker.prepare?.(context);
      const snapshot = inventoryWorker ? await inventoryWorker.readSnapshot() : await stage.capture();
      const trace = await output?.(context, store);
      const startedPath = join(invocation.cwd, 'child-started'),
        releasedPath = join(invocation.cwd, 'child-release');
      const scriptPath = join(invocation.cwd, 'apply');
      await writeFile(
        scriptPath,
        `${[
          'import os,time,sys',
          ...(trace
            ? [
                `sys.stdout.buffer.write(bytes.fromhex("${Buffer.from(trace.stdoutPrefix ?? '').toString('hex')}"));sys.stdout.flush()`,
                `sys.stderr.buffer.write(bytes.fromhex("${Buffer.from(trace.prefix).toString('hex')}"));sys.stderr.flush()`,
              ]
            : []),
          `open(${JSON.stringify(startedPath)},"x").write("started")`,
          // The synthetic apply follows the same original budget as its controller.
          // Completion is released explicitly in check.finally; an unrelated timer
          // must not truncate the owning RPC while a bounded capture is still running.
          `deadline=${context.budget.deadline}/1000`,
          `while not os.path.exists(${JSON.stringify(releasedPath)}):`,
          ' if time.monotonic()>=deadline: sys.exit(74)',
          ' time.sleep(0.01)',
          ...(trace
            ? [
                `sys.stdout.buffer.write(bytes.fromhex("${Buffer.from(trace.stdoutTail ?? '').toString('hex')}"));sys.stdout.flush()`,
                `sys.stderr.buffer.write(bytes.fromhex("${Buffer.from(trace.tail).toString('hex')}"));sys.stderr.flush()`,
              ]
            : []),
        ].join('\n')}\n`,
        { mode: 0o400 },
      );
      const python = await realpath(process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '');
      const binary = {
        path: python,
        sha256: createHash('sha256')
          .update(await readFile(python))
          .digest('hex'),
      };
      let before: OriginalApplyCallbackContext | undefined;
      let packet: inventories.OriginalApplyGcpInventory | undefined;
      let check: Promise<void> | undefined;
      let checkError: unknown;
      let finishedCapture: FinalExecutionCapture | undefined;
      let captureCheckPassed = false;
      const worker = {
        prepare: inventoryWorker?.prepare,
        start: async (
          _admission: import('../../src/signal-free-executor').ExecutionCaptureAdmission,
          callback?: OriginalApplyCallbackContext,
        ) => {
          if (!callback) throw new Error('Original callback required');
          before = callback;
          if (inventoryWorker) {
            await inventoryWorker.start(_admission, callback);
            packet = await inventoryWorker.readBaseline(callback);
          } else packet = await stage.bindForApply(snapshot, callback);
        },
        assertOriginal: inventoryWorker?.assertOriginal ?? (async () => {}),
        finalCapture: async (
          _finished: FinalExecutionCapture,
          _reserve?: import('../../src/reader-final-reserve').FinalReaderReserve,
          final?: OriginalApplyCallbackContext,
        ) => {
          if (inventoryWorker) await inventoryWorker.finalCapture(_finished, _reserve, final);
          if (!finalRun) return;
          if (!packet || !final) throw new Error('Original final bound inventory required');
          await finalRun({ packet, final, capture: _finished });
          captureCheckPassed = true;
        },
        closeAfterExecutorExit: inventoryWorker?.closeAfterExecutorExit ?? (async () => {}),
      };
      const coordinatedWorker = coordinatedInventory
        ? createInstalledCaptureCoordinator(context, {
            stages: async () => [{ name: 'inventory', worker }],
            persist: async () => {},
          })
        : worker;
      const control = createInstalledApplyController(context, coordinatedWorker, { persist: async () => {} });
      await control.prepare?.(context);
      const execute = signalFreeTerraformExecutor({
        python: binary,
        executable: binary,
        originalStartMs: context.budget.start,
        originalDeadlineMs: context.budget.deadline,
        assertOriginal: async () => {
          await context.assertInputs();
          if (linuxMonotonicMs() >= context.budget.deadline) throw new Error('Original operation budget exhausted');
        },
        assertOriginalIdentity: context.assertInputs,
        assertFinalInputs: context.assertInputs,
        beforeRelease: async (admission) => {
          await control.start(admission);
          check = (async () => {
            try {
              const deadline = Date.now() + 15000;
              while (!(await Bun.file(startedPath).exists())) {
                if (Date.now() >= deadline) throw new Error('Original child startup expired');
                await Bun.sleep(10);
              }
              if (!packet || !before) throw new Error('Original bound inventory required');
              await run({ packet, before, stage, snapshot, store });
            } catch (error) {
              checkError = error;
            } finally {
              await writeFile(releasedPath, 'release', { flag: 'wx', mode: 0o400 });
            }
          })();
        },
        finalCapture: async (finished) => {
          finishedCapture = finished;
          await check;
          if (checkError) throw checkError;
          if (!finished.identity) throw new Error('Original final identity required');
          const reserve = admitFinalReaderReserve(
            {
              identity: finished.identity,
              originalStartMs: context.budget.start,
              originalDeadlineMs: context.budget.deadline,
              finalStartedMs: finished.finalStartedMs,
              finalDeadlineMs: finished.finalDeadlineMs,
              assertOriginal: context.assertInputs,
            },
            finalClock ? { clock: finalClock } : undefined,
          );
          await control.finalCapture(finished, reserve);
          await control.closeAfterExecutorExit();
        },
      });
      try {
        const result = await execute({
          cwd: invocation.cwd,
          args: ['apply', '-json', '-parallelism=1', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan'],
          env: {},
        });
        if (expectedOutcome === 'deadline') {
          if (
            result.code !== 1 ||
            finishedCapture?.reason !== 'deadline' ||
            !finishedCapture.submitted ||
            finishedCapture.originalDeadlineMs !== context.budget.deadline
          )
            throw new Error('Original fixture deadline refusal required');
        } else if (expectedOutcome === 'capture') {
          if (result.code !== 1 || !finishedCapture?.originalGroupClosed || finishedCapture.signalsSent !== false)
            throw new Error('Original fixture closed-parent capture refusal required');
        } else if (result.code !== 0) throw new Error('Original fixture execution failed');
      } catch (error) {
        const index = roots.indexOf(dirname(dirname(invocation.cwd)));
        if (index >= 0) roots.splice(index, 1);
        await writeFile(
          join(invocation.cwd, 'fixture-failure.private.json'),
          JSON.stringify({
            message: error instanceof Error ? error.message : 'unknown',
            cloudResources: 0,
          }),
          { flag: 'wx', mode: 0o400 },
        );
        // The injected final clock intentionally exhausts the original reserve.
        // Accept this expected test outcome only after its adversarial assertions
        // passed; retain the original executor failure and unresolved lock.
        if (
          expectedOutcome === 'capture' &&
          captureCheckPassed &&
          !checkError &&
          finishedCapture?.originalGroupClosed &&
          finishedCapture.signalsSent === false &&
          error instanceof Error &&
          error.message === 'Original final reader reserve is exhausted or has not started'
        )
          return;
        throw error;
      } finally {
        await stage.close();
      }
    },
    '',
    ha,
    () => false,
    configuration,
    prepareIntent,
    providerLock,
    sourceCaptureInputs,
    operationRemainingMs,
  );
}
