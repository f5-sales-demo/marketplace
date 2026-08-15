import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

export interface StoreBootstrapTokenInput {
  sessionId: string;
  token: string;
  expiresInSeconds: number;
  root?: string;
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
  };
  await writeFile(join(itemDir, 'token'), input.token, { mode: 0o600, flag: 'wx' });
  await writeFile(join(itemDir, 'metadata.json'), JSON.stringify(metadata), { mode: 0o600, flag: 'wx' });
  return { reference: `f5xc-ce://${input.sessionId}/${id}`, expiresAt };
}
