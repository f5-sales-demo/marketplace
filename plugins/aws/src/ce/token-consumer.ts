import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { safeHexEqual, sha256Hex } from './canonical';

interface Metadata {
  version: 1;
  session: string;
  id: string;
  uid: number | null;
  digest: string;
  expiresAt: string;
  consumed: boolean;
}

const REFERENCE = /^f5xc-ce:\/\/([a-zA-Z0-9._-]{1,128})\/([a-zA-Z0-9._-]{1,128})$/;

export function defaultAwsBootstrapRoot(): string {
  return join(tmpdir(), 'xcsh-f5xc-ce');
}

function within(root: string, target: string): void {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap reference escapes secure storage');
}

async function assertSecure(path: string, mode: number, label: string): Promise<void> {
  const value = await lstat(path);
  if (value.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if ((value.mode & 0o777) !== mode) throw new Error(`${label} has an unsafe file mode`);
  if (typeof process.getuid === 'function' && value.uid !== process.getuid())
    throw new Error(`${label} belongs to a different owner`);
}

export async function consumeAwsBootstrapRef(
  reference: string,
  sessionId: string,
  root = defaultAwsBootstrapRoot(),
): Promise<string> {
  if (!isAbsolute(root)) throw new Error('Bootstrap root must be absolute');
  const match = REFERENCE.exec(reference);
  if (!match || match[1] !== sessionId) throw new Error('Bootstrap reference does not belong to this session');
  const sessionDirectory = join(root, match[1]);
  const directory = join(sessionDirectory, match[2]);
  const tokenPath = join(directory, 'token');
  const claimedPath = join(directory, 'token.consuming');
  const metadataPath = join(directory, 'metadata.json');
  for (const target of [sessionDirectory, directory, tokenPath, claimedPath, metadataPath]) within(root, target);
  await assertSecure(root, 0o700, 'bootstrap root directory');
  await assertSecure(sessionDirectory, 0o700, 'bootstrap session directory');
  await assertSecure(directory, 0o700, 'bootstrap item directory');
  await assertSecure(metadataPath, 0o600, 'bootstrap metadata');
  let metadata: Metadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Metadata;
  } catch {
    throw new Error('Bootstrap metadata is missing or invalid');
  }
  if (metadata.version !== 1 || metadata.session !== sessionId || metadata.id !== match[2] || metadata.consumed)
    throw new Error('Bootstrap metadata is invalid or already consumed');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
    throw new Error('Bootstrap metadata belongs to a different owner');
  if (!Number.isFinite(Date.parse(metadata.expiresAt)) || Date.parse(metadata.expiresAt) <= Date.now())
    throw new Error('Bootstrap reference has expired');
  await assertSecure(tokenPath, 0o600, 'bootstrap token file');
  await rename(tokenPath, claimedPath).catch(() => {
    throw new Error('Bootstrap reference is missing or already used');
  });
  try {
    await assertSecure(claimedPath, 0o600, 'bootstrap token file');
    const token = await readFile(claimedPath, 'utf8');
    if (!safeHexEqual(metadata.digest, sha256Hex(token)))
      throw new Error('Bootstrap token digest does not match metadata');
    await writeFile(metadataPath, JSON.stringify({ ...metadata, consumed: true }), { mode: 0o600 });
    return token;
  } finally {
    await unlink(claimedPath).catch(() => undefined);
  }
}
