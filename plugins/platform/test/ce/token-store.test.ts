import { afterEach, describe, expect, it } from 'bun:test';
import { lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BootstrapCheckoutBinding, retireBootstrapToken, storeBootstrapToken } from '../../src/ce/token-store';

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

for (const fault of [
  'none',
  'foreign-digest',
  'changed-token',
  'inflight',
  'interrupted',
  'consumed',
  'missing',
  'after-delete',
] as const) {
  it(`retires only exact bound bootstrap secrets: ${fault}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'platform-ce-retire-test-'));
    roots.push(root);
    let binding: BootstrapCheckoutBinding | undefined;
    const stored = await storeBootstrapToken({
      sessionId: 'session-a',
      token: 'fixture-retirement-secret',
      expiresInSeconds: 60,
      root,
      onPrepared: async (value) => {
        binding = value;
      },
    });
    expect(binding?.reference).toBe(stored.reference);
    if (!binding) throw Error('missing binding');
    const directory = join(root, 'session-a', stored.reference.split('/').at(-1) ?? '');
    if (fault === 'foreign-digest') binding = { ...binding, digest: '0'.repeat(64) };
    if (fault === 'changed-token') await writeFile(join(directory, 'token'), 'changed', { mode: 0o600 });
    if (fault === 'inflight')
      await writeFile(join(directory, 'token.consuming'), 'fixture-retirement-secret', { mode: 0o600 });
    if (fault === 'missing' || fault === 'after-delete') {
      await rm(join(directory, 'token'));
      if (fault === 'after-delete') {
        const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
        await writeFile(
          join(directory, 'metadata.json'),
          JSON.stringify({
            ...metadata,
            retirementPending: {
              schemaVersion: 1,
              status: 'bootstrap-secret-retired',
              reference: binding.reference,
              digest: binding.digest,
              evidenceSha256: 'a'.repeat(64),
            },
          }),
          { mode: 0o600 },
        );
      } else {
        await expect(retireBootstrapToken(binding, 'a'.repeat(64))).rejects.toThrow('missing');
        return;
      }
    }
    if (fault === 'consumed') {
      await rm(join(directory, 'token'));
      const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'));
      await writeFile(join(directory, 'metadata.json'), JSON.stringify({ ...metadata, consumed: true }), {
        mode: 0o600,
      });
    }
    if (['foreign-digest', 'changed-token', 'inflight'].includes(fault)) {
      await expect(retireBootstrapToken(binding, 'a'.repeat(64))).rejects.toThrow();
      expect(await lstat(join(directory, 'token'))).toBeDefined();
      return;
    }
    if (fault === 'interrupted') {
      const controller = new AbortController();
      controller.abort();
      await expect(retireBootstrapToken(binding, 'a'.repeat(64), controller.signal)).rejects.toThrow();
      expect(await lstat(join(directory, 'token'))).toBeDefined();
    }
    const receipt = await retireBootstrapToken(binding, 'a'.repeat(64));
    expect(receipt.status).toBe('bootstrap-secret-retired');
    await expect(lstat(join(directory, 'token'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await retireBootstrapToken(binding, 'a'.repeat(64))).toEqual(receipt);
    await expect(retireBootstrapToken(binding, 'b'.repeat(64))).rejects.toThrow();
  });
}
