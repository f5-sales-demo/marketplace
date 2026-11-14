import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertSameOriginalInput, type OriginalInputBinding } from '../src/original-input-monitor';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function binding(path: string): Promise<OriginalInputBinding> {
  const file = await lstat(path, { bigint: true }),
    parent = await lstat(dirname(path), { bigint: true });
  return {
    path,
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
    expectedIdentity: {
      dev: String(file.dev),
      ino: String(file.ino),
      uid: String(file.uid),
      nlink: String(file.nlink),
      mode: String(file.mode),
      size: String(file.size),
      mtimeNs: String(file.mtimeNs),
      ctimeNs: String(file.ctimeNs),
    },
    expectedParentIdentity: {
      dev: String(parent.dev),
      ino: String(parent.ino),
      uid: String(parent.uid),
      mode: String(parent.mode),
    },
  };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'original-source-admission-'));
  roots.push(root);
  const path = join(root, 'adc.private.json');
  await writeFile(path, '{"type":"authorized_user","refresh_token":"EXAMPLE_REFRESH_TOKEN"}', { mode: 0o600 });
  return { root, path, original: await binding(path) };
}
test('source admission accepts the same file and parent without requiring a global parent permission change', async () => {
  const f = await fixture();
  await chmod(f.root, 0o775);
  const original = await binding(f.path);
  expect(() => assertSameOriginalInput(original, original)).not.toThrow();
});
test('same-byte atomic replacement before snapshot creation refuses the replacement identity', async () => {
  const f = await fixture();
  const replacement = join(f.root, 'replacement.private.json');
  await writeFile(replacement, await readFile(f.path), { mode: 0o600 });
  await rename(replacement, f.path);
  const current = await binding(f.path);
  expect(current.sha256).toBe(f.original.sha256);
  expect(current.expectedIdentity?.ino).not.toBe(f.original.expectedIdentity?.ino);
  expect(() => assertSameOriginalInput(f.original, current)).toThrow('identity');
});
test('same-byte writes and parent permission changes cannot reset the original admission', async () => {
  for (const change of ['write', 'parent']) {
    const f = await fixture();
    if (change === 'write') {
      await writeFile(f.path, await readFile(f.path));
      await utimes(f.path, new Date(0), new Date(0));
    } else await chmod(f.root, 0o775);
    const current = await binding(f.path);
    expect(current.sha256).toBe(f.original.sha256);
    expect(() => assertSameOriginalInput(f.original, current)).toThrow('identity');
  }
});
test('missing admitted metadata cannot authorize a fresh identity capture', async () => {
  const f = await fixture();
  expect(() => assertSameOriginalInput({ ...f.original, expectedIdentity: undefined }, f.original)).toThrow();
  expect(() => assertSameOriginalInput(f.original, { ...f.original, expectedParentIdentity: undefined })).toThrow();
});
