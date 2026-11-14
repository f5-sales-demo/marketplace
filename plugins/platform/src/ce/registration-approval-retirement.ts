import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { CeDeploymentStore } from './deployment-store';
import type { SiteBinding } from './runtime';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed approval reservation');
  return value as Record<string, unknown>;
};
const keys = (value: Record<string, unknown>, expected: string[]) =>
  isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort());
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

/** Finalize only this producer's records, after exact registration absence. */
export async function retireRegistrationApprovalReservations(
  store: CeDeploymentStore,
  binding: SiteBinding,
  context: { tenantOrigin: string; contractFingerprint: string },
  verifyAbsent: (registration: string) => Promise<void>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await store.verify();
  if (!isDeepStrictEqual(store.owner, binding.owner)) throw Error('Approval retirement owner differs');
  const selected: Array<{ name: string; registration: string; bytes: Buffer; inode: number; device: number }> = [];
  for (const name of (await readdir(store.directory)).sort()) {
    if (!/^registration-approval-[a-f0-9]{64}\.json$/.test(name)) continue;
    const path = join(store.directory, name),
      info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077 ||
      info.size > 65536
    )
      throw Error('Approval reservation custody differs');
    const bytes = await readFile(path),
      value = object(JSON.parse(bytes.toString())),
      identity = object(value.identity);
    if (
      !keys(value, ['schemaVersion', 'owner', 'tenantOrigin', 'contractFingerprint', 'identity']) ||
      value.schemaVersion !== 1 ||
      !isDeepStrictEqual(value.owner, binding.owner) ||
      value.tenantOrigin !== context.tenantOrigin ||
      value.contractFingerprint !== context.contractFingerprint
    )
      throw Error('Approval reservation owner or context differs');
    if (identity.siteName !== binding.siteName) continue;
    const expectedKeys = ['siteName', 'node', 'registration', 'instanceId', 'action', 'initialState', 'passportSha256'];
    if (identity.initialState === 'PENDING') expectedKeys.push('registrationUid');
    const instance = identity.instanceId;
    if (
      !keys(identity, expectedKeys) ||
      typeof identity.node !== 'string' ||
      !binding.nodes.includes(identity.node) ||
      identity.action !== 'approve-registration' ||
      typeof identity.initialState !== 'string' ||
      !['NEW', 'PENDING'].includes(identity.initialState) ||
      typeof identity.registration !== 'string' ||
      !/^r-[a-z0-9-]+$/.test(identity.registration) ||
      name !== `registration-approval-${sha(identity.registration)}.json` ||
      typeof identity.passportSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(identity.passportSha256) ||
      typeof instance !== 'string' ||
      (binding.owner.provider === 'aws'
        ? !/^i-(?:[a-f0-9]{8}|[a-f0-9]{17})$/.test(instance)
        : !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(instance)) ||
      (identity.initialState === 'PENDING' &&
        (typeof identity.registrationUid !== 'string' ||
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(identity.registrationUid) ||
          identity.registration !== `r-${identity.registrationUid}`))
    )
      throw Error('Approval reservation identity differs');
    selected.push({ name, registration: identity.registration, bytes, inode: info.ino, device: info.dev });
  }
  // Validate every record and read every exact resource before removing any record.
  for (const row of selected) {
    signal?.throwIfAborted();
    await verifyAbsent(row.registration);
  }
  for (const row of selected) {
    signal?.throwIfAborted();
    const path = join(store.directory, row.name),
      info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.nlink !== 1 ||
      info.uid !== process.getuid?.() ||
      info.mode & 0o077 ||
      info.ino !== row.inode ||
      info.dev !== row.device ||
      sha(await readFile(path)) !== sha(row.bytes)
    )
      throw Error('Approval reservation changed before retirement');
  }
  for (const row of selected) {
    signal?.throwIfAborted();
    await store.remove(row.name);
  }
  return { retired: selected.map(({ name, bytes }) => ({ name, sha256: sha(bytes) })) };
}
