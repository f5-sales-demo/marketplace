import { createHash } from 'node:crypto';
import { constants, type FSWatcher, watch } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

/** Sanitized first-refusal attribution; never retains paths, bytes or raw filesystem errors. */
export type OriginalInputMonitorReason =
  | 'monitor-closed'
  | 'watcher-event'
  | 'watcher-error'
  | 'file-metadata-invalid'
  | 'file-identity-changed'
  | 'parent-identity-changed'
  | 'open-identity-changed'
  | 'bytes-changed'
  | 'read-identity-changed'
  | 'filesystem-read-unavailable';
export class OriginalInputMonitorError extends Error {
  readonly reason: OriginalInputMonitorReason;
  constructor(reason: OriginalInputMonitorReason) {
    super('Original input monitor detected a changed identity or bytes');
    this.name = 'OriginalInputMonitorError';
    this.reason = reason;
  }
}

const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
export type OriginalInputIdentity = Readonly<Record<(typeof keys)[number], string>>;
const parentKeys = ['dev', 'ino', 'uid', 'mode'] as const;
/** Compare a selected source before the private snapshot handoff. */
export function assertSameOriginalInput(original: OriginalInputBinding, current: OriginalInputBinding) {
  if (
    original.path !== current.path ||
    original.sha256 !== current.sha256 ||
    !original.expectedIdentity ||
    !current.expectedIdentity ||
    !original.expectedParentIdentity ||
    !current.expectedParentIdentity ||
    keys.some(
      (key) =>
        typeof original.expectedIdentity?.[key] !== 'string' ||
        original.expectedIdentity[key] !== current.expectedIdentity?.[key],
    ) ||
    parentKeys.some(
      (key) =>
        typeof original.expectedParentIdentity?.[key] !== 'string' ||
        original.expectedParentIdentity[key] !== current.expectedParentIdentity?.[key],
    )
  )
    throw new Error('Original selected input identity or bytes changed');
}
export type OriginalInputParentIdentity = Readonly<Pick<OriginalInputIdentity, (typeof parentKeys)[number]>>;
export interface OriginalInputBinding {
  readonly path: string;
  readonly sha256: string;
  /** Mandatory for an admitted snapshot handoff: retain its original identity, never recapture it. */
  readonly expectedIdentity?: OriginalInputIdentity;
  readonly expectedParentIdentity?: OriginalInputParentIdentity;
}
const hash = (raw: Uint8Array) => createHash('sha256').update(raw).digest('hex');
const maximum = 256n * 1024n * 1024n;
const identity = (stat: Awaited<ReturnType<typeof metadata>>) =>
  Object.fromEntries(keys.map((key) => [key, stat[key].toString()])) as Record<(typeof keys)[number], string>;
async function metadata(path: string) {
  const stat = await lstat(path, { bigint: true });
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== BigInt(process.getuid?.() ?? -1) ||
    stat.nlink !== 1n ||
    (stat.mode & 0o022n) !== 0n ||
    stat.size < 1n ||
    stat.size > maximum
  )
    throw new OriginalInputMonitorError('file-metadata-invalid');
  return stat;
}

/** Retain one original file set through its owning lifetime. Closure does not prove executor or reader exit. */
export async function monitorOriginalInputs(input: Readonly<Record<string, OriginalInputBinding>>) {
  const bindings = Object.values(input).map((binding) => ({
    ...binding,
    expectedIdentity: binding.expectedIdentity ? { ...binding.expectedIdentity } : undefined,
    expectedParentIdentity: binding.expectedParentIdentity ? { ...binding.expectedParentIdentity } : undefined,
  }));
  if (!bindings.length || new Set(bindings.map((b) => b.path)).size !== bindings.length)
    throw new Error('Original input monitor requires a unique nonempty input set');
  const watchers: FSWatcher[] = [];
  const originals: Array<{
    binding: OriginalInputBinding;
    file: OriginalInputIdentity;
    parent: OriginalInputParentIdentity;
  }> = [];
  let refused = false;
  let firstRefusal: OriginalInputMonitorError | undefined;
  const latch = (reason: OriginalInputMonitorReason) => {
    refused = true;
    firstRefusal ??= new OriginalInputMonitorError(reason);
    return firstRefusal;
  };
  let closed = false;
  const close = () => {
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const observe = (watcher: FSWatcher) => {
    watchers.push(watcher);
    watcher.on('error', () => {
      latch('watcher-error');
    });
  };
  const inspectOriginal = async (verifyBytes: boolean) => {
    if (refused || closed) throw latch(closed ? 'monitor-closed' : 'watcher-event');
    try {
      for (const { binding, file, parent } of originals) {
        const current = await metadata(binding.path);
        if (keys.some((key) => current[key].toString() !== file[key]))
          throw new OriginalInputMonitorError('file-identity-changed');
        const currentParent = await lstat(dirname(binding.path), { bigint: true });
        if (
          !currentParent.isDirectory() ||
          currentParent.isSymbolicLink() ||
          parentKeys.some((key) => currentParent[key].toString() !== parent[key]) ||
          (await realpath(binding.path)) !== binding.path
        )
          throw new OriginalInputMonitorError('parent-identity-changed');
        const handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat({ bigint: true });
          if (keys.some((key) => opened[key].toString() !== file[key]))
            throw new OriginalInputMonitorError('open-identity-changed');
          if (verifyBytes && hash(await handle.readFile()) !== binding.sha256)
            throw new OriginalInputMonitorError('bytes-changed');
        } finally {
          await handle.close();
        }
        const after = await metadata(binding.path);
        if (keys.some((key) => after[key].toString() !== file[key]))
          throw new OriginalInputMonitorError('read-identity-changed');
        if (refused || closed) throw latch(closed ? 'monitor-closed' : 'watcher-event');
      }
    } catch (error) {
      throw latch(error instanceof OriginalInputMonitorError ? error.reason : 'filesystem-read-unavailable');
    }
  };
  try {
    for (const binding of bindings) {
      if (
        !isAbsolute(binding.path) ||
        resolve(binding.path) !== binding.path ||
        (await realpath(binding.path)) !== binding.path ||
        !/^[a-f0-9]{64}$/.test(binding.sha256)
      )
        throw new Error('Original input monitor requires canonical reviewed bindings');
      const stat = await metadata(binding.path);
      const parent = await lstat(dirname(binding.path), { bigint: true });
      if (
        !parent.isDirectory() ||
        parent.isSymbolicLink() ||
        parent.uid !== BigInt(process.getuid?.() ?? -1) ||
        (parent.mode & 0o022n) !== 0n
      )
        throw new Error('Original input monitor requires an owned parent');
      const file = binding.expectedIdentity ?? identity(stat);
      if (binding.expectedIdentity && !binding.expectedParentIdentity)
        throw new Error('Original input monitor requires the admitted parent identity');
      const parentIdentity = binding.expectedParentIdentity ?? {
        dev: parent.dev.toString(),
        ino: parent.ino.toString(),
        uid: parent.uid.toString(),
        mode: parent.mode.toString(),
      };
      if (parentKeys.some((key) => !/^(?:0|[1-9][0-9]*)$/.test(parentIdentity[key])))
        throw new Error('Original input monitor requires exact admitted parent identities');
      if (keys.some((key) => typeof file[key] !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(file[key])))
        throw new Error('Original input monitor requires exact admitted identities');
      observe(
        watch(binding.path, { persistent: false }, () => {
          latch('watcher-event');
        }),
      );
      observe(
        watch(dirname(binding.path), { persistent: false }, (_event, name) => {
          if (!name || name.toString() === basename(binding.path)) latch('watcher-event');
        }),
      );
      originals.push({
        binding,
        file,
        parent: parentIdentity,
      });
    }
    // Admission always hashes all bytes. Identity checks cannot be obtained before it succeeds.
    await inspectOriginal(true);
    return Object.freeze({
      assertOriginal: () => inspectOriginal(true),
      /** Continuous local identity check between full byte-verification boundaries.
       * Retains inode, ctime, mtime, size, owner, mode, parent and watcher checks,
       * including checks on the opened descriptor and after it closes. This does
       * not replace full digest verification before submission or final capture.
       */
      assertOriginalIdentity: () => inspectOriginal(false),
      close,
    });
  } catch (error) {
    close();
    throw error;
  }
}
