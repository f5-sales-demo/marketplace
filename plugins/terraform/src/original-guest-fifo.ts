import { dlopen, FFIType, ptr } from 'bun:ffi';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { linuxMonotonicMs } from './linux-clock';
import { OriginalGuestControlFrames } from './original-guest-control';
import type { OriginalGuestControlPeer } from './original-guest-parent';

type Message = Record<string, unknown>;
type Stat = BigIntStats;
const identity = (info: Stat) => ({
  dev: String(info.dev),
  ino: String(info.ino),
  uid: String(info.uid),
  mode: String(info.mode),
  nlink: String(info.nlink),
});
const same = (a: ReturnType<typeof identity>, b: ReturnType<typeof identity>) =>
  Object.keys(a).every((key) => a[key as keyof typeof a] === b[key as keyof typeof b]);
export interface OriginalGuestFifoBinding {
  readonly path: string;
  readonly identity: Readonly<ReturnType<typeof identity>>;
}
export interface OriginalGuestFifoOptions {
  readonly root: string;
  readonly session: string;
  /** Compiled installed caller verifies its original inputs and admitted worker actor. */
  assertOriginal(): Promise<void>;
}
function privateDirectory(info: Stat): boolean {
  return (
    info.isDirectory() &&
    !info.isSymbolicLink() &&
    info.uid === BigInt(process.getuid?.() ?? -1) &&
    (info.mode & 0o777n) === 0o700n
  );
}

/** Real owned nonblocking Linux FIFOs. Closing IPC never proves worker or descendant closure. */
export async function openOriginalGuestFifoPeer(options: OriginalGuestFifoOptions): Promise<
  OriginalGuestControlPeer & {
    readonly bindings: Readonly<{ root: string; read: OriginalGuestFifoBinding; write: OriginalGuestFifoBinding }>;
  }
> {
  if (
    process.platform !== 'linux' ||
    !isAbsolute(options.root) ||
    resolve(options.root) !== options.root ||
    Array.from(options.root).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    typeof options.assertOriginal !== 'function'
  )
    throw new Error('Original private Linux guest IPC admission required');
  const frames = new OriginalGuestControlFrames(options.session);
  const parent = dirname(options.root);
  if ((await realpath(parent)) !== parent || !privateDirectory(await lstat(parent, { bigint: true })))
    throw new Error('Original private guest IPC parent required');
  await mkdir(options.root, { mode: 0o700 });
  const originalRoot = await lstat(options.root, { bigint: true });
  const rootIdentity = { dev: originalRoot.dev, ino: originalRoot.ino, uid: originalRoot.uid, mode: originalRoot.mode };
  const assertCaller = options.assertOriginal.bind(options);
  const paths = { request: join(options.root, 'request.fifo'), response: join(options.root, 'response.fifo') };
  const libc = dlopen('libc.so.6', { mkfifo: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 } });
  try {
    for (const path of Object.values(paths)) {
      const raw = Buffer.concat([Buffer.from(path), Buffer.from([0])]);
      if (libc.symbols.mkfifo(ptr(raw), 0o600) !== 0) throw new Error('Original guest FIFO creation failed');
    }
  } finally {
    libc.close();
  }
  const handles: Array<{ path: string; handle: FileHandle; original: ReturnType<typeof identity> }> = [];
  const bind = async (path: string, fifo: boolean) => {
    const before = await lstat(path, { bigint: true });
    if (
      (fifo ? !before.isFIFO() : !before.isFile()) ||
      before.uid !== BigInt(process.getuid?.() ?? -1) ||
      before.nlink !== 1n ||
      (before.mode & 0o777n) !== 0o600n
    )
      throw new Error('Original private guest IPC file required');
    const handle = await open(path, constants.O_RDWR | constants.O_NOFOLLOW | (fifo ? constants.O_NONBLOCK : 0));
    const original = identity(before);
    if (!same(identity(await handle.stat({ bigint: true })), original))
      throw new Error('Original guest IPC descriptor changed during open');
    handles.push({ path, handle, original });
    return { handle, binding: Object.freeze({ path, identity: Object.freeze(original) }) };
  };
  const request = await bind(paths.request, true),
    response = await bind(paths.response, true);
  const logs: Record<string, FileHandle> = {};
  for (const name of ['intent', 'delivered', 'observed']) {
    const path = join(options.root, `${name}.private.bin`);
    const file = await open(path, 'wx', 0o600);
    await file.close();
    logs[name] = (await bind(path, false)).handle;
  }
  let retired = false,
    reading = false,
    writing = false;
  const queue: Message[] = [];
  const assertFiles = async () => {
    if (retired) throw new Error('Original guest FIFO peer retired');
    const actual = await lstat(options.root, { bigint: true });
    if (
      !privateDirectory(actual) ||
      (await realpath(options.root)) !== options.root ||
      actual.dev !== rootIdentity.dev ||
      actual.ino !== rootIdentity.ino ||
      actual.uid !== rootIdentity.uid ||
      actual.mode !== rootIdentity.mode
    )
      throw new Error('Original guest IPC directory changed');
    for (const bound of [request, response]) {
      if (
        !same(identity(await lstat(bound.binding.path, { bigint: true })), bound.binding.identity) ||
        !same(identity(await bound.handle.stat({ bigint: true })), bound.binding.identity)
      )
        throw new Error('Original guest FIFO path or descriptor changed');
    }
    for (const bound of handles)
      if (
        !same(identity(await lstat(bound.path, { bigint: true })), bound.original) ||
        !same(identity(await bound.handle.stat({ bigint: true })), bound.original)
      )
        throw new Error('Original guest IPC journal path or descriptor changed');
  };
  const check = async (deadline: number) => {
    const now = linuxMonotonicMs();
    if (!Number.isSafeInteger(deadline) || deadline <= now || deadline - now > 60000)
      throw new Error('Original guest FIFO deadline exhausted or exceeds bound');
    await assertFiles();
    await assertCaller();
    await assertFiles();
    if (linuxMonotonicMs() >= deadline) throw new Error('Original guest FIFO deadline exhausted');
  };
  const record = async (name: string, raw: Uint8Array) => {
    await logs[name].writeFile(raw);
    await logs[name].sync();
  };
  const retire = async () => {
    if (retired) return;
    retired = true;
    const failures: unknown[] = [];
    for (const bound of handles) {
      try {
        if (!same(identity(await bound.handle.stat({ bigint: true })), bound.original))
          throw new Error('Original guest IPC descriptor ownership changed before retirement');
        await bound.handle.close();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Original guest IPC retirement unresolved');
  };
  return Object.freeze({
    // Directions describe the worker: read parent requests, write worker responses.
    bindings: Object.freeze({ root: options.root, read: request.binding, write: response.binding }),
    async assertOriginal() {
      await assertFiles();
      await assertCaller();
      await assertFiles();
    },
    retire,
    async send(message: Message, deadline: number) {
      if (writing) throw new Error('Original guest FIFO concurrent write refused');
      writing = true;
      try {
        await check(deadline);
        const raw = frames.encode(message);
        await record('intent', raw);
        for (let offset = 0; offset < raw.length; ) {
          await check(deadline);
          try {
            const { bytesWritten } = await request.handle.write(raw, offset, Math.min(4096, raw.length - offset), null);
            if (!bytesWritten) throw new Error('Original guest FIFO write interrupted');
            await record('delivered', raw.subarray(offset, offset + bytesWritten));
            offset += bytesWritten;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
            await Bun.sleep(Math.min(10, Math.max(0, deadline - linuxMonotonicMs())));
          }
        }
        await check(deadline);
      } finally {
        writing = false;
      }
    },
    async receive(deadline: number) {
      if (reading) throw new Error('Original guest FIFO concurrent read refused');
      reading = true;
      try {
        while (!queue.length) {
          await check(deadline);
          const raw = Buffer.alloc(4096);
          try {
            const { bytesRead } = await response.handle.read(raw, 0, raw.length, null);
            if (!bytesRead) throw new Error('Original guest FIFO frame interrupted');
            await record('observed', raw.subarray(0, bytesRead));
            queue.push(...frames.push(raw.subarray(0, bytesRead)));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
            await Bun.sleep(Math.min(10, Math.max(0, deadline - linuxMonotonicMs())));
          }
        }
        await check(deadline);
        const value = queue.shift();
        if (!value) throw new Error('Original guest FIFO message unavailable');
        return value;
      } finally {
        reading = false;
      }
    },
  });
}
