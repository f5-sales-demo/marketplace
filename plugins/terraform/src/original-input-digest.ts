import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';

/** Hash all bytes from the already-bound descriptor with bounded buffering.
 * The caller owns the descriptor and verifies file and parent identity before
 * and after this read. Every read retains fresh authority on both sides of I/O;
 * explicit positions preserve the caller's cursor and prevent read-ahead. */
export async function readOriginalInputDigest(handle: FileHandle, assertOriginal: () => void): Promise<string> {
  assertOriginal();
  const size = (await handle.stat()).size;
  assertOriginal();
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Bounded original input size required');
  const buffer = Buffer.allocUnsafe(Math.max(1, Math.min(size, 16 * 1024 * 1024)));
  const hash = createHash('sha256');
  let position = 0;
  while (true) {
    assertOriginal();
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    assertOriginal();
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
    if (!Number.isSafeInteger(position)) throw new Error('Bounded original input position required');
  }
  assertOriginal();
  return hash.digest('hex');
}
