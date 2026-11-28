import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorOriginalInputs, type OriginalInputBinding } from '../src/original-input-monitor';

test('empty closed-output inputs require explicit exact empty identities and retain permanent mutation refusal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'original-empty-output-'));
  const path = join(root, 'stderr.private');
  await writeFile(path, '', { mode: 0o400 });
  const file = await lstat(path, { bigint: true }),
    parent = await lstat(root, { bigint: true });
  const binding: OriginalInputBinding = {
    path,
    sha256: createHash('sha256').update('').digest('hex'),
    expectedIdentity: Object.fromEntries(
      ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
        key,
        String(file[key as keyof typeof file]),
      ]),
    ) as OriginalInputBinding['expectedIdentity'],
    expectedParentIdentity: Object.fromEntries(
      ['dev', 'ino', 'uid', 'mode'].map((key) => [key, String(parent[key as keyof typeof parent])]),
    ) as OriginalInputBinding['expectedParentIdentity'],
  };
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  try {
    await expect(monitorOriginalInputs({ stderr: binding })).rejects.toThrow();
    await expect(
      monitorOriginalInputs({ stderr: { ...binding, sha256: 'a'.repeat(64) } }, { allowEmpty: ['stderr'] }),
    ).rejects.toThrow();
    const options = { allowEmpty: ['stderr'] };
    monitor = await monitorOriginalInputs({ stderr: binding }, options);
    options.allowEmpty.length = 0;
    await monitor.assertOriginalIdentity();
    await monitor.assertOriginal();
    await rm(path);
    await writeFile(path, '', { mode: 0o400 });
    await expect(monitor.assertOriginalIdentity()).rejects.toThrow();
    await expect(monitor.assertOriginal()).rejects.toThrow();
  } finally {
    monitor?.close();
    await rm(root, { recursive: true });
  }
});
