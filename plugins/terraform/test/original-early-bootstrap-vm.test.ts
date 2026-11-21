/** Actual plan/callback/output/bootstrap/VM issuers; SDK and cloud replies are offline. */
import { expect, test } from 'bun:test';
import { formatGcpUserData } from '../../gcloud/src/ce/bootstrap';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import {
  handoffOriginalEarlyGcpBootstrapVm,
  joinOriginalEarlyGcpBootstrapVm,
  readOriginalEarlyGcpBootstrapVm,
  readOriginalFinalGcpBootstrapVm,
} from '../src/gcp-bootstrap-vm-binding';
import { collectOriginalEarlyGcpVmEvidence, handoffOriginalEarlyGcpVmEvidence } from '../src/gcp-vm-evidence';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { openOriginalBootstrapFixture } from './fixtures/original-bootstrap-source.fixture';

async function joined(mode = 'ok') {
  let jwt = '',
    expiry = '';
  await withEarlyVmFixture(
    async (input) => {
      const saved = (await input.store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
      const site = saved.intent.sites[0];
      const bootstrap = await openOriginalBootstrapFixture(
        input.callback.original,
        input.callback.execution,
        input.store,
        site.name,
        input.identity.nodeName,
        jwt,
      );
      try {
        const vm = await collectOriginalEarlyGcpVmEvidence(input);
        if (!vm) throw new Error('Original VM fixture required');
        const request = {
          context: input.callback.original,
          callback: input.callback,
          identity: input.identity,
          bootstrap: bootstrap.value,
          vm,
        };
        if (mode !== 'ok') {
          const error =
            mode === 'token' ? 'token' : mode === 'site' ? 'site' : mode === 'network' ? 'NIC' : 'token-only';
          await expect(joinOriginalEarlyGcpBootstrapVm(request)).rejects.toThrow(error);
          return;
        }
        const original = await joinOriginalEarlyGcpBootstrapVm(request);
        const view = await readOriginalEarlyGcpBootstrapVm(original, input.callback);
        expect(view.nodeName).toBe(input.identity.nodeName);
        expect(view.siteName).toBe(site.name);
        expect(view.instanceId).toBe(String(input.state.vm.id));
        expect(view.interfaces).toHaveLength(2);
        expect(view.expiresAt).toBe(expiry);
        expect(view.executionAuthorized).toBe(false);
        expect(JSON.stringify(view)).not.toContain(jwt);
        await expect(readOriginalEarlyGcpBootstrapVm({ ...original }, input.callback)).rejects.toThrow('Original');
        await expect(
          joinOriginalEarlyGcpBootstrapVm({
            ...request,
            callback: { ...input.callback, original: input.callback.original },
          }),
        ).rejects.toThrow('Original');
        await expect(
          joinOriginalEarlyGcpBootstrapVm({ ...request, bootstrap: { ...bootstrap.value } }),
        ).rejects.toThrow('Original');
        await expect(joinOriginalEarlyGcpBootstrapVm({ ...request, identity: { ...input.identity } })).rejects.toThrow(
          'Original',
        );
        await expect(joinOriginalEarlyGcpBootstrapVm({ ...request, vm: { ...vm } })).rejects.toThrow('Original');
        const originalId = input.state.vm.id;
        input.state.vm.id = '18446744073709551610';
        await expect(readOriginalEarlyGcpBootstrapVm(original, input.callback)).rejects.toThrow();
        input.state.vm.id = originalId;
        await expect(readOriginalEarlyGcpBootstrapVm(original, input.callback)).rejects.toThrow('refused');
      } finally {
        await bootstrap.close();
      }
    },
    undefined,
    undefined,
    true,
    {
      sourceCaptureInputs: true,
      prepare: async (context, store, state) => {
        const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        expiry = new Date(exp * 1000).toISOString();
        jwt = [
          Buffer.from('{}').toString('base64url'),
          Buffer.from(JSON.stringify({ exp })).toString('base64url'),
          Buffer.from('synthetic-signature').toString('base64url'),
        ].join('.');
        const material = mode === 'token' ? jwt.replace(/^[^.]+/, 'ZXhhbXBsZQ') : jwt;
        const items = (state.request.metadata as { items: Array<{ key: string; value: string }> }).items;
        const data = items.find((item) => item.key === 'user-data');
        if (!data) throw new Error('Original user-data fixture required');
        data.value = formatGcpUserData({
          deploymentName: context.owner.deploymentId,
          siteName: saved.intent.sites[0].name,
          nodeName: String(state.request.name),
          jwt: material,
          expiresAt: expiry,
        });
        if (mode === 'site') (state.request.labels as Record<string, string>)['xcsh-site'] = 'foreign-site';
        if (mode === 'cloud-init') data.value += 'runcmd:\n  - echo unsupported-extra-command\n';
        if (mode === 'network') {
          const network = `projects/${context.owner.account}/global/networks/foreign-network`;
          (state.request.networkInterfaces as Record<string, unknown>[])[0].network = network;
          (state.vm.networkInterfaces as Record<string, unknown>[])[0].network = network;
        }
      },
    },
  );
}
test('early guest binding joins original bootstrap token, VM and reviewed NICs before apply completion', async () => {
  await joined();
}, 60000);
for (const mode of ['token', 'site', 'network', 'cloud-init'])
  test(`early guest binding rejects original VM ${mode} mismatch`, async () => {
    await joined(mode);
  }, 60000);

test('original bootstrap binding hands off once to the actual final VM and callback without replay', async () => {
  let jwt = '';
  let early: Awaited<ReturnType<typeof joinOriginalEarlyGcpBootstrapVm>> | undefined;
  let vm: Awaited<ReturnType<typeof collectOriginalEarlyGcpVmEvidence>>;
  let view: Awaited<ReturnType<typeof readOriginalEarlyGcpBootstrapVm>> | undefined;
  let close: (() => Promise<void>) | undefined;
  try {
    await withEarlyVmFixture(
      async (input) => {
        const saved = (await input.store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        const bootstrap = await openOriginalBootstrapFixture(
          input.callback.original,
          input.callback.execution,
          input.store,
          saved.intent.sites[0].name,
          input.identity.nodeName,
          jwt,
        );
        close = bootstrap.close;
        vm = await collectOriginalEarlyGcpVmEvidence(input);
        if (!vm) throw new Error('Original early VM required');
        early = await joinOriginalEarlyGcpBootstrapVm({
          context: input.callback.original,
          callback: input.callback,
          identity: input.identity,
          bootstrap: bootstrap.value,
          vm,
        });
        view = await readOriginalEarlyGcpBootstrapVm(early, input.callback);
      },
      async (input) => {
        if (!early || !vm || !view) throw new Error('Original early binding required');
        const finalVm = await handoffOriginalEarlyGcpVmEvidence(vm, { callback: input.callback, reader: input.reader });
        await expect(
          handoffOriginalEarlyGcpBootstrapVm(early, {
            callback: { ...input.callback, original: input.callback.original },
            vm: finalVm,
          }),
        ).rejects.toThrow('Original');
        const handoffs = await Promise.allSettled([
          handoffOriginalEarlyGcpBootstrapVm(early, { callback: input.callback, vm: finalVm }),
          handoffOriginalEarlyGcpBootstrapVm(early, { callback: input.callback, vm: finalVm }),
        ]);
        expect(handoffs.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(handoffs.filter((result) => result.status === 'rejected')).toHaveLength(1);
        const success = handoffs.find((result) => result.status === 'fulfilled');
        if (success?.status !== 'fulfilled') throw new Error('One original handoff must succeed');
        const final = success.value;
        const observed = await readOriginalFinalGcpBootstrapVm(final, input.callback);
        expect(observed.instanceId).toBe(view.instanceId);
        expect(observed.ownershipSha256).toBe(view.ownershipSha256);
        expect(observed.kind).toBe('original-final-gcp-vm-cloud-candidate');
        expect(observed.finalDeadlineMs - observed.finalStartedMs).toBe(300000);
        expect(observed.executionAuthorized).toBe(false);
        await expect(
          handoffOriginalEarlyGcpBootstrapVm(early, { callback: input.callback, vm: finalVm }),
        ).rejects.toThrow('claimed');
        await expect(readOriginalEarlyGcpBootstrapVm(early, input.callback)).rejects.toThrow('Original');
        await expect(readOriginalFinalGcpBootstrapVm({ ...final }, input.callback)).rejects.toThrow('Original');
        await expect(
          readOriginalFinalGcpBootstrapVm(final, { ...input.callback, original: input.callback.original }),
        ).rejects.toThrow('Original');
        const id = input.state.vm.id;
        input.state.vm.id = '18446744073709551610';
        await expect(readOriginalFinalGcpBootstrapVm(final, input.callback)).rejects.toThrow();
        input.state.vm.id = id;
        await expect(readOriginalFinalGcpBootstrapVm(final, input.callback)).rejects.toThrow('refused');
      },
      undefined,
      true,
      {
        sourceCaptureInputs: true,
        prepare: async (context, store, state) => {
          const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
          const exp = Math.floor(Date.now() / 1000) + 3600;
          jwt = [
            Buffer.from('{}').toString('base64url'),
            Buffer.from(JSON.stringify({ exp })).toString('base64url'),
            Buffer.from('synthetic-signature').toString('base64url'),
          ].join('.');
          const data = (state.request.metadata as { items: Array<{ key: string; value: string }> }).items.find(
            (entry) => entry.key === 'user-data',
          );
          if (!data) throw new Error('Original bootstrap metadata required');
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
  } finally {
    await close?.();
  }
}, 120000);
