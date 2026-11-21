import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import { readOriginalGcpBootstrapVmSource } from './gcp-bootstrap-vm-binding';
import { readOriginalGcpCampaignAccess } from './gcp-campaign-access';
import { readOriginalGcpPreapplySiteAccess } from './gcp-preapply-bootstrap';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

export interface OriginalGcpCeCampaignKey {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-campaign-key-reference';
}
interface KeyView {
  readonly instanceId: string;
  readonly nodeName: string;
  readonly siteName: string;
  readonly siteUid: string;
  readonly publicKeySha256: string;
  readonly settingsSha256: string;
  readonly key: OriginalInputBinding;
  readonly siteAccessConfigured: true;
  readonly guestAcceptanceComplete: false;
  readonly executionAuthorized: false;
}
const origins = new WeakMap<
  OriginalGcpCeCampaignKey,
  {
    callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<KeyView>>;
    close(): void;
  }
>();
export async function readOriginalGcpCeCampaignKey(value: unknown, callback: OriginalApplyCallbackContext) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeCampaignKey) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original CE campaign key and actual callback required');
  return origin.read();
}
export function closeOriginalGcpCeCampaignKey(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeCampaignKey) : undefined;
  if (!origin) throw new Error('Original CE campaign key required');
  origin.close();
}
/** Original F5 Site admin/SLI configuration plus bootstrap/VM and immutable
 * campaign key. No GCP SSH metadata, guest account, key generation or fallback. */
export async function openOriginalGcpCeCampaignKey(input: {
  vm: unknown;
  bootstrap: unknown;
  callback: OriginalApplyCallbackContext;
  store: Pick<CeDeploymentStore, 'directory' | 'owner' | 'verify'>;
}) {
  const { vm, bootstrap, callback, store } = input;
  const context = callback.original;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  const readVm = () => readOriginalGcpBootstrapVmSource(vm, bootstrap, callback);
  await lifetime();
  const observed = await readVm();
  const site = await readOriginalGcpPreapplySiteAccess(bootstrap, context);
  const binding = context.inputs['workspace:gcp-terraform-input-identity.json'];
  if (
    !binding ||
    binding.path !== join(store.directory, 'gcp-terraform-input-identity.json') ||
    (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
      (name) => store.owner[name] !== context.owner[name],
    ) ||
    site.siteName !== observed.siteName ||
    observed.project !== store.owner.account
  )
    throw new Error('Original CE Site/key/VM scope differs');
  const readIntent = async () => {
    await store.verify();
    const original = await readOwnedInstalledInput(binding.path);
    assertSameOriginalInput(binding, original.binding);
    const saved = decodeEvidenceObject(original.bytes) as unknown as {
      intent: GcpCeIntent;
      intentFingerprint: string;
      platformContext: string;
    };
    const intent = saved.intent;
    if (
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.project !== store.owner.account ||
      intent.region !== store.owner.region ||
      intent.deploymentName !== store.owner.deploymentId ||
      intent.engine !== 'terraform' ||
      intent.operation !== 'deploy' ||
      !intent.observer ||
      !intent.initialAccess ||
      intent.initialAccess.publicKey !== site.publicKey ||
      !intent.sites.some(
        (site) =>
          site.name === observed.siteName &&
          site.nodes.some((node) => node.name === observed.nodeName && node.zone === observed.zone),
      )
    )
      throw new Error('Original CE Site SSH campaign intent differs');
    return Object.freeze({
      intentSha256: fingerprint(intent).slice(7),
      request: Object.freeze({ platformContext: intent.platformContext, sshSourceCidr: intent.observer.sshSourceCidr }),
      ceKey: intent.initialAccess.publicKey,
      observerKey: intent.observer.publicKey,
    });
  };
  const scope = await readIntent();
  const access = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
  if (
    access.publicAccess.cePublicKey !== site.publicKey ||
    access.publicAccess.cePublicKey !== scope.ceKey ||
    access.publicAccess.observerPublicKey !== scope.observerKey
  )
    throw new Error('Original Site SSH public/private campaign key differs');
  const publicHash = createHash('sha256').update(site.publicKey).digest('hex');
  const monitor = await monitorOriginalInputs({ ...access.inputs, intent: binding });
  let retired = false;
  const read = async (): Promise<Readonly<KeyView>> => {
    if (retired) throw new Error('Original CE campaign key retired');
    try {
      await lifetime();
      await monitor.assertOriginal();
      const currentVm = await readVm(),
        currentSite = await readOriginalGcpPreapplySiteAccess(bootstrap, context);
      const currentScope = await readIntent();
      const current = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
      if (
        currentVm.instanceId !== observed.instanceId ||
        currentVm.ownershipSha256 !== observed.ownershipSha256 ||
        JSON.stringify(currentSite) !== JSON.stringify(site) ||
        JSON.stringify(currentScope) !== JSON.stringify(scope) ||
        JSON.stringify(current.inputs) !== JSON.stringify(access.inputs) ||
        current.publicAccess.cePublicKey !== scope.ceKey ||
        current.publicAccess.observerPublicKey !== scope.observerKey
      )
        throw new Error('Original CE Site/key/VM source changed');
      await monitor.assertOriginal();
      await lifetime();
      return Object.freeze({
        instanceId: observed.instanceId,
        nodeName: observed.nodeName,
        siteName: site.siteName,
        siteUid: site.siteUid,
        publicKeySha256: publicHash,
        settingsSha256: site.settingsSha256,
        key: access.inputs.ce_key,
        siteAccessConfigured: true,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  try {
    await read();
  } catch (error) {
    monitor.close();
    throw error;
  }
  const reference: OriginalGcpCeCampaignKey = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-ce-campaign-key-reference',
  });
  origins.set(reference, {
    callback,
    read,
    close() {
      retired = true;
      monitor.close();
    },
  });
  return reference;
}
