import { lstat, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { safeHexEqual, sha256Hex } from './canonical';

interface BootstrapMetadata {
  version: 1;
  session: string;
  id: string;
  uid: number | null;
  digest: string;
  expiresAt: string;
  consumed: boolean;
}

const REF = /^f5xc-ce:\/\/([a-zA-Z0-9._-]{1,128})\/([a-zA-Z0-9._-]{1,128})$/;

function assertWithin(base: string, target: string): void {
  const normalizedBase = resolve(base);
  const normalizedTarget = resolve(target);
  if (normalizedTarget !== normalizedBase && !normalizedTarget.startsWith(`${normalizedBase}${sep}`)) {
    throw new Error('Bootstrap reference escapes the session token root');
  }
}

async function assertSecurePath(path: string, mode: number, label: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link`);
  if ((stat.mode & 0o777) !== mode) throw new Error(`${label} has unsafe mode ${(stat.mode & 0o777).toString(8)}`);
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error(`${label} has the wrong file owner`);
}

export function defaultBootstrapRoot(): string {
  return join(tmpdir(), 'xcsh-f5xc-ce');
}

export async function consumeBootstrapRef(reference: string, sessionId: string, root = defaultBootstrapRoot()): Promise<string> {
  if (!isAbsolute(root)) throw new Error('Bootstrap root must be absolute');
  const match = REF.exec(reference);
  if (!match) throw new Error('Invalid opaque bootstrap reference');
  const [, referenceSession, id] = match;
  if (referenceSession !== sessionId) throw new Error('Bootstrap reference belongs to a different session');
  const sessionDir = join(root, referenceSession);
  const itemDir = join(sessionDir, id);
  const metadataPath = join(itemDir, 'metadata.json');
  const tokenPath = join(itemDir, 'token');
  const consumingPath = join(itemDir, 'token.consuming');
  for (const target of [sessionDir, itemDir, metadataPath, tokenPath, consumingPath]) assertWithin(root, target);
  await assertSecurePath(sessionDir, 0o700, 'bootstrap session directory');
  await assertSecurePath(itemDir, 0o700, 'bootstrap item directory');
  await assertSecurePath(metadataPath, 0o600, 'bootstrap metadata');
  let metadata: BootstrapMetadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as BootstrapMetadata;
  } catch {
    throw new Error('Bootstrap metadata is missing or invalid');
  }
  if (metadata.version !== 1 || metadata.session !== sessionId || metadata.id !== id) throw new Error('Bootstrap metadata does not match the opaque reference');
  if (metadata.consumed) throw new Error('Bootstrap reference was already used');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) throw new Error('Bootstrap metadata has the wrong owner');
  if (!Number.isFinite(Date.parse(metadata.expiresAt)) || Date.parse(metadata.expiresAt) <= Date.now()) throw new Error('Bootstrap reference is expired');
  await assertSecurePath(tokenPath, 0o600, 'bootstrap token file');
  try {
    await rename(tokenPath, consumingPath);
  } catch {
    throw new Error('Bootstrap reference was already used or its token file is missing');
  }
  try {
    await assertSecurePath(consumingPath, 0o600, 'bootstrap token file');
    const token = await readFile(consumingPath, 'utf8');
    if (!safeHexEqual(metadata.digest, sha256Hex(token))) throw new Error('Bootstrap token digest mismatch');
    metadata.consumed = true;
    await writeFile(metadataPath, JSON.stringify(metadata), { mode: 0o600 });
    return token;
  } finally {
    await unlink(consumingPath).catch(() => undefined);
  }
}
