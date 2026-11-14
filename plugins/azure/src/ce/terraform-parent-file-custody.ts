import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

const identity = (value: Stats) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure parent private file: ${message}`);
}
/** Read private bytes through one non-following descriptor, retaining their native identity.
 * This supplies file custody only; semantic ownership and deletion authority remain the
 * owning parent inventory's responsibility.
 */
export async function readAzureTerraformParentPrivateFile(path: string, signal?: AbortSignal) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const step = async <T>(action: () => Promise<T>) => {
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  require(isAbsolute(path), 'absolute path required');
  const parent = dirname(path),
    directory = await step(() => lstat(parent));
  require(directory.isDirectory() &&
    !directory.isSymbolicLink() &&
    directory.uid === process.getuid?.() &&
    (directory.mode & 0o077) === 0 &&
    (await step(() => realpath(parent))) === parent, 'private parent directory differs');
  const namedBefore = await step(() => lstat(path));
  require(namedBefore.isFile() &&
    !namedBefore.isSymbolicLink() &&
    namedBefore.nlink === 1 &&
    namedBefore.uid === process.getuid?.() &&
    (namedBefore.mode & 0o077) === 0, 'private regular file required');
  const acquisition = open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  // If cancellation wins acquisition, close the eventual descriptor instead of leaking it.
  void acquisition.then(
    (handle) => {
      if (active.aborted) void handle.close().catch(() => {});
    },
    () => {},
  );
  const handle = await step(() => acquisition);
  try {
    const first = await step(() => handle.stat()),
      bytes = await step(() => handle.readFile()),
      after = await step(() => handle.stat()),
      named = await step(() => lstat(path)),
      parentAfter = await step(() => lstat(parent));
    require(first.isFile() &&
      first.uid === process.getuid?.() &&
      first.nlink === 1 &&
      (first.mode & 0o077) === 0 &&
      identity(first) === identity(namedBefore) &&
      identity(first) === identity(after) &&
      first.size === after.size &&
      first.mtimeMs === after.mtimeMs &&
      first.ctimeMs === after.ctimeMs &&
      named.isFile() &&
      !named.isSymbolicLink() &&
      identity(named) === identity(first) &&
      named.nlink === 1 &&
      named.uid === first.uid &&
      (named.mode & 0o077) === 0 &&
      named.size === after.size &&
      named.mtimeMs === after.mtimeMs &&
      named.ctimeMs === after.ctimeMs &&
      parentAfter.isDirectory() &&
      !parentAfter.isSymbolicLink() &&
      identity(parentAfter) === identity(directory) &&
      parentAfter.uid === directory.uid &&
      (parentAfter.mode & 0o077) === 0 &&
      (await step(() => realpath(path))) === path, 'file bytes, inode or parent custody changed');
    return { bytes, identity: identity(first) };
  } finally {
    await handle.close();
  }
}
