import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainOwnedTestCapture } from './retained-test-capture';

test('private captures and immutable manifest survive deletion of the original fixture on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-retention-source-'));
  let retained: string | undefined;
  try {
    await mkdir(join(root, 'guest'), { mode: 0o700 });
    await writeFile(join(root, 'guest', 'partial.private.bin'), 'OFFLINE_PARTIAL_CAPTURE', { mode: 0o400 });
    const result = await retainOwnedTestCapture(root, 'offline-capture', 'failure');
    retained = result.directory;
    await rm(root, { recursive: true });
    expect(await readFile(join(result.directory, 'capture', 'guest', 'partial.private.bin'), 'utf8')).toBe(
      'OFFLINE_PARTIAL_CAPTURE',
    );
    const manifest = JSON.parse(await readFile(join(result.directory, 'manifest.private.json'), 'utf8'));
    expect(manifest.outcome).toBe('failure');
    expect(manifest.guestAcceptanceComplete).toBe(false);
    expect(manifest.files).toHaveLength(1);
    expect(manifest.files[0].stable).toBe(true);
    expect(manifest.files[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
    if (retained) await rm(retained, { recursive: true });
  }
});

test('capture retention refuses symlinks and preserves a partial manifest without reading foreign bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-retention-source-'));
  const outside = await mkdtemp(join(tmpdir(), 'capture-retention-foreign-'));
  let retained: string | undefined;
  try {
    await writeFile(join(outside, 'foreign'), 'FOREIGN_BYTES', { mode: 0o400 });
    await symlink(join(outside, 'foreign'), join(root, 'foreign-link'));
    try {
      await retainOwnedTestCapture(root, 'offline-capture', 'failure');
      throw new Error('Expected source-link refusal');
    } catch (error) {
      retained = (error as { directory?: string }).directory;
      expect(retained).toBeDefined();
      const manifest = JSON.parse(await readFile(join(String(retained), 'manifest.private.json'), 'utf8'));
      expect(manifest.status).toBe('incomplete');
      expect(manifest.files).toHaveLength(0);
      expect(manifest.guestAcceptanceComplete).toBe(false);
    }
  } finally {
    await rm(root, { recursive: true });
    await rm(outside, { recursive: true });
    if (retained) await rm(retained, { recursive: true });
  }
});

test('a nonprivate source or injected label cannot select an archive destination', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capture-retention-source-'));
  try {
    await expect(retainOwnedTestCapture(root, '../foreign', 'success')).rejects.toThrow(/label/);
    await chmod(root, 0o755);
    await expect(retainOwnedTestCapture(root, 'offline-capture', 'success')).rejects.toThrow(/private/);
  } finally {
    await rm(root, { recursive: true });
  }
});
