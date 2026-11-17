import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import { readOriginalGcpCampaignAccess } from './gcp-campaign-access';
import { assertOriginalGcpObserverVmCaptureCallback } from './gcp-observer-insert-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

type Store = Pick<CeDeploymentStore, 'directory' | 'owner' | 'verify'>;
type Json = Record<string, unknown>;
export interface OriginalGcpObserverCampaignKey {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-campaign-key-reference';
}
interface KeyView {
  readonly instanceId: string;
  readonly publicKeySha256: string;
  readonly key: OriginalInputBinding;
}
const origins = new WeakMap<
  OriginalGcpObserverCampaignKey,
  { readonly callback: OriginalApplyCallbackContext; read(): Promise<Readonly<KeyView>>; close(): void }
>();
export async function readOriginalGcpObserverCampaignKey(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverCampaignKey) : undefined;
  if (!origin) throw new Error('Original observer campaign key required');
  return origin.read();
}
export function closeOriginalGcpObserverCampaignKey(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverCampaignKey) : undefined;
  if (!origin) throw new Error('Original observer campaign key required');
  origin.close();
}
export async function assertOriginalGcpObserverCampaignKeyContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverCampaignKey) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original campaign key and actual callback required');
  return origin.read();
}
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Original campaign intent object required');
  return value as Json;
};
/** Read the existing campaign only. Neither a caller key path nor a new key
 * generation can replace the original reviewed metadata/intent binding. */
export async function openOriginalGcpObserverCampaignKey(
  vm: unknown,
  callback: OriginalApplyCallbackContext,
  store: Store,
) {
  const originalVm = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
  const binding = callback.original.inputs['workspace:gcp-terraform-input-identity.json'];
  if (
    !binding ||
    binding.path !== join(store.directory, 'gcp-terraform-input-identity.json') ||
    (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
      (name) => store.owner[name] !== callback.original.owner[name],
    )
  )
    throw new Error('Original campaign store and actual callback ownership required');
  const readIntent = async () => {
    await store.verify();
    const input = await readOwnedInstalledInput(binding.path);
    assertSameOriginalInput(binding, input.binding);
    const saved = decodeEvidenceObject(input.bytes),
      intent = object(saved.intent),
      observer = object(intent.observer),
      access = object(intent.initialAccess);
    if (
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext ||
      intent.project !== store.owner.account ||
      intent.region !== store.owner.region ||
      intent.deploymentName !== store.owner.deploymentId ||
      intent.engine !== 'terraform' ||
      typeof intent.platformContext !== 'string' ||
      typeof observer.sshSourceCidr !== 'string' ||
      typeof observer.publicKey !== 'string' ||
      typeof access.publicKey !== 'string'
    )
      throw new Error('Original reviewed campaign intent differs');
    return {
      intentSha256: fingerprint(intent).slice(7),
      request: { platformContext: intent.platformContext, sshSourceCidr: observer.sshSourceCidr },
      observerKey: observer.publicKey,
      ceKey: access.publicKey,
    };
  };
  const scope = await readIntent();
  const access = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
  const publicHash = createHash('sha256').update(access.publicAccess.observerPublicKey).digest('hex');
  if (
    access.publicAccess.observerPublicKey !== scope.observerKey ||
    access.publicAccess.cePublicKey !== scope.ceKey ||
    publicHash !== originalVm.publicKeySha256
  )
    throw new Error('Original campaign key and observer VM metadata differ');
  const monitor = await monitorOriginalInputs({ ...access.inputs, intent: binding });
  let retired = false;
  const read = async (): Promise<Readonly<KeyView>> => {
    if (retired) throw new Error('Original observer campaign key retired');
    try {
      await monitor.assertOriginal();
      const currentVm = await assertOriginalGcpObserverVmCaptureCallback(vm, callback),
        currentScope = await readIntent();
      if (
        JSON.stringify(currentScope) !== JSON.stringify(scope) ||
        currentVm.instanceId !== originalVm.instanceId ||
        currentVm.publicKeySha256 !== publicHash
      )
        throw new Error('Original campaign VM or intent binding changed');
      const current = await readOriginalGcpCampaignAccess(store, scope.request, scope.intentSha256);
      if (
        JSON.stringify(current.inputs) !== JSON.stringify(access.inputs) ||
        current.publicAccess.observerPublicKey !== scope.observerKey ||
        current.publicAccess.cePublicKey !== scope.ceKey
      )
        throw new Error('Original campaign key inputs changed');
      await monitor.assertOriginal();
      return Object.freeze({
        instanceId: originalVm.instanceId,
        publicKeySha256: publicHash,
        key: access.inputs.observer_key,
      });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  await read();
  const reference: OriginalGcpObserverCampaignKey = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-campaign-key-reference',
  });
  origins.set(reference, {
    read,
    callback,
    close() {
      if (!retired) {
        retired = true;
        monitor.close();
      }
    },
  });
  return reference;
}
