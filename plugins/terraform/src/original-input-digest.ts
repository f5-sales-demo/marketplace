import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';

/** Hash all bytes from the already-bound descriptor with bounded buffering.
 * The caller owns the descriptor and verifies file and parent identity before
 * and after this read. Every chunk retains its original authority guard. */
export async function readOriginalInputDigest(handle: FileHandle, assertOriginal: () => void): Promise<string> {
  assertOriginal();
  const hash = createHash('sha256');
  for await (const chunk of handle.createReadStream({ autoClose: false, start: 0, highWaterMark: 16 * 1024 * 1024 })) {
    assertOriginal();
    hash.update(chunk);
  }
  assertOriginal();
  return hash.digest('hex');
}
