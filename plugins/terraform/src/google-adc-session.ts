import { createHash } from 'node:crypto';
import { constants, watch } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';

/** Supplied only by the server-owned policy after independent raw evidence review.
 * assertOriginal must retain the original lifetime input monitor and execution budget.
 * This consistency checker cannot establish either property from file samples alone.
 */
export interface GoogleAdcLease {
  schemaVersion: 1;
  kind: 'google-adc-snapshot';
  owner: CeOwner;
  snapshotPath: string;
  snapshotSha256: string;
  accountSha256: string;
  audienceSha256: string;
  authenticationReceiptSha256: string;
  qualificationSha256: string;
  verifiedAt: number;
  expiresNoEarlierThan: number;
  assertOriginal(): Promise<void>;
  /** Independently verify every original executor/reader group before releasing its monitor. */
  closeAfterExecutorExit(): Promise<void>;
}
export interface GoogleAdcExpected {
  owner: CeOwner;
  directory: string;
  accountSha256: string;
  audienceSha256: string;
  qualificationSha256: string;
}
export const googleCredentialAlternatives = Object.freeze([
  'GOOGLE_OAUTH_ACCESS_TOKEN',
  'GOOGLE_ACCESS_TOKEN',
  'GOOGLE_CREDENTIALS',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT',
  'GOOGLE_IMPERSONATE_SERVICE_ACCOUNT_DELEGATES',
  'GCLOUD_KEYFILE_JSON',
  'GOOGLE_CLOUD_KEYFILE_JSON',
]);
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const validHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sameOwner = (a: CeOwner, b: CeOwner) =>
  a?.engine === 'terraform' &&
  a.provider === 'gcp' &&
  b?.engine === a.engine &&
  b.provider === a.provider &&
  a.deploymentId === b.deploymentId &&
  a.account === b.account &&
  a.region === b.region;
type Metadata = Awaited<ReturnType<typeof fileMetadata>>;
async function fileMetadata(path: string) {
  const stat = await lstat(path, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid?.() ?? -1) ||
    stat.nlink !== 1n ||
    (stat.mode & 0o777n) !== 0o400n ||
    stat.size < 1n ||
    stat.size > 65536n
  )
    throw new Error('Immutable private Google ADC snapshot required');
  return {
    dev: stat.dev,
    ino: stat.ino,
    uid: stat.uid,
    mode: stat.mode,
    size: stat.size,
    ctimeNs: stat.ctimeNs,
    mtimeNs: stat.mtimeNs,
  };
}
const sameMetadata = (a: Metadata, b: Metadata) =>
  (Object.keys(a) as Array<keyof Metadata>).every((key) => a[key] === b[key]);

/** Validates a trusted lease without creating credentials, submitting a command or granting execution. */
export async function openGoogleAdcSession(input: GoogleAdcLease, expectedInput: GoogleAdcExpected) {
  const expected = { ...expectedInput, owner: structuredClone(expectedInput.owner) };
  const lease = { ...input, owner: structuredClone(input.owner) };
  const now = Date.now();
  if (
    lease.schemaVersion !== 1 ||
    lease.kind !== 'google-adc-snapshot' ||
    !sameOwner(lease.owner, expected.owner) ||
    typeof lease.assertOriginal !== 'function' ||
    typeof lease.closeAfterExecutorExit !== 'function' ||
    !isAbsolute(expected.directory) ||
    resolve(expected.directory) !== expected.directory ||
    !isAbsolute(lease.snapshotPath) ||
    resolve(lease.snapshotPath) !== lease.snapshotPath ||
    dirname(lease.snapshotPath) !== expected.directory ||
    !Number.isSafeInteger(lease.verifiedAt) ||
    !Number.isSafeInteger(lease.expiresNoEarlierThan) ||
    lease.verifiedAt > now ||
    now - lease.verifiedAt >= 300000 ||
    lease.expiresNoEarlierThan - now <= 360000 ||
    lease.expiresNoEarlierThan - lease.verifiedAt > 3600000
  )
    throw new Error('Fresh reviewed Google ADC lease and owning workspace required');
  for (const key of [
    'snapshotSha256',
    'accountSha256',
    'audienceSha256',
    'authenticationReceiptSha256',
    'qualificationSha256',
  ] as const)
    if (!validHash(lease[key])) throw new Error('Exact Google ADC review hashes required');
  for (const key of ['accountSha256', 'audienceSha256', 'qualificationSha256'] as const)
    if (!validHash(expected[key]) || expected[key] !== lease[key])
      throw new Error('Google ADC principal, audience or qualification changed');
  const originalDirectory = await lstat(expected.directory, { bigint: true });
  const directory = async () => {
    const current = await lstat(expected.directory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.uid !== BigInt(process.getuid?.() ?? -1) ||
      (current.mode & 0o777n) !== 0o700n ||
      current.dev !== originalDirectory.dev ||
      current.ino !== originalDirectory.ino ||
      (await realpath(expected.directory)) !== expected.directory
    )
      throw new Error('Original private Google ADC workspace changed');
  };
  await directory();
  const original = await fileMetadata(lease.snapshotPath);
  let refused = false;
  let retiring = false;
  let closed = false;
  let closure: Promise<void> | undefined;
  // File samples can miss rapid write-and-restore. Latch every event on the original
  // watched inode; the trusted controller still owns the complete input monitor.
  const watcher = watch(lease.snapshotPath, { persistent: false }, () => {
    refused = true;
    watcher.close();
  });
  watcher.on('error', () => {
    refused = true;
    watcher.close();
  });
  const watcherClosed = new Promise<void>((resolve) => watcher.once('close', resolve));
  const close = () => {
    retiring = true;
    if (closed) return Promise.resolve();
    if (!closure)
      closure = (async () => {
        await lease.closeAfterExecutorExit();
        watcher.close();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            watcherClosed,
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(new Error('Original ADC observer closure unresolved')), 1000);
            }),
          ]);
          closed = true;
        } finally {
          if (timer) clearTimeout(timer);
        }
      })().catch((error) => {
        closure = undefined;
        throw error;
      });
    return closure;
  };
  const verify = async (env: Record<string, string | undefined>) => {
    if (refused || retiring) throw new Error('Original Google ADC session remains refused');
    try {
      if (
        env.GOOGLE_APPLICATION_CREDENTIALS !== lease.snapshotPath ||
        googleCredentialAlternatives.some((key) => env[key] !== undefined)
      )
        throw new Error('Google ADC source substitution refused');
      await lease.assertOriginal();
      await directory();
      if (!sameMetadata(original, await fileMetadata(lease.snapshotPath)))
        throw new Error('Original Google ADC snapshot identity changed');
      const handle = await open(lease.snapshotPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const opened = await handle.stat({ bigint: true });
        if (opened.dev !== original.dev || opened.ino !== original.ino || !opened.isFile())
          throw new Error('Original Google ADC snapshot replaced during open');
        const bytes = await handle.readFile();
        if (hash(bytes) !== lease.snapshotSha256 || !sameMetadata(original, await fileMetadata(lease.snapshotPath)))
          throw new Error('Original Google ADC snapshot bytes changed');
        const credential = JSON.parse(bytes.toString('utf8'));
        if (
          credential?.type !== 'authorized_user' ||
          typeof credential.client_id !== 'string' ||
          hash(credential.client_id) !== lease.audienceSha256 ||
          typeof credential.client_secret !== 'string' ||
          !credential.client_secret ||
          typeof credential.refresh_token !== 'string' ||
          !credential.refresh_token ||
          (credential.quota_project_id !== undefined && credential.quota_project_id !== lease.owner.account) ||
          (credential.token_uri !== undefined && credential.token_uri !== 'https://oauth2.googleapis.com/token') ||
          (credential.universe_domain !== undefined && credential.universe_domain !== 'googleapis.com') ||
          (credential.account !== undefined &&
            credential.account !== '' &&
            (typeof credential.account !== 'string' || hash(credential.account) !== lease.accountSha256)) ||
          ['client_id', 'client_secret', 'refresh_token'].some(
            (key) => typeof credential[key] !== 'string' || !credential[key] || /[\0\r\n]/.test(credential[key]),
          )
        )
          throw new Error('Qualified authorized-user Google ADC mapping required');
      } finally {
        await handle.close();
      }
      await directory();
      await lease.assertOriginal();
      if (refused || retiring) throw new Error('Original Google ADC input event observed');
    } catch {
      refused = true;
      watcher.close();
      throw new Error('Original reviewed Google ADC session verification failed');
    }
  };
  const environment = () => Object.freeze({ GOOGLE_APPLICATION_CREDENTIALS: lease.snapshotPath });
  await verify(environment());
  return Object.freeze({ environment, verify, close });
}
