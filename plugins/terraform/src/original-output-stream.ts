import { createHash, type Hash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { linuxMonotonicMs } from './linux-clock';

type Channel = 'stdout' | 'stderr';
type Identity = Readonly<{ pid: number; group: number; start: string; boot: string }>;
type Metadata = BigIntStats;
const stableKeys = ['dev', 'ino', 'uid', 'nlink', 'mode'] as const;
const parentKeys = ['dev', 'ino', 'uid', 'mode'] as const;
const maximumChunk = 65536;
const maximumRetention = 64 * 1024 * 1024;
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

export interface OriginalOutputChunk {
  readonly offset: number;
  readonly endOffset: number;
  readonly bytes: Buffer;
  readonly sha256: string;
}
export interface OriginalOutputCompletion {
  readonly stdout: Readonly<{ bytes: number; sha256: string }>;
  readonly stderr: Readonly<{ bytes: number; sha256: string }>;
  readonly originalGroupClosed: true;
  readonly applyRpcQualified: false;
  readonly originalInsertQualified: false;
}
export interface OriginalExecutionOutput {
  read(channel: Channel): Promise<OriginalOutputChunk | null>;
  finish(): Promise<OriginalOutputCompletion>;
}
interface OriginalRecordOrigin {
  output: OriginalExecutionOutput;
  identity: Identity;
  assertValid(): void;
}
const chunkOrigins = new WeakMap<OriginalOutputChunk, OriginalRecordOrigin & { channel: Channel; bytes: Buffer }>();
const completionOrigins = new WeakMap<OriginalOutputCompletion, OriginalRecordOrigin>();
/** Private source bytes, not a receipt deserializer or path-only assertion. */
export function readOriginalExecutionChunk(
  output: OriginalExecutionOutput,
  chunk: OriginalOutputChunk,
  channel: Channel,
) {
  const origin = chunkOrigins.get(chunk);
  if (!origin || origin.output !== output || origin.channel !== channel)
    throw new Error('An original executor-issued channel record is required');
  origin.assertValid();
  return Object.freeze({
    identity: origin.identity,
    offset: chunk.offset,
    endOffset: chunk.endOffset,
    sha256: chunk.sha256,
    bytes: Buffer.from(origin.bytes),
  });
}
export function readOriginalExecutionCompletion(output: OriginalExecutionOutput, completion: OriginalOutputCompletion) {
  const origin = completionOrigins.get(completion);
  if (!origin || origin.output !== output) throw new Error('An original executor-issued completion is required');
  origin.assertValid();
  return Object.freeze({ identity: origin.identity, completion });
}
class OutputNotReady extends Error {}
class OutputRefusal extends Error {}
interface Stream {
  path: string;
  reader: FileHandle;
  writer: FileHandle;
  original: Metadata;
  parent: Metadata;
  descriptor: 1 | 2;
  offset: number;
  hash: Hash;
}

/** Called by the gated executor with its actual retained writer handles.
 * No receipt deserializer, tool argument or file-path-only reader can mint this
 * live capability. Descriptor admission remains separate from provider/RPC and
 * cloud incarnation qualification.
 */
export async function bindOriginalExecutionOutput(input: {
  identity: Identity;
  stdout: { path: string; writer: FileHandle };
  stderr: { path: string; writer: FileHandle };
  maximum: number;
  assertInputs(): Promise<void>;
  originalGroupClosed(): Promise<boolean>;
}) {
  const identity = Object.freeze({ ...input.identity });
  const maximum = Math.min(input.maximum, maximumRetention);
  const streams = {} as Record<Channel, Stream>;
  let refused = false;
  let closed = false;
  let busy = false;
  let phase = 'admission';
  let failureRecord: Promise<void> | undefined;
  const close = async () => {
    closed = true;
    await Promise.all(Object.values(streams).map((s) => s.reader.close()));
  };
  const retainFailure = (error: unknown) => {
    if (!failureRecord)
      failureRecord = (async () => {
        const stream = streams.stdout;
        if (!stream) throw new Error('Original private failure directory unavailable');
        const parent = await lstat(dirname(stream.path), { bigint: true });
        if (
          !parent.isDirectory() ||
          parent.isSymbolicLink() ||
          parentKeys.some((key) => parent[key] !== stream.parent[key])
        )
          throw new Error('Original private failure directory changed');
        const message = error instanceof Error ? error.message : 'Unknown original capture failure';
        const payload = JSON.stringify({
          schemaVersion: 1,
          kind: 'original-output-capture-failure',
          identity,
          phase,
          errorName: error instanceof Error ? error.name.slice(0, 64) : 'unknown',
          code:
            error instanceof Error && typeof (error as NodeJS.ErrnoException).code === 'string'
              ? (error as NodeJS.ErrnoException).code?.slice(0, 64)
              : null,
          message: message.slice(0, 4096),
          messageTruncated: message.length > 4096,
          messageSha256: digest(Buffer.from(message)),
          offsets: { stdout: streams.stdout?.offset ?? 0, stderr: streams.stderr?.offset ?? 0 },
          applyRpcQualified: false,
          originalInsertQualified: false,
        });
        const file = await open(
          join(dirname(stream.path), 'output-capture-failure.private.json'),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o400,
        );
        try {
          await file.writeFile(payload);
          await file.sync();
        } finally {
          await file.close();
        }
      })();
    return failureRecord;
  };
  const assertOpen = () => {
    if (closed) throw new OutputRefusal('Original output capture closed');
    if (refused) throw new OutputRefusal('Original output capture refused');
  };
  const groupClosed = async () => {
    try {
      return await input.originalGroupClosed();
    } catch {
      refused = true;
      throw new OutputRefusal('Original output group closure unavailable');
    }
  };
  const waitForOriginalClosingGroup = async () => {
    if (await groupClosed()) return true;
    phase = 'original-closing';
    if ((await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() !== identity.boot)
      throw new OutputRefusal('Original output producer boot changed');
    try {
      const raw = await readFile(`/proc/${identity.pid}/stat`, 'utf8');
      const fields = raw
        .slice(raw.lastIndexOf(') ') + 2)
        .trim()
        .split(/\s+/);
      if (
        fields[19] !== identity.start ||
        Number(fields[1]) !== process.pid ||
        Number(fields[2]) !== identity.group ||
        Number(fields[3]) !== identity.group
      )
        throw new OutputRefusal('Original output closing producer identity changed');
      if (!['Z', 'X', 'x'].includes(fields[0])) return false;
    } catch (error) {
      if (!(error instanceof Error) || !['ENOENT', 'ESRCH'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error;
    }
    // A dying or already missing original leader can outlive its /proc/fd view.
    // Wait for that exact group's independent closure, never for a replacement.
    // The original input/deadline guard remains active and this bound cannot reset.
    const deadline = linuxMonotonicMs() + 1000;
    while (linuxMonotonicMs() < deadline) {
      await input.assertInputs();
      if (await groupClosed()) return true;
      await Bun.sleep(25);
    }
    return false;
  };
  const guard = async (stream: Stream, afterOriginalExit = false): Promise<BigIntStats> => {
    assertOpen();
    phase = 'input-lifetime';
    await input.assertInputs();
    phase = 'file-metadata';
    const [current, writer, opened, parent] = await Promise.all([
      lstat(stream.path, { bigint: true }),
      stream.writer.stat({ bigint: true }),
      stream.reader.stat({ bigint: true }),
      lstat(dirname(stream.path), { bigint: true }),
    ]);
    if (
      !current.isFile() ||
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      stableKeys.some((key) => [current, writer, opened].some((value) => value[key] !== stream.original[key])) ||
      parentKeys.some((key) => parent[key] !== stream.parent[key]) ||
      (await realpath(stream.path)) !== stream.path
    )
      throw new OutputRefusal('Original output file or parent identity changed');
    if (current.size < BigInt(stream.offset)) throw new OutputRefusal('Original output retained prefix truncated');
    if (current.size > BigInt(maximum)) throw new OutputRefusal('Original output capture limit exceeded');
    phase = 'original-group';
    if (!(await groupClosed())) {
      if (afterOriginalExit) throw new OutputRefusal('Original output producer closure changed');
      try {
        phase = 'producer-metadata';
        const raw = await readFile(`/proc/${identity.pid}/stat`, 'utf8');
        const fields = raw
          .slice(raw.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/);
        const [boot, producer] = await Promise.all([
          readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
          stat(`/proc/${identity.pid}/fd/${stream.descriptor}`, { bigint: true }),
        ]);
        if (
          boot.trim() !== identity.boot ||
          fields[19] !== identity.start ||
          Number(fields[1]) !== process.pid ||
          Number(fields[2]) !== identity.group ||
          Number(fields[3]) !== identity.group ||
          stableKeys.some((key) => producer[key] !== stream.original[key])
        )
          throw new OutputRefusal('Original output producer or descriptor identity changed');
      } catch (error) {
        const missing =
          error instanceof Error && ['ENOENT', 'ESRCH', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '');
        if (!missing || !(await waitForOriginalClosingGroup())) throw error;
        // Losing /proc during natural exit is not EOF proof. Only a fresh
        // independent query of that same original group allows a final read;
        // repeat every input/file/parent/descriptor check without adopting a PID.
        return guard(stream, true);
      }
    }
    return current;
  };
  const readAt = async (stream: Stream, offset: number, length: number) => {
    phase = 'retained-read';
    const bytes = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const result = await stream.reader.read(bytes, read, length - read, offset + read);
      if (!result.bytesRead) throw new OutputRefusal('Original output retained bytes truncated');
      read += result.bytesRead;
    }
    return bytes;
  };
  const verifyPrefix = async (stream: Stream) => {
    phase = 'retained-prefix';
    const prefix = createHash('sha256');
    for (let offset = 0; offset < stream.offset; offset += maximumChunk)
      prefix.update(await readAt(stream, offset, Math.min(maximumChunk, stream.offset - offset)));
    if (prefix.digest('hex') !== stream.hash.copy().digest('hex')) {
      phase = 'retained-prefix';
      throw new OutputRefusal('Original output retained prefix changed');
    }
  };
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    assertOpen();
    if (busy) {
      refused = true;
      throw new OutputRefusal('Concurrent original output capture refused');
    }
    busy = true;
    try {
      return await action();
    } catch (error) {
      if (error instanceof OutputNotReady) throw error;
      refused = true;
      try {
        await retainFailure(error);
      } catch (persistence) {
        throw new AggregateError([error, persistence], 'Original private capture failure unresolved');
      }
      if (error instanceof OutputRefusal) throw error;
      throw new OutputRefusal('Original output capture identity or lifetime unavailable');
    } finally {
      busy = false;
    }
  };
  try {
    if (!Number.isSafeInteger(maximum) || maximum < 1) throw new OutputRefusal('Original output bound required');
    for (const channel of ['stdout', 'stderr'] as const) {
      const selected = input[channel];
      const original = await selected.writer.stat({ bigint: true });
      const parent = await lstat(dirname(selected.path), { bigint: true });
      if (
        !original.isFile() ||
        original.uid !== BigInt(process.getuid?.() ?? -1) ||
        original.nlink !== 1n ||
        (original.mode & 0o077n) !== 0n ||
        original.size !== 0n ||
        !parent.isDirectory() ||
        parent.uid !== BigInt(process.getuid?.() ?? -1) ||
        (parent.mode & 0o077n) !== 0n
      )
        throw new OutputRefusal('Original private empty output descriptor required');
      const reader = await open(selected.path, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stream: Stream = {
        path: selected.path,
        writer: selected.writer,
        reader,
        original,
        parent,
        descriptor: channel === 'stdout' ? 1 : 2,
        offset: 0,
        hash: createHash('sha256'),
      };
      streams[channel] = stream;
      await guard(stream);
    }
    const output: OriginalExecutionOutput = Object.freeze({
      read: (channel: Channel) =>
        exclusive(async () => {
          if (channel !== 'stdout' && channel !== 'stderr') throw new OutputRefusal('Original output channel required');
          const stream = streams[channel];
          const before = await guard(stream);
          await verifyPrefix(stream);
          const length = Math.min(maximumChunk, Number(before.size) - stream.offset);
          const bytes = await readAt(stream, stream.offset, length);
          await guard(stream);
          // Include these exact bytes in the checked prefix before publishing them.
          const check = await readAt(stream, stream.offset, length);
          if (!bytes.equals(check)) throw new OutputRefusal('Original output bytes changed during read');
          await verifyPrefix(stream);
          assertOpen();
          if (!length) return null;
          const offset = stream.offset;
          stream.offset += length;
          stream.hash.update(bytes);
          const chunk = Object.freeze({ offset, endOffset: stream.offset, bytes, sha256: digest(bytes) });
          chunkOrigins.set(chunk, {
            output,
            identity,
            channel,
            bytes: Buffer.from(bytes),
            assertValid: () => {
              if (refused) throw new Error('Original output record source is refused');
            },
          });
          return chunk;
        }),
      finish: async () => {
        assertOpen();
        // Readiness can be polled; it neither renews the budget nor admits EOF.
        if (!(await groupClosed())) throw new OutputRefusal('Original output producer group remains live');
        return exclusive(async () => {
          const result = {} as Record<Channel, Readonly<{ bytes: number; sha256: string }>>;
          for (const channel of ['stdout', 'stderr'] as const) {
            const stream = streams[channel];
            const before = await guard(stream);
            if (before.size !== BigInt(stream.offset)) throw new OutputNotReady('Original output unconsumed');
            await verifyPrefix(stream);
            const after = await guard(stream);
            if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
              throw new OutputRefusal('Original output changed after producer closure');
            result[channel] = Object.freeze({ bytes: stream.offset, sha256: stream.hash.copy().digest('hex') });
          }
          const completion = Object.freeze({
            ...result,
            originalGroupClosed: true as const,
            applyRpcQualified: false as const,
            originalInsertQualified: false as const,
          });
          completionOrigins.set(completion, {
            output,
            identity,
            assertValid: () => {
              if (refused) throw new Error('Original completion source is refused');
            },
          });
          return completion;
        });
      },
    });
    return { output, close };
  } catch (error) {
    await close();
    if (error instanceof OutputRefusal) throw error;
    throw new OutputRefusal('Original output descriptor admission unavailable');
  }
}
