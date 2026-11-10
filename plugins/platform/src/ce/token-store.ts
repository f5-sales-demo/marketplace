import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

export interface BootstrapCheckoutBinding {
  schemaVersion: 1;
  reference: string;
  root: string;
  digest: string;
  expiresAt: string;
  uid: number | null;
}

export interface StoreBootstrapTokenInput {
  sessionId: string;
  token: string;
  expiresInSeconds: number;
  root?: string;
  onPrepared?: (binding: BootstrapCheckoutBinding) => Promise<void>;
}

const SAFE_ID = /^[a-zA-Z0-9._-]{1,128}$/;

export function defaultBootstrapRoot(): string {
  return join(tmpdir(), 'xcsh-f5xc-ce');
}

function assertWithin(root: string, target: string): void {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap path escapes the secure root');
}

export async function storeBootstrapToken(
  input: StoreBootstrapTokenInput,
): Promise<{ reference: string; expiresAt: string }> {
  const root = input.root ?? defaultBootstrapRoot();
  if (!isAbsolute(root)) throw new Error('Bootstrap root must be absolute');
  if (!SAFE_ID.test(input.sessionId)) throw new Error('Invalid session identifier for bootstrap storage');
  if (!input.token || Array.from(input.token).some((character) => [0, 10, 13].includes(character.charCodeAt(0))))
    throw new Error('Bootstrap token is empty or malformed');
  if (!Number.isInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 900)
    throw new Error('Bootstrap expiry must be between 1 and 900 seconds');
  const id = randomUUID();
  const sessionDir = join(root, input.sessionId);
  const itemDir = join(sessionDir, id);
  for (const target of [sessionDir, itemDir]) assertWithin(root, target);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  await mkdir(sessionDir, { recursive: true, mode: 0o700 });
  await chmod(sessionDir, 0o700);
  await mkdir(itemDir, { mode: 0o700 });
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
  const digest = createHash('sha256').update(input.token, 'utf8').digest('hex');
  const metadata = {
    version: 1,
    session: input.sessionId,
    id,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    digest,
    expiresAt,
    consumed: false,
    checkoutReady: false,
  };
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify(metadata), { mode: 0o600, flag: 'wx' });
  await input.onPrepared?.({
    schemaVersion: 1,
    reference: `f5xc-ce://${input.sessionId}/${id}`,
    root,
    digest,
    expiresAt,
    uid: metadata.uid,
  });
  await writeFile(join(itemDir, 'token'), input.token, { mode: 0o600, flag: 'wx' });
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify({ ...metadata, checkoutReady: true }), {
    mode: 0o600,
  });
  return { reference: `f5xc-ce://${input.sessionId}/${id}`, expiresAt };
}

/** Retire a deployment-checkpointed checkout only after independently verified external absence. */
export async function retireBootstrapToken(
  binding: BootstrapCheckoutBinding,
  evidenceSha256: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const match = /^f5xc-ce:\/\/([a-zA-Z0-9._-]{1,128})\/([a-zA-Z0-9._-]{1,128})$/.exec(binding.reference);
  if (
    !match ||
    binding.schemaVersion !== 1 ||
    !isAbsolute(binding.root) ||
    resolve(binding.root) !== binding.root ||
    !/^[a-f0-9]{64}$/.test(binding.digest) ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256) ||
    binding.uid !== (process.getuid?.() ?? null) ||
    !Number.isFinite(Date.parse(binding.expiresAt))
  )
    throw Error('Bootstrap retirement binding differs');
  const [, session, id] = match;
  const directory = join(binding.root, session, id);
  for (const path of [binding.root, join(binding.root, session), directory]) {
    assertWithin(binding.root, path);
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== binding.uid ||
      (stat.mode & 0o777) !== 0o700 ||
      (await realpath(path)) !== path
    )
      throw Error('Bootstrap retirement directory differs');
  }
  const secureFile = async (name: string) => {
    const path = join(directory, name),
      stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== binding.uid ||
      (stat.mode & 0o777) !== 0o600
    )
      throw Error('Bootstrap retirement file differs');
    return readFile(path);
  };
  const names = await readdir(directory);
  if (names.some((name) => !['metadata.json', 'token'].includes(name)))
    throw Error('Bootstrap checkout has in-flight or unknown artifacts');
  const metadata = JSON.parse((await secureFile('metadata.json')).toString());
  if (
    metadata.version !== 1 ||
    metadata.session !== session ||
    metadata.id !== id ||
    metadata.uid !== binding.uid ||
    metadata.digest !== binding.digest ||
    metadata.expiresAt !== binding.expiresAt ||
    typeof metadata.consumed !== 'boolean'
  )
    throw Error('Bootstrap retirement metadata differs');
  const receipt = {
    schemaVersion: 1,
    status: 'bootstrap-secret-retired' as const,
    reference: binding.reference,
    digest: binding.digest,
    evidenceSha256,
  };
  if (metadata.checkoutReady !== true) throw Error('Bootstrap checkout issuance is incomplete');
  if (metadata.retirementPending && JSON.stringify(metadata.retirementPending) !== JSON.stringify(receipt))
    throw Error('Bootstrap pending retirement evidence differs');
  if (metadata.retirement && JSON.stringify(metadata.retirement) !== JSON.stringify(receipt))
    throw Error('Bootstrap retirement evidence differs');
  const persist = async (value: unknown) => {
    const temporary = join(directory, `metadata-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
      await rename(temporary, join(directory, 'metadata.json'));
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  };
  if (!names.includes('token') && !metadata.consumed && !metadata.retirementPending)
    throw Error('Unconsumed bootstrap token is missing');
  if (names.includes('token')) {
    if (metadata.retirement || metadata.consumed)
      throw Error('Bootstrap secret reappeared after consumption or retirement');
    const bytes = await secureFile('token');
    if (createHash('sha256').update(bytes).digest('hex') !== binding.digest)
      throw Error('Bootstrap retirement token digest differs');
    signal?.throwIfAborted();
    if (!metadata.retirementPending) await persist({ ...metadata, retirementPending: receipt });
    signal?.throwIfAborted();
    await unlink(join(directory, 'token'));
  }
  signal?.throwIfAborted();
  if (!metadata.retirement)
    await persist({ ...metadata, consumed: true, retirementPending: receipt, retirement: receipt });
  return receipt;
}
