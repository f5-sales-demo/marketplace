/** Actual plan/context and gated output issuers with explicit offline HTTP observations. */
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
import * as inventories from '../../src/installed-initial-inventory';
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
  }) => Promise<void>,
  ha = true,
  finalRun?: (value: {
    packet: inventories.OriginalApplyGcpInventory;
    final: OriginalApplyCallbackContext;
  }) => Promise<void>,
  output?: (context: InstalledCaptureContext, store: CeDeploymentStore) => Promise<{ prefix: string; tail: string }>,
  expectedOutcome?: 'deadline',
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
      const snapshot = await stage.capture();
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
                `sys.stderr.buffer.write(bytes.fromhex("${Buffer.from(trace.prefix).toString('hex')}"));sys.stderr.flush()`,
              ]
            : []),
          `open(${JSON.stringify(startedPath)},"x").write("started")`,
          'deadline=time.monotonic()+30',
          `while not os.path.exists(${JSON.stringify(releasedPath)}):`,
          ' if time.monotonic()>=deadline: sys.exit(74)',
          ' time.sleep(0.01)',
          ...(trace
            ? [
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
      const control = createInstalledApplyController(
        context,
        {
          start: async (_admission, callback) => {
            if (!callback) throw new Error('Original callback required');
            before = callback;
            packet = await stage.bindForApply(snapshot, callback);
          },
          assertOriginal: async () => {},
          finalCapture: async (_finished, _reserve, final) => {
            if (!finalRun) return;
            if (!packet || !final) throw new Error('Original final bound inventory required');
            await finalRun({ packet, final });
          },
          closeAfterExecutorExit: async () => {},
        },
        { persist: async () => {} },
      );
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
              await run({ packet, before, stage, snapshot });
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
          const reserve = admitFinalReaderReserve({
            identity: finished.identity,
            originalStartMs: context.budget.start,
            originalDeadlineMs: context.budget.deadline,
            finalStartedMs: finished.finalStartedMs,
            finalDeadlineMs: finished.finalDeadlineMs,
            assertOriginal: context.assertInputs,
          });
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
        throw error;
      } finally {
        await stage.close();
      }
    },
    '',
    ha,
  );
}
