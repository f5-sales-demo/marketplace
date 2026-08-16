import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex } from '../../src/ce/canonical';
import { consumeAwsBootstrapRef } from '../../src/ce/token-consumer';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(
  options: { session?: string; expiresAt?: string; mode?: number; digest?: string; directoryMode?: number } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'aws-ce-token-test-'));
  roots.push(root);
  const session = options.session ?? 'session-a';
  const id = 'token-a';
  const sessionDirectory = join(root, session);
  const directory = join(sessionDirectory, id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(sessionDirectory, 0o700);
  await chmod(directory, options.directoryMode ?? 0o700);
  const token = 'fixture-secret-value';
  const tokenPath = join(directory, 'token');
  await writeFile(tokenPath, token, { mode: 0o600 });
  await chmod(tokenPath, options.mode ?? 0o600);
  await writeFile(
    join(directory, 'metadata.json'),
    JSON.stringify({
      version: 1,
      session,
      id,
      uid: typeof process.getuid === 'function' ? process.getuid() : null,
      digest: options.digest ?? sha256Hex(token),
      expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
      consumed: false,
    }),
    { mode: 0o600 },
  );
  return { root, reference: `f5xc-ce://${session}/${id}`, tokenPath, token };
}

describe('consumeAwsBootstrapRef', () => {
  it('consumes exact bytes once, removes the token file, and keeps metadata secret-free', async () => {
    const item = await fixture();
    expect(await readFile(join(item.root, 'session-a', 'token-a', 'metadata.json'), 'utf8')).not.toContain(item.token);
    expect(await consumeAwsBootstrapRef(item.reference, 'session-a', item.root)).toBe(item.token);
    expect(await Bun.file(item.tokenPath).exists()).toBe(false);
    await expect(consumeAwsBootstrapRef(item.reference, 'session-a', item.root)).rejects.toThrow(
      /used|missing|consumed/i,
    );
  });

  it('rejects cross-session, expired, wrong-file-mode, wrong-directory-mode, and digest drift', async () => {
    const cross = await fixture();
    await expect(consumeAwsBootstrapRef(cross.reference, 'session-b', cross.root)).rejects.toThrow(/session/i);
    const expired = await fixture({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
    await expect(consumeAwsBootstrapRef(expired.reference, 'session-a', expired.root)).rejects.toThrow(/expired/i);
    const mode = await fixture({ mode: 0o644 });
    await expect(consumeAwsBootstrapRef(mode.reference, 'session-a', mode.root)).rejects.toThrow(/mode/i);
    const directory = await fixture({ directoryMode: 0o755 });
    await expect(consumeAwsBootstrapRef(directory.reference, 'session-a', directory.root)).rejects.toThrow(/mode/i);
    const digest = await fixture({ digest: '0'.repeat(64) });
    await expect(consumeAwsBootstrapRef(digest.reference, 'session-a', digest.root)).rejects.toThrow(/digest/i);
  });
});
