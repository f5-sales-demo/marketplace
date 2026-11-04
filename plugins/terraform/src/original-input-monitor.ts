import { createHash } from 'node:crypto';
import { constants, type FSWatcher, watch } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

const keys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
export type OriginalInputIdentity = Readonly<Record<(typeof keys)[number], string>>;
const parentKeys = ['dev', 'ino', 'uid', 'mode'] as const;
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
    throw new Error('Original input monitor requires owned bounded single-link files');
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
  let closed = false;
  const close = () => {
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const observe = (watcher: FSWatcher) => {
    watchers.push(watcher);
    watcher.on('error', () => {
      refused = true;
    });
  };
  const assertOriginal = async () => {
    if (refused || closed) throw new Error('Original input monitor remains refused or closed');
    try {
      for (const { binding, file, parent } of originals) {
        const current = await metadata(binding.path);
        if (keys.some((key) => current[key].toString() !== file[key]))
          throw new Error('Original input identity changed');
        const currentParent = await lstat(dirname(binding.path), { bigint: true });
        if (
          !currentParent.isDirectory() ||
          currentParent.isSymbolicLink() ||
          parentKeys.some((key) => currentParent[key].toString() !== parent[key]) ||
          (await realpath(binding.path)) !== binding.path
        )
          throw new Error('Original input parent changed');
        const handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const opened = await handle.stat({ bigint: true });
          if (keys.some((key) => opened[key].toString() !== file[key]))
            throw new Error('Original input changed during open');
          if (hash(await handle.readFile()) !== binding.sha256) throw new Error('Original input bytes changed');
        } finally {
          await handle.close();
        }
        const after = await metadata(binding.path);
        if (keys.some((key) => after[key].toString() !== file[key]) || refused || closed)
          throw new Error('Original input changed during read');
      }
    } catch {
      refused = true;
      throw new Error('Original input monitor detected a changed identity or bytes');
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
          refused = true;
        }),
      );
      observe(
        watch(dirname(binding.path), { persistent: false }, (_event, name) => {
          if (!name || name.toString() === basename(binding.path)) refused = true;
        }),
      );
      originals.push({
        binding,
        file,
        parent: parentIdentity,
      });
    }
    await assertOriginal();
    return Object.freeze({ assertOriginal, close });
  } catch (error) {
    close();
    throw error;
  }
}
