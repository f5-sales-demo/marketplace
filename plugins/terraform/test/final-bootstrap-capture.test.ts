/** Actual original callback, reader and Platform issuers; cloud responses are offline. */
import { expect, test } from 'bun:test';
import { formatGcpUserData } from '../../gcloud/src/ce/bootstrap';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import type { OriginalGcpPlatformHttpBody } from '../../platform/src/ce/gcp-http-capture';
import {
  handoffOriginalEarlyGcpBootstrapVm,
  joinOriginalEarlyGcpBootstrapVm,
  readOriginalEarlyGcpBootstrapVm,
  readOriginalFinalGcpBootstrapVm,
} from '../src/gcp-bootstrap-vm-binding';
import * as bootstrapSource from '../src/gcp-preapply-bootstrap';
import { collectOriginalEarlyGcpVmEvidence, handoffOriginalEarlyGcpVmEvidence } from '../src/gcp-vm-evidence';
import { isOriginalApplyLifetimeExpiry } from '../src/installed-apply-controller';
import { linuxMonotonicMs } from '../src/linux-clock';
import { joinOriginalFinalXcshCreationBody } from '../src/xcsh-creation-body';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { openOriginalBootstrapFixture } from './fixtures/original-bootstrap-source.fixture';

for (const mode of [
  'fresh',
  'expired-operation',
  'changed-token',
  'copied-callback',
  'changed-site-body',
  'expired-before-read',
] as const)
  test(`final bootstrap requires fresh original GET bodies and after authority: ${mode}`, async () => {
    let jwt = '';
    let source: Awaited<ReturnType<typeof openOriginalBootstrapFixture>> | undefined;
    let early: Awaited<ReturnType<typeof joinOriginalEarlyGcpBootstrapVm>> | undefined;
    let vm: Awaited<ReturnType<typeof collectOriginalEarlyGcpVmEvidence>>;
    let oldBody: OriginalGcpPlatformHttpBody | undefined;
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
          const originalInput = source.finalSiteInput(input.callback);
          oldBody = await originalInput.observation.read(originalInput.target);
          vm = await collectOriginalEarlyGcpVmEvidence(input);
          if (!vm) throw new Error('Original early VM required');
          early = await joinOriginalEarlyGcpBootstrapVm({
            context: input.callback.original,
            callback: input.callback,
            bootstrap: source.value,
            identity: input.identity,
            vm,
          });
          if (mode === 'expired-operation' || mode === 'expired-before-read')
            await Bun.sleep(Math.max(1, input.callback.original.budget.deadline - linuxMonotonicMs() + 5));
          if (mode === 'expired-before-read') {
            let failure: unknown;
            try {
              await readOriginalEarlyGcpBootstrapVm(early, input.callback);
            } catch (error) {
              failure = error;
            }
            expect(isOriginalApplyLifetimeExpiry(failure, input.callback)).toBe(true);
            const forged = new Error('Original apply operation budget exhausted');
            forged.name = 'OriginalApplyOperationExpiredError';
            expect(isOriginalApplyLifetimeExpiry(forged, input.callback)).toBe(false);
            expect(isOriginalApplyLifetimeExpiry(failure, { ...input.callback })).toBe(false);
            await expect(readOriginalEarlyGcpBootstrapVm(early, input.callback)).rejects.toThrow('refused');
          }
        },
        async (input) => {
          if (!source || !vm || !early) throw new Error('Original bootstrap sources required');
          if (mode === 'expired-operation' || mode === 'expired-before-read')
            expect(linuxMonotonicMs()).toBeGreaterThanOrEqual(input.callback.original.budget.deadline);
          const beforeReads = source.readCount();
          if (mode === 'copied-callback') {
            await expect(source.refreshFinal({ ...input.callback })).rejects.toThrow('Original');
            expect(source.readCount()).toBe(beforeReads);
          }
          if (mode === 'changed-token') source.token.spec.content = jwt.replace(/.$/, jwt.endsWith('A') ? 'B' : 'A');
          if (mode === 'changed-site-body') Object.assign(source.site, { status: { state: 'ONLINE' } });
          if (mode === 'fresh') {
            const request = source.finalSiteInput(input.callback);
            await expect(
              joinOriginalFinalXcshCreationBody({ ...request, result: { ...request.result } }),
            ).rejects.toThrow('original');
            await expect(
              joinOriginalFinalXcshCreationBody({
                ...request,
                result: {
                  ...request.result,
                  executor: { ...request.result.executor, pid: request.result.executor.pid + 1 },
                },
              }),
            ).rejects.toThrow('Original');
            await Bun.sleep(5);
            await expect(
              joinOriginalFinalXcshCreationBody({
                ...request,
                observation: { ...request.observation, read: async () => oldBody },
              }),
            ).rejects.toThrow('fresh final');
            expect(source.readCount()).toBe(beforeReads);
          }
          const finalBootstrap = await source.refreshFinal(input.callback);
          expect(source.readCount()).toBe(beforeReads + 2);
          expect(finalBootstrap.siteCreationSha256).toBe(source.value.siteCreationSha256);
          expect(finalBootstrap.tokenCreationSha256).toBe(source.value.tokenCreationSha256);
          await bootstrapSource.assertOriginalGcpPreapplyBootstrapCallback(finalBootstrap, input.callback);
          await expect(
            bootstrapSource.assertOriginalGcpPreapplyBootstrapCallback(source.value, input.callback),
          ).rejects.toThrow('Original');
          const finalVm = await handoffOriginalEarlyGcpVmEvidence(vm, {
            callback: input.callback,
            reader: input.reader,
          });
          const request = { callback: input.callback, vm: finalVm, bootstrap: finalBootstrap };
          if (mode === 'changed-token') {
            await expect(handoffOriginalEarlyGcpBootstrapVm(early, request)).rejects.toThrow('bootstrap');
            source.token.spec.content = jwt;
            await expect(handoffOriginalEarlyGcpBootstrapVm(early, request)).rejects.toThrow('refused');
            return;
          }
          const final = await handoffOriginalEarlyGcpBootstrapVm(early, request);
          const view = await readOriginalFinalGcpBootstrapVm(final, input.callback);
          expect(view.instanceId).toBe(String(input.state.vm.id));
          expect(view.jwtSha256).toBe(finalBootstrap.bootstrap.jwtSha256);
          expect(view.executionAuthorized).toBe(false);
          expect(view.originalBeforeReadExpired).toBe(mode === 'expired-before-read');
        },
        mode === 'expired-operation' || mode === 'expired-before-read' ? 'deadline' : undefined,
        true,
        {
          sourceCaptureInputs: true,
          operationRemainingMs: mode === 'expired-operation' || mode === 'expired-before-read' ? 20000 : 7200000,
          completeTraceBeforeExit: mode === 'expired-operation' || mode === 'expired-before-read',
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
            if (!data) throw new Error('Original token metadata required');
            data.value = formatGcpUserData({
              deploymentName: context.owner.deploymentId,
              siteName: saved.intent.sites[0].name,
              nodeName: String(state.request.name),
              jwt,
              expiresAt: new Date(exp * 1000).toISOString(),
            });
          },
        },
      );
      outcome = 'success';
    } finally {
      await source?.close();
      if (source) {
        const retained = await source.retain(`final-bootstrap-${mode}`, outcome);
        expect(retained.files).toBeGreaterThan(0);
        expect(retained.guestAcceptanceComplete).toBe(false);
      }
    }
  }, 60000);
