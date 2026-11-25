import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOriginalInputDigest } from '../src/original-input-digest';

async function fixture(bytes: Buffer) {
  const directory = await mkdtemp(join(tmpdir(), 'original-digest-'));
  const path = join(directory, 'artifact.bin');
  await writeFile(path, bytes, { mode: 0o600 });
  const handle = await open(path, 'r');
  return {
    handle,
    close: async () => {
      await handle.close();
      await rm(directory, { recursive: true });
    },
  };
}
test('hashes the entire original artifact from its bound descriptor, including empty bytes and a final partial chunk', async () => {
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('example-original-bytes'),
    Buffer.alloc(32 * 1024 * 1024 + 17, 0x31),
  ]) {
    const f = await fixture(bytes);
    try {
      await f.handle.read(Buffer.alloc(3), 0, 3, null);
      expect(await readOriginalInputDigest(f.handle, () => {})).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect((await f.handle.stat()).size).toBe(bytes.length);
    } finally {
      await f.close();
    }
  }
});
test('refuses a retired original source during hashing and retains the caller-owned descriptor', async () => {
  const f = await fixture(Buffer.alloc(64 * 1024 * 1024, 0x32));
  const refused = new Error('Original source retired during verification');
  let inspections = 0;
  try {
    await expect(
      readOriginalInputDigest(f.handle, () => {
        if (++inspections === 3) throw refused;
      }),
    ).rejects.toBe(refused);
    expect(inspections).toBe(3);
    expect((await f.handle.stat()).size).toBe(64 * 1024 * 1024);
  } finally {
    await f.close();
  }
});
test('requires fresh original authority before returning even an empty artifact digest', async () => {
  const f = await fixture(Buffer.alloc(0));
  const refused = new Error('Original authority changed');
  let checks = 0;
  try {
    await expect(
      readOriginalInputDigest(f.handle, () => {
        if (++checks === 2) throw refused;
      }),
    ).rejects.toBe(refused);
  } finally {
    await f.close();
  }
});
test('does not reopen an unavailable original descriptor or substitute a path', async () => {
  const f = await fixture(Buffer.from('example-original'));
  await f.handle.close();
  try {
    await expect(readOriginalInputDigest(f.handle, () => {})).rejects.toThrow();
  } finally {
    await f.close();
  }
});
