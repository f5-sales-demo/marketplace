import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { link, lstat, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorOriginalInputs, type OriginalInputIdentity } from '../src/original-input-monitor';

const roots: string[] = [];
const closes: Array<() => void> = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
afterEach(async () => {
  for (const close of closes.splice(0)) close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'original-input-monitor-'));
  roots.push(root);
  const path = join(root, 'input.private');
  await writeFile(path, 'original', { mode: 0o400 });
  return { root, path, binding: { path, sha256: hash('original') } };
}
test('monitor retains initial bytes and identity and closes without accepting further calls', async () => {
  const f = await fixture();
  const monitor = await monitorOriginalInputs({ credential: f.binding });
  closes.push(monitor.close);
  await monitor.assertOriginal();
  monitor.close();
  await expect(monitor.assertOriginal()).rejects.toThrow('Original input monitor');
});
test('same-byte file replacement and write-restore permanently refuse the original monitor', async () => {
  for (const replacement of [false, true]) {
    const f = await fixture();
    const monitor = await monitorOriginalInputs({ credential: f.binding });
    closes.push(monitor.close);
    if (replacement) {
      const copy = join(f.root, 'replacement');
      await writeFile(copy, 'original', { mode: 0o400 });
      await rename(copy, f.path);
    } else {
      const { chmod } = await import('node:fs/promises');
      await chmod(f.path, 0o600);
      await writeFile(f.path, 'changed');
      await writeFile(f.path, 'original');
      await chmod(f.path, 0o400);
    }
    await expect(monitor.assertOriginal()).rejects.toThrow('Original input monitor');
    await expect(monitor.assertOriginal()).rejects.toThrow('Original input monitor');
  }
});
test('aliased paths, shared links and wrong reviewed hashes are rejected before monitoring', async () => {
  const f = await fixture();
  await expect(monitorOriginalInputs({ credential: { ...f.binding, sha256: hash('foreign') } })).rejects.toThrow();
  const alias = join(f.root, 'alias');
  await symlink(f.path, alias);
  await expect(monitorOriginalInputs({ credential: { ...f.binding, path: alias } })).rejects.toThrow();
  await link(f.path, join(f.root, 'hard-link'));
  await expect(monitorOriginalInputs({ credential: f.binding })).rejects.toThrow();
});
test('an unrelated output does not replace original monitored input identities', async () => {
  const f = await fixture();
  const monitor = await monitorOriginalInputs({ credential: f.binding });
  closes.push(monitor.close);
  await writeFile(join(f.root, 'output.private'), 'new output');
  await monitor.assertOriginal();
});

test('admitted input handoff cannot recapture a different owning directory identity', async () => {
  const f = await fixture();
  const before = await lstat(f.path, { bigint: true });
  const parent = await lstat(f.root, { bigint: true });
  const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
  const expectedIdentity = Object.fromEntries(
    keys.map((key) => [key, before[key].toString()]),
  ) as OriginalInputIdentity;
  const expectedParentIdentity = {
    dev: parent.dev.toString(),
    ino: (parent.ino + 1n).toString(),
    uid: parent.uid.toString(),
    mode: parent.mode.toString(),
  };
  const admission = monitorOriginalInputs({ credential: { ...f.binding, expectedIdentity, expectedParentIdentity } });
  const tracked = admission.then((monitor) => {
    closes.push(monitor.close);
    return monitor;
  });
  await expect(tracked).rejects.toThrow('Original input monitor');
});

test('identity guard requires full digest admission and retains closed refusal', async () => {
  const f = await fixture();
  await expect(monitorOriginalInputs({ input: { ...f.binding, sha256: hash('changed') } })).rejects.toThrow();
  const monitor = await monitorOriginalInputs({ input: f.binding });
  closes.push(monitor.close);
  await monitor.assertOriginalIdentity();
  await monitor.assertOriginal();
  monitor.close();
  await expect(monitor.assertOriginalIdentity()).rejects.toThrow('Original input monitor');
});

test('identity guard rejects replacement, rewrite with restored mtime, and parent changes', async () => {
  for (const mutation of ['replacement', 'restored-mtime', 'parent-mode'] as const) {
    const f = await fixture();
    const { chmod, utimes } = await import('node:fs/promises');
    await chmod(f.path, 0o600);
    const original = await lstat(f.path);
    const monitor = await monitorOriginalInputs({ input: f.binding });
    closes.push(monitor.close);
    await monitor.assertOriginalIdentity();
    if (mutation === 'replacement') {
      const replacement = join(f.root, 'replacement.private');
      await writeFile(replacement, 'original', { mode: 0o600 });
      await rename(replacement, f.path);
    } else if (mutation === 'restored-mtime') {
      await writeFile(f.path, 'changed!');
      await utimes(f.path, original.atime, original.mtime);
    } else {
      await chmod(f.root, 0o500);
    }
    await expect(monitor.assertOriginalIdentity()).rejects.toThrow('Original input monitor');
    await expect(monitor.assertOriginal()).rejects.toThrow('Original input monitor');
    if (mutation === 'parent-mode') await chmod(f.root, 0o700);
  }
});
