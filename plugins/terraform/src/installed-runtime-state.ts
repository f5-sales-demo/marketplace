import { type BigIntStats, type FSWatcher, watch } from 'node:fs';
import { lstat, mkdir, readlink, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

const directoryKeys = ['dev', 'ino', 'uid', 'mode'] as const;
const linkKeys = [...directoryKeys, 'nlink', 'size', 'mtimeNs', 'ctimeNs'] as const;
const refusal = () => new Error('Original runtime state directory changed or is unavailable');
function identity(stat: BigIntStats) {
  const keys = stat.isSymbolicLink() ? linkKeys : directoryKeys;
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, stat[key].toString()])));
}
async function ownedDirectory(path: string, trustedParent = false) {
  const stat = await lstat(path, { bigint: true });
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (stat.uid !== BigInt(process.getuid?.() ?? -1) && !(trustedParent && stat.uid === 0n)) ||
    (stat.mode & 0o022n) !== 0n ||
    (await realpath(path)) !== path
  )
    throw refusal();
  return stat;
}
async function resolveOwnedState(path: string, allowAliases: boolean): Promise<string> {
  let canonical: string;
  try {
    canonical = await realpath(path);
    if (!allowAliases && canonical !== path) throw refusal();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    // Create one component under its verified canonical owned parent. A raced
    // alias is refused; recursive mkdir must not follow an unreviewed target.
    const parent = await resolveOwnedState(dirname(path), allowAliases);
    await ownedDirectory(parent);
    canonical = join(parent, basename(path));
    try {
      await mkdir(canonical, { mode: 0o700 });
    } catch (creation) {
      if ((creation as NodeJS.ErrnoException).code !== 'EEXIST') throw creation;
    }
  }
  await ownedDirectory(canonical);
  return canonical;
}

/** Resolve only the ordinary home route, then retain that original route and
 * canonical directory for the whole inspection. Explicit paths stay canonical. */
export async function admitInstalledRuntimeState(environment: Record<string, string | undefined>, home = homedir()) {
  const explicit = environment.XDG_STATE_HOME !== undefined;
  const requested = environment.XDG_STATE_HOME ?? join(home, '.local/state');
  if (!isAbsolute(requested) || resolve(requested) !== requested) throw refusal();
  const path = await resolveOwnedState(requested, !explicit);
  await ownedDirectory(path);
  await ownedDirectory(dirname(path), true);
  const routes = new Set<string>([path, dirname(path)]);
  for (let current = requested; current !== dirname(current); current = dirname(current)) routes.add(current);
  const originals: Array<
    Readonly<{ path: string; identity: Readonly<Record<string, string>>; link: string | undefined }>
  > = [];
  for (const route of routes) {
    const stat = await lstat(route, { bigint: true });
    if (!stat.isDirectory() && !stat.isSymbolicLink()) throw refusal();
    if (stat.isSymbolicLink() && stat.uid !== BigInt(process.getuid?.() ?? -1) && stat.uid !== 0n) throw refusal();
    originals.push(
      Object.freeze({
        path: route,
        identity: identity(stat),
        link: stat.isSymbolicLink() ? await readlink(route) : undefined,
      }),
    );
  }
  const watchers: FSWatcher[] = [];
  let refused = false;
  let closed = false;
  const close = () => {
    closed = true;
    for (const watcher of watchers.splice(0)) watcher.close();
  };
  const assertOriginal = async () => {
    try {
      if (closed || refused || (await realpath(requested)) !== path) throw refusal();
      for (const original of originals) {
        const stat = await lstat(original.path, { bigint: true });
        const current = identity(stat);
        if (
          Object.keys(current).length !== Object.keys(original.identity).length ||
          Object.entries(original.identity).some(([key, value]) => current[key] !== value) ||
          (original.link !== undefined && (await readlink(original.path)) !== original.link)
        )
          throw refusal();
      }
      await ownedDirectory(path);
      await ownedDirectory(dirname(path), true);
      if (closed || refused || (await realpath(requested)) !== path) throw refusal();
    } catch {
      refused = true;
      throw refusal();
    }
  };
  try {
    for (const original of originals) {
      // Observe the owned state inode itself. Its managed parent's directory
      // listing may be unavailable; parent identity and route watchers remain
      // bound, and self rename/delete events permanently retire this admission.
      const watched = original.path === path ? path : dirname(original.path);
      const watcher = watch(watched, { persistent: false }, (_event, name) => {
        if (!name || name.toString() === basename(original.path)) refused = true;
      });
      watcher.on('error', () => {
        refused = true;
      });
      watchers.push(watcher);
    }
    await assertOriginal();
    return Object.freeze({
      path,
      binding: Object.freeze({ path, requested, originals: Object.freeze(originals) }),
      assertOriginal,
      close,
    });
  } catch (error) {
    close();
    throw error;
  }
}
