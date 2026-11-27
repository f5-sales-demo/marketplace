/** Original SDK/body/VM/bootstrap issuers, real campaign keys and offline cloud responses. */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { formatGcpUserData } from '../../gcloud/src/ce/bootstrap';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { gcpSiteAccessSpec } from '../../gcloud/src/ce/site-access';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import { joinOriginalEarlyGcpBootstrapVm, readOriginalGcpBootstrapVmSource } from '../src/gcp-bootstrap-vm-binding';
import { bindOriginalGcpCampaignAccess, prepareOriginalGcpCampaignAccess } from '../src/gcp-campaign-access';
import {
  closeOriginalGcpCeCampaignKey,
  openOriginalGcpCeCampaignKey,
  readOriginalGcpCeCampaignKey,
} from '../src/gcp-ce-campaign-key';
import { collectOriginalEarlyGcpSerialEvidence, collectOriginalEarlyGcpVmEvidence } from '../src/gcp-vm-evidence';
import { openInstalledGcpCeAccess } from '../src/installed-ce-access';
import { withEarlyVmFixture } from './fixtures/early-gcp-vm.fixture';
import { openOriginalBootstrapFixture } from './fixtures/original-bootstrap-source.fixture';

async function campaign(mode = 'ok') {
  let jwt = '';
  await withEarlyVmFixture(
    async (input) => {
      const saved = (await input.store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
      const intent = saved.intent;
      const siteSpec = structuredClone(gcpSiteAccessSpec(intent, '15.17.6'));
      if (!siteSpec || !intent.observer || !intent.initialAccess)
        throw new Error('Original reviewed Site SSH required');
      if (mode === 'foreign-key') siteSpec.admin_user_credentials.ssh_key = intent.observer.publicKey;
      if (mode === 'ssh-network') siteSpec.blocked_services.blocked_service = [];
      const bootstrap = await openOriginalBootstrapFixture(
        input.callback.original,
        input.callback.execution,
        input.store,
        intent.sites[0].name,
        input.identity.nodeName,
        jwt,
        mode === 'missing' ? {} : siteSpec,
      );
      try {
        const vm = await collectOriginalEarlyGcpVmEvidence(input);
        if (!vm) throw new Error('Original VM required');
        const bound = await joinOriginalEarlyGcpBootstrapVm({
          context: input.callback.original,
          callback: input.callback,
          identity: input.identity,
          bootstrap: bootstrap.value,
          vm,
        });
        const request = { vm: bound, bootstrap: bootstrap.value, callback: input.callback, store: input.store };
        if (mode !== 'ok') {
          await expect(openOriginalGcpCeCampaignKey(request)).rejects.toThrow('Site SSH');
          return;
        }
        const key = await openOriginalGcpCeCampaignKey(request);
        try {
          await expect(
            readOriginalGcpBootstrapVmSource(bound, bootstrap.value, input.callback, { ...vm }),
          ).rejects.toThrow('Original');
          expect((await readOriginalGcpBootstrapVmSource(bound, bootstrap.value, input.callback, vm)).instanceId).toBe(
            String(input.state.vm.id),
          );
          const view = await readOriginalGcpCeCampaignKey(key, input.callback);
          expect(view.instanceId).toBe(String(input.state.vm.id));
          expect(view.nodeName).toBe(input.identity.nodeName);
          expect(view.siteName).toBe(intent.sites[0].name);
          expect(view.publicKeySha256).toBe(createHash('sha256').update(intent.initialAccess.publicKey).digest('hex'));
          expect(view.siteAccessConfigured).toBe(true);
          expect(view.guestAcceptanceComplete).toBe(false);
          expect(JSON.stringify(view)).not.toContain(jwt);
          await expect(readOriginalGcpCeCampaignKey({ ...key }, input.callback)).rejects.toThrow('Original');
          await expect(readOriginalGcpCeCampaignKey(key, { ...input.callback })).rejects.toThrow('Original');
          await expect(openOriginalGcpCeCampaignKey({ ...request, vm: { ...bound } })).rejects.toThrow('Original');
          await expect(openOriginalGcpCeCampaignKey({ ...request, bootstrap: { ...bootstrap.value } })).rejects.toThrow(
            'Original',
          );
          const serial = await collectOriginalEarlyGcpSerialEvidence(vm, '0');
          const accessInput = {
            vm,
            bootstrapVm: bound,
            bootstrap: bootstrap.value,
            serial,
            callback: input.callback,
            store: input.store,
          };
          for (const changed of [
            { vm: { ...vm } },
            { bootstrapVm: { ...bound } },
            { serial: { ...serial } },
            { callback: { ...input.callback } },
          ])
            await expect(openInstalledGcpCeAccess({ ...accessInput, ...changed })).rejects.toThrow('Original');
          const unopened = await openInstalledGcpCeAccess(accessInput);
          const closed = unopened.close();
          expect(unopened.close()).toBe(closed);
          await closed;
          expect(unopened.coverage().closed).toBe(true);
          await expect(unopened.initialize({})).rejects.toThrow('retired');
          const access = await openInstalledGcpCeAccess(accessInput);
          await expect(
            access.initialize({
              schemaVersion: 1,
              kind: 'original-gcp-observer-client-abi-reference',
              guestClientQualified: true,
            }),
          ).rejects.toThrow('Original');
          expect(access.coverage().initialized).toBe(false);
          expect(access.coverage().failed).toBe(true);
          await expect(access.initialize({})).rejects.toThrow('claimed');
          await access.close();
          expect(access.coverage().failed).toBe(true);
          expect(access.coverage().guestAcceptanceComplete).toBe(false);
          const path = view.key.path;
          const bytes = await readFile(path);
          await rename(path, `${path}.original`);
          await writeFile(path, bytes, { mode: 0o400 });
          await expect(readOriginalGcpCeCampaignKey(key, input.callback)).rejects.toThrow();
          await rm(path);
          await rename(`${path}.original`, path);
          await expect(readOriginalGcpCeCampaignKey(key, input.callback)).rejects.toThrow('retired');
        } finally {
          closeOriginalGcpCeCampaignKey(key);
        }
      } finally {
        await bootstrap.close();
      }
    },
    undefined,
    undefined,
    true,
    {
      sourceCaptureInputs: true,
      prepareIntent: async (intent, store) => {
        if (!intent.observer || !intent.initialAccess) throw new Error('Original campaign scope required');
        const request = { platformContext: intent.platformContext, sshSourceCidr: intent.observer.sshSourceCidr };
        const access = await prepareOriginalGcpCampaignAccess(store, request);
        intent.initialAccess.publicKey = access.cePublicKey;
        intent.observer.publicKey = access.observerPublicKey;
        await bindOriginalGcpCampaignAccess(store, {
          ...request,
          ...access,
          intentSha256: fingerprint(intent).slice(7),
        });
      },
      prepare: async (context, store, state) => {
        const saved = (await store.read('gcp-terraform-input-identity.json')) as { intent: GcpCeIntent };
        const exp = Math.floor(Date.now() / 1000) + 3600;
        jwt = [
          Buffer.from('{}').toString('base64url'),
          Buffer.from(JSON.stringify({ exp })).toString('base64url'),
          Buffer.from('synthetic').toString('base64url'),
        ].join('.');
        const items = (state.request.metadata as { items: { key: string; value: string }[] }).items;
        const data = items.find((entry) => entry.key === 'user-data');
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
}
// The source fixture performs repeated bounded original readers and retains
// their separate final capture. This is a framework allowance, never a change
// to the original operation, source startup/command or final-reserve budgets.
const completeCeSourceFixtureTimeout = 60000 + 4 * 60000 + 300000;
for (const mode of ['ok', 'foreign-key', 'ssh-network', 'missing'])
  test(
    `CE campaign key joins original Site/VM sources: ${mode}`,
    async () => {
      await campaign(mode);
    },
    completeCeSourceFixtureTimeout,
  );
