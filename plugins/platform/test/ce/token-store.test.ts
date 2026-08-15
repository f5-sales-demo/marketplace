import { afterEach, describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { storeBootstrapToken } from '../../src/ce/token-store';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('storeBootstrapToken', () => {
  it('returns only an opaque reference and writes 0700/0600 session-owned state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-store-test-'));
    roots.push(root);
    const token = 'fixture-secret-value';
    const stored = await storeBootstrapToken({ sessionId: 'session-a', token, expiresInSeconds: 60, root });
    expect(stored.reference).toMatch(/^f5xc-ce:\/\/session-a\/[a-z0-9-]+$/);
    expect(JSON.stringify(stored)).not.toContain(token);
    const id = stored.reference.split('/').at(-1) ?? '';
    const itemDir = join(root, 'session-a', id);
    expect((await lstat(join(root, 'session-a'))).mode & 0o777).toBe(0o700);
    expect((await lstat(itemDir)).mode & 0o777).toBe(0o700);
    expect((await lstat(join(itemDir, 'token'))).mode & 0o777).toBe(0o600);
    expect((await lstat(join(itemDir, 'metadata.json'))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(itemDir, 'token'), 'utf8')).toBe(token);
    expect(await readFile(join(itemDir, 'metadata.json'), 'utf8')).not.toContain(token);
  });

  it('rejects unsafe session IDs and invalid expiry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-store-test-'));
    roots.push(root);
    await expect(
      storeBootstrapToken({ sessionId: '../escape', token: 'x', expiresInSeconds: 60, root }),
    ).rejects.toThrow(/session/i);
    await expect(
      storeBootstrapToken({ sessionId: 'session-a', token: 'x', expiresInSeconds: 0, root }),
    ).rejects.toThrow(/expiry/i);
  });
});
