import { formatGcpUserData, type GcpBootstrapBinding } from './bootstrap';
import type { GcpOperationStore } from './native-operation';
import type { GcpCeEngine } from './types';

export interface GcpBootstrapOwner {
  project: string;
  deploymentName: string;
  siteName: string;
  nodeName: string;
  engine: GcpCeEngine;
}
export interface GcpBootstrapStore extends GcpOperationStore {
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}
interface BootstrapRecord {
  schemaVersion: 1;
  owner: GcpBootstrapOwner;
  expiresAt: string;
  jwt: string;
  state: 'issued' | 'consumed';
}
function ownerEqual(a: GcpBootstrapOwner, b: GcpBootstrapOwner) {
  return ['project', 'deploymentName', 'siteName', 'nodeName', 'engine'].every(
    (field) => a[field as keyof GcpBootstrapOwner] === b[field as keyof GcpBootstrapOwner],
  );
}
function valid(owner: GcpBootstrapOwner) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(owner.project) || !['native', 'terraform'].includes(owner.engine))
    throw new Error('Invalid bootstrap ownership');
  for (const name of [owner.deploymentName, owner.siteName, owner.nodeName])
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('Invalid bootstrap ownership');
}
function path(owner: GcpBootstrapOwner) {
  return `gcp-bootstrap-${owner.nodeName}.json`;
}

/** Shared restricted storage and process lock are mandatory; no memory-only checkout. */
export async function storeGcpBootstrap(
  store: GcpBootstrapStore,
  owner: GcpBootstrapOwner,
  binding: GcpBootstrapBinding,
): Promise<void> {
  valid(owner);
  if (
    binding.deploymentName !== owner.deploymentName ||
    binding.siteName !== owner.siteName ||
    binding.nodeName !== owner.nodeName
  )
    throw new Error('Bootstrap deployment/site/node binding differs');
  formatGcpUserData(binding);
  await store.exclusive(async () => {
    let prior: unknown;
    try {
      prior = await store.read(path(owner));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (prior !== undefined)
      throw new Error('Bootstrap already issued; explicit revocation and new node identity required');
    const record: BootstrapRecord = {
      schemaVersion: 1,
      owner: structuredClone(owner),
      expiresAt: binding.expiresAt,
      jwt: binding.jwt,
      state: 'issued',
    };
    await store.write(path(owner), record);
  });
}

/** Consume durably before returning private user-data; interruption cannot replay checkout. */
export async function checkoutGcpBootstrap(
  store: GcpBootstrapStore,
  owner: GcpBootstrapOwner,
  now = Date.now(),
): Promise<string> {
  valid(owner);
  return store.exclusive(async () => {
    const record = (await store.read(path(owner))) as BootstrapRecord;
    if (record?.schemaVersion !== 1 || !ownerEqual(record.owner, owner) || record.state !== 'issued')
      throw new Error('Bootstrap unavailable for this deployment/site/node/engine');
    const material = formatGcpUserData({ ...owner, jwt: record.jwt, expiresAt: record.expiresAt }, now);
    await store.write(path(owner), { ...record, jwt: '', state: 'consumed' });
    return material;
  });
}
