import type { BigIntStats } from 'node:fs';

/** Source-owned eligibility for an ordinary executable. Root ownership is a
 * system installation mapping; setuid/setgid and writable binaries never enter
 * the native gate. Original bytes, path/link identity and lifetime remain pinned
 * independently by the caller. No file ownership or permissions are changed. */
export function assertPinnedExecutableMetadata(
  original: Pick<BigIntStats, 'uid' | 'mode' | 'nlink' | 'isFile'>,
  invokerUid: number,
): void {
  if (
    !Number.isSafeInteger(invokerUid) ||
    invokerUid < 0 ||
    !original.isFile() ||
    (original.uid !== 0n && original.uid !== BigInt(invokerUid)) ||
    original.nlink !== 1n ||
    (original.mode & 0o6022n) !== 0n ||
    (original.mode & 0o111n) === 0n
  )
    throw new Error('Owned pinned original executable required');
}
