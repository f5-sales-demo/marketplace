/** Genuine plan/controller/bootstrap/VM issuers; SDK and cloud replies remain offline. */
import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatGcpUserData } from '../../gcloud/src/ce/bootstrap';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import * as bindingSource from '../src/gcp-bootstrap-vm-binding';
import { assertOriginalGcpPreapplyBootstrapCallback } from '../src/gcp-preapply-bootstrap';
import {
  assertOriginalGcpVmCaptureCallback,
  collectOriginalEarlyGcpVmEvidence,
  handoffOriginalEarlyGcpVmEvidence,
} from '../src/gcp-vm-evidence';
import { linuxMonotonicMs } from '../src/linux-clock';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { openOriginalBootstrapFixture } from './fixtures/original-bootstrap-source.fixture';

type Request = Parameters<typeof bindingSource.joinOriginalFinalGcpBootstrapVm>[0];
type State = Parameters<NonNullable<Parameters<typeof withEarlyVmFixture>[1]>>[0]['state'];
type Mode = 'normal' | 'deadline' | 'changed-token' | 'network' | 'userdata';
async function withFinalSources(
  run: (request: Request, state: State, jwt: string) => Promise<void>,
  mode: Mode = 'normal',
) {
  let jwt = '';
  let source: Awaited<ReturnType<typeof openOriginalBootstrapFixture>> | undefined;
  let identity: Request['identity'] | undefined;
  let vm: Awaited<ReturnType<typeof collectOriginalEarlyGcpVmEvidence>> | undefined;
  let outcome: 'success' | 'failure' = 'failure';
  try {
    await withEarlyVmFixture(
      async (input) => {
        const saved = (await input.store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        source = await openOriginalBootstrapFixture(
          input.callback.original,
          input.callback.execution,
          input.store,
          saved.intent.sites[0].name,
          input.identity.nodeName,
          jwt,
        );
        identity = input.identity;
        vm = await collectOriginalEarlyGcpVmEvidence(input);
        // Deliberately do not mint an early bootstrap VM capability.
        if (mode === 'deadline')
          await Bun.sleep(Math.max(1, input.callback.original.budget.deadline - linuxMonotonicMs() + 5));
      },
      async (input) => {
        if (!source || !vm || !identity) throw new Error('Original final fixture sources required');
        if (mode === 'changed-token') source.token.spec.content = jwt.replace(/.$/, jwt.endsWith('A') ? 'B' : 'A');
        const bootstrap = await source.refreshFinal(input.callback);
        const finalVm = await handoffOriginalEarlyGcpVmEvidence(vm, { callback: input.callback, reader: input.reader });
        await assertOriginalGcpVmCaptureCallback(finalVm, input.callback);
        await assertOriginalGcpPreapplyBootstrapCallback(bootstrap, input.callback);
        if (mode === 'deadline')
          expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(input.callback.original.budget.deadline);
        await run(
          { context: input.callback.original, callback: input.callback, identity, bootstrap, vm: finalVm },
          input.state,
          jwt,
        );
      },
      mode === 'deadline' ? 'deadline' : undefined,
      true,
      {
        sourceCaptureInputs: true,
        operationRemainingMs: mode === 'deadline' ? 20000 : 7200000,
        completeTraceBeforeExit: mode === 'deadline',
        prepare: async (context, store, state) => {
          const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
          const exp = Math.floor(Date.now() / 1000) + 3600;
          jwt = [
            Buffer.from('{}').toString('base64url'),
            Buffer.from(JSON.stringify({ exp })).toString('base64url'),
            Buffer.from('synthetic-signature').toString('base64url'),
          ].join('.');
          const data = (state.request.metadata as { items: Array<{ key: string; value: string }> }).items.find(
            (row) => row.key === 'user-data',
          );
          if (!data) throw new Error('Original token-only metadata required');
          data.value = formatGcpUserData({
            deploymentName: context.owner.deploymentId,
            siteName: saved.intent.sites[0].name,
            nodeName: String(state.request.name),
            jwt,
            expiresAt: new Date(exp * 1000).toISOString(),
          });
          if (mode === 'userdata') data.value += 'runcmd:\n  - echo unsupported-extra-command\n';
          if (mode === 'network') {
            const network = `projects/${context.owner.account}/global/networks/foreign-network`;
            (state.request.networkInterfaces as Record<string, unknown>[])[0].network = network;
            (state.vm.networkInterfaces as Record<string, unknown>[])[0].network = network;
          }
        },
      },
    );
    outcome = 'success';
  } finally {
    await source?.close();
    if (source) await source.retain(`final-first-bootstrap-${mode}`, outcome);
  }
}

test('final guest bootstrap first binds the original VM without a successful before bootstrap binding', async () => {
  await withFinalSources(async (request, state, jwt) => {
    const final = await bindingSource.joinOriginalFinalGcpBootstrapVm(request);
    const view = await bindingSource.readOriginalFinalGcpBootstrapVm(final, request.callback);
    expect(final.schemaVersion).toBe(2);
    expect(view.instanceId).toBe(String(state.vm.id));
    expect(view.nodeName).toBe(request.identity.nodeName);
    expect(view.interfaces).toHaveLength(2);
    expect(view.jwtSha256).toBe(request.bootstrap.bootstrap.jwtSha256);
    expect(view.initialPhase).toBe('after');
    expect(view.originalEarlyBootstrapJoined).toBe(false);
    expect(view.finalDeadlineMs - view.finalStartedMs).toBe(300000);
    expect(view.executionAuthorized).toBe(false);
    expect(view.guestAcceptanceComplete).toBe(false);
    expect(JSON.stringify(view)).not.toContain(jwt);
  });
}, 60000);

test('copied final input packets refuse without consuming the genuine VM first-join claim', async () => {
  await withFinalSources(async (request) => {
    for (const change of [
      { callback: { ...request.callback } },
      { bootstrap: { ...request.bootstrap } },
      { identity: { ...request.identity } },
      { vm: { ...request.vm } },
    ])
      await expect(bindingSource.joinOriginalFinalGcpBootstrapVm({ ...request, ...change })).rejects.toThrow(
        'Original',
      );
    const final = await bindingSource.joinOriginalFinalGcpBootstrapVm(request);
    const view = await bindingSource.readOriginalFinalGcpBootstrapVm(final, request.callback);
    expect(view.initialPhase).toBe('after');
    await expect(bindingSource.readOriginalFinalGcpBootstrapVm({ ...final }, request.callback)).rejects.toThrow(
      'Original',
    );
    await expect(bindingSource.readOriginalFinalGcpBootstrapVm(final, { ...request.callback })).rejects.toThrow(
      'Original',
    );
  });
}, 60000);

test('concurrent first final joins permit only one original capability and never replay', async () => {
  await withFinalSources(async (request) => {
    const results = await Promise.allSettled([
      bindingSource.joinOriginalFinalGcpBootstrapVm(request),
      bindingSource.joinOriginalFinalGcpBootstrapVm(request),
    ]);
    await writeFile(
      join(request.context.executionDirectory, 'final-first-concurrent-outcomes.private.json'),
      JSON.stringify(
        results.map((row) =>
          row.status === 'fulfilled'
            ? { status: row.status }
            : {
                status: row.status,
                errorType: row.reason?.name,
                message: row.reason?.message,
                stack: row.reason?.stack,
              },
        ),
      ),
      { mode: 0o600 },
    );
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
    await expect(bindingSource.joinOriginalFinalGcpBootstrapVm(request)).rejects.toThrow('claimed');
  });
}, 60000);

test('a first final binding uses the original final reserve after the operation deadline', async () => {
  await withFinalSources(async (request) => {
    const final = await bindingSource.joinOriginalFinalGcpBootstrapVm(request);
    const view = await bindingSource.readOriginalFinalGcpBootstrapVm(final, request.callback);
    expect(view.finalDeadlineMs - view.finalStartedMs).toBe(300000);
    expect(view.initialPhase).toBe('after');
    expect(view.executionAuthorized).toBe(false);
  }, 'deadline');
}, 60000);

for (const mode of ['changed-token', 'network', 'userdata'] as const)
  test(`first final bootstrap rejects actual original ${mode} mismatch`, async () => {
    await withFinalSources(async (request) => {
      await expect(bindingSource.joinOriginalFinalGcpBootstrapVm(request)).rejects.toThrow(
        mode === 'network' ? 'NIC' : 'token',
      );
    }, mode);
  }, 60000);

test('late ownership replacement remains refused after restoring the old VM fields', async () => {
  await withFinalSources(async (request, state) => {
    const final = await bindingSource.joinOriginalFinalGcpBootstrapVm(request);
    const id = state.vm.id;
    state.vm.id = '18446744073709551610';
    await expect(bindingSource.readOriginalFinalGcpBootstrapVm(final, request.callback)).rejects.toThrow();
    state.vm.id = id;
    await expect(bindingSource.readOriginalFinalGcpBootstrapVm(final, request.callback)).rejects.toThrow('refused');
  });
}, 60000);
