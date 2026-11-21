import { createHash } from 'node:crypto';

/** Record validation only, never lock-closure authority. The process-lock
 * scanner supplies the actual procfs read; injected reads are offline fixtures. */
export async function readLinuxProcessGroupRecord(pid: number, readRecord: () => Promise<string>): Promise<number> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Original executor PID is unavailable');
  let text = await readRecord();
  // A task may exit between opening procfs and its first read. Do not interpret
  // an empty record as group zero or absence. Require a new complete record or
  // propagate the actual second syscall error to the disappearance classifier.
  if (text.length === 0) text = await readRecord();
  const end = text.lastIndexOf(') ');
  const header = text.match(/^([1-9][0-9]*) \(/);
  const fields =
    end < 0
      ? []
      : text
          .slice(end + 2)
          .trim()
          .split(/\s+/);
  const group = Number(fields[2]);
  if (
    header?.[1] !== String(pid) ||
    end < (header?.[0].length ?? 0) ||
    !/^[RSDZTtXxKWPI]$/.test(fields[0] ?? '') ||
    !/^[0-9]+$/.test(fields[19] ?? '') ||
    !/^[0-9]+$/.test(fields[2] ?? '') ||
    !Number.isSafeInteger(group) ||
    group < 0
  ) {
    const sha256 = createHash('sha256').update(text).digest('hex');
    throw new Error(
      `Original executor group is unavailable (pid=${pid}, bytes=${Buffer.byteLength(text)}, sha256=${sha256})`,
    );
  }
  return group;
}
