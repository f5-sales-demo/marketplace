import { createHash } from 'node:crypto';

export interface RejectedLinuxProcessGroupRecord {
  readonly kind: 'rejected-decoded-linux-process-record';
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly recordUtf8Base64: string;
  readonly truncated: boolean;
  readonly initialEmptyRead: boolean;
  readonly validation: Readonly<{
    headerMatches: boolean;
    delimiterValid: boolean;
    stateValid: boolean;
    startValid: boolean;
    groupNumeric: boolean;
    groupSafe: boolean;
  }>;
}
const rejectedRecords = new WeakMap<object, RejectedLinuxProcessGroupRecord>();
/** Only the native parser issues this bounded private diagnostic. Error output
 * carries hashes, never record bytes. Copies cannot manufacture source evidence.
 * This records rejection and grants neither process closure nor execution. */
export function readRejectedLinuxProcessGroupRecord(error: unknown): RejectedLinuxProcessGroupRecord | undefined {
  return error !== null && (typeof error === 'object' || typeof error === 'function')
    ? rejectedRecords.get(error)
    : undefined;
}

function splitProcessRecord(text: string) {
  const end = text.lastIndexOf(') ');
  const header = text.match(/^([1-9][0-9]*) \(/);
  const fields =
    end < 0
      ? []
      : text
          .slice(end + 2)
          .trim()
          .split(/\s+/);
  return { end, header, fields };
}

/** Record validation only, never lock-closure authority. The process-lock
 * scanner supplies the actual procfs read; injected reads are offline fixtures. */
export async function readLinuxProcessGroupRecord(pid: number, readRecord: () => Promise<string>): Promise<number> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Original executor PID is unavailable');
  let text = await readRecord();
  const initialEmptyRead = text.length === 0;
  let parsed = splitProcessRecord(text);
  // Linux do_task_stat retains ppid=0, pgid=-1 and sid=-1 when a dead
  // task no longer has lockable signal data. Neither that record nor an
  // empty read proves absence. One fresh read must provide a valid record
  // or propagate an actual syscall error to the disappearance classifier.
  // Empty and dead-task recovery share the same two-read bound.
  const deadTask =
    parsed.header?.[1] === String(pid) &&
    parsed.end >= (parsed.header?.[0].length ?? 0) &&
    parsed.fields[0] === 'X' &&
    parsed.fields[1] === '0' &&
    parsed.fields[2] === '-1' &&
    parsed.fields[3] === '-1' &&
    /^[0-9]+$/.test(parsed.fields[19] ?? '');
  if (initialEmptyRead || deadTask) {
    text = await readRecord();
    parsed = splitProcessRecord(text);
  }
  const { end, header, fields } = parsed;
  const group = Number(fields[2]);
  const validation = Object.freeze({
    headerMatches: header?.[1] === String(pid),
    delimiterValid: end >= (header?.[0].length ?? 0),
    stateValid: /^[RSDZTtXxKWPI]$/.test(fields[0] ?? ''),
    startValid: /^[0-9]+$/.test(fields[19] ?? ''),
    groupNumeric: /^[0-9]+$/.test(fields[2] ?? ''),
    groupSafe: Number.isSafeInteger(group) && group >= 0,
  });
  if (Object.values(validation).some((valid) => !valid)) {
    const bytes = Buffer.from(text, 'utf8');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const error = new Error(
      `Original executor group is unavailable (pid=${pid}, bytes=${bytes.length}, sha256=${sha256})`,
    );
    rejectedRecords.set(
      error,
      Object.freeze({
        schemaVersion: 1,
        kind: 'rejected-decoded-linux-process-record',
        pid,
        bytes: bytes.length,
        sha256,
        recordUtf8Base64: bytes.subarray(0, 16384).toString('base64'),
        truncated: bytes.length > 16384,
        initialEmptyRead,
        validation,
      }),
    );
    throw error;
  }

  return group;
}
