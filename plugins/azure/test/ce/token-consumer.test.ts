import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { consumeBootstrapRef } from '../../src/ce/token-consumer';
import { sha256Hex } from '../../src/ce/canonical';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: { session?: string; expiresAt?: string; mode?: number; digest?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'azure-ce-token-test-'));
  roots.push(root);
  const session = options.session ?? 'session-a';
  const id = 'token-a';
  const dir = join(root, session, id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const token = 'fixture-secret-value';
  const tokenPath = join(dir, 'token');
  await writeFile(tokenPath, token, { mode: 0o600 });
  await chmod(tokenPath, options.mode ?? 0o600);
  await writeFile(join(dir, 'metadata.json'), JSON.stringify({
    version: 1,
    session,
    id,
    uid: typeof process.getuid === 'function' ? process.getuid() : null,
    digest: options.digest ?? sha256Hex(token),
    expiresAt: options.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    consumed: false,
  }), { mode: 0o600 });
  return { root, ref: `f5xc-ce://${session}/${id}`, tokenPath, token };
}

describe('consumeBootstrapRef', () => {
  it('returns token bytes once and deletes the secret file', async () => {
    const item = await fixture();
    const consumed = await consumeBootstrapRef(item.ref, 'session-a', item.root);
    expect(consumed).toBe(item.token);
    expect(await Bun.file(item.tokenPath).exists()).toBe(false);
    await expect(consumeBootstrapRef(item.ref, 'session-a', item.root)).rejects.toThrow(/used|missing/i);
  });

  it('rejects cross-session, expired, wrong-mode, and digest-mismatched references', async () => {
    const wrongSession = await fixture();
    await expect(consumeBootstrapRef(wrongSession.ref, 'session-b', wrongSession.root)).rejects.toThrow(/session/i);

    const expired = await fixture({ expiresAt: new Date(Date.now() - 1_000).toISOString() });
    await expect(consumeBootstrapRef(expired.ref, 'session-a', expired.root)).rejects.toThrow(/expired/i);

    const mode = await fixture({ mode: 0o644 });
    await expect(consumeBootstrapRef(mode.ref, 'session-a', mode.root)).rejects.toThrow(/mode/i);

    const digest = await fixture({ digest: '0'.repeat(64) });
    await expect(consumeBootstrapRef(digest.ref, 'session-a', digest.root)).rejects.toThrow(/digest/i);
  });

  it('never writes the token into metadata', async () => {
    const item = await fixture();
    const metadata = await readFile(join(item.root, 'session-a', 'token-a', 'metadata.json'), 'utf8');
    expect(metadata).not.toContain(item.token);
  });
});
