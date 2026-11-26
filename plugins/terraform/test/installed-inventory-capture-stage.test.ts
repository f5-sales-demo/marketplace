/** Actual original plan, inventory, context and callback issuers; offline HTTP only. */
import { expect, test } from 'bun:test';
import { originalGcpBootstrapSource } from '../../platform/src/ce/gcp-bootstrap-evidence';
import {
  type GcpBootstrapObservationSourceBinding,
  openOriginalGcpBootstrapObservation,
} from '../../platform/src/ce/gcp-bootstrap-observation';
import { createInstalledApplyController } from '../src/installed-apply-controller';
import { type OriginalApplyGcpInventory, readOriginalApplyGcpInventory } from '../src/installed-initial-inventory';
import { openInstalledInventoryCaptureStage } from '../src/installed-inventory-capture-stage';
import { linuxMonotonicMs } from '../src/linux-clock';
import { admitFinalReaderReserve } from '../src/reader-final-reserve';
import type { ExecutionCaptureAdmission, FinalExecutionCapture } from '../src/signal-free-executor';
import { withApplyInventory } from './fixtures/original-apply-inventory.fixture';
import { authInfo, fixture } from './original-gcp-inventory-fixture';

// Native preparation verifies original inputs and all 21 inventory entries.
// Its test wrapper matches the adjacent native case; operation, startup and final
// capture deadlines remain enforced by their original production authorities.
test('inventory stage captures all originals before startup and binds only the actual callback', async () => {
  await fixture(async (context, store) => {
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
      gcpBootstrapObservation: async (_owner: unknown, _name: string, binding: GcpBootstrapObservationSourceBinding) =>
        openOriginalGcpBootstrapObservation(
          {
            ...binding,
            store,
            origin: context.environment.XCSH_API_URL,
            credential: context.environment.XCSH_API_TOKEN,
          },
          { fetcher: async () => Response.json({ error: 'absent' }, { status: 404 }) },
        ),
    };
    const worker = await openInstalledInventoryCaptureStage({ context, store, platform }, { fetcher });
    await expect(worker.readBaseline({} as never)).rejects.toThrow('Original');
    await expect(worker.readSnapshot()).rejects.toThrow('Original');
    const control = createInstalledApplyController(context, worker, { persist: async () => {} });
    await control.prepare?.(context);
    expect(worker.coverage().resources).toBe(21);
    expect(await worker.readSnapshot()).toBe(await worker.readSnapshot());
    expect(worker.coverage().executionAuthorized).toBe(false);
    const identity = {
      pid: 9101,
      group: 9101,
      start: String(linuxMonotonicMs()),
      boot: '11111111-2222-3333-4444-555555555555',
    };
    const admission = {
      identity,
      directory: context.executionDirectory,
      args: ['apply'],
      output: {} as ExecutionCaptureAdmission['output'],
      stdoutPath: '/example/stdout',
      stderrPath: '/example/stderr',
      originalStartMs: context.budget.start,
      originalDeadlineMs: context.budget.deadline,
      startupDeadlineMs: linuxMonotonicMs() + 15000,
    };
    // This fixture intentionally lacks an output issuer; the real bind must refuse.
    await expect(control.start(admission)).rejects.toThrow();
    await expect(worker.readBaseline({} as never)).rejects.toThrow('Original');
    const began = linuxMonotonicMs();
    const capture: FinalExecutionCapture = {
      identity,
      pid: identity.pid,
      invocationStartedMs: context.budget.start,
      finalStartedMs: began,
      finalDeadlineMs: began + 300000,
      finishedMs: began,
      originalDeadlineMs: context.budget.deadline,
      stdoutPath: admission.stdoutPath,
      stderrPath: admission.stderrPath,
      submitted: false,
      actualExitCode: 73,
      originalGroupClosed: true,
      signalsSent: false,
      reason: 'startup',
    };
    const reserve = admitFinalReaderReserve({
      identity,
      originalStartMs: context.budget.start,
      originalDeadlineMs: context.budget.deadline,
      finalStartedMs: began,
      finalDeadlineMs: began + 300000,
      assertOriginal: context.assertInputs,
    });
    await expect(control.finalCapture(capture, reserve)).rejects.toThrow('inventory');
    await worker.closeAfterExecutorExit();
  });
}, 60000);

test('coordinated inventory binds a real original actor and hands its same baseline to reserved final capture', async () => {
  let original: OriginalApplyGcpInventory | undefined;
  await withApplyInventory(
    async ({ packet, before }) => {
      original = packet;
      const view = await readOriginalApplyGcpInventory(packet);
      expect(view.resources).toHaveLength(21);
      expect(view.executor).toEqual(before.execution.identity);
      expect(view.executionAuthorized).toBe(false);
      await expect(readOriginalApplyGcpInventory({ ...packet })).rejects.toThrow('Original');
    },
    true,
    async ({ packet, final }) => {
      if (!original) throw new Error('Original before inventory source required');
      expect(packet).toBe(original);
      const view = await readOriginalApplyGcpInventory(packet, final);
      expect(view.resources).toHaveLength(21);
      expect(view.executor).toEqual(final.execution.identity);
    },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    true,
  );
}, 60000);
