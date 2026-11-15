import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, open, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalEqual, canonicalSha256 } from './canonical';

type Store = Pick<CeDeploymentStore, 'directory' | 'owner' | 'verify'>;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = (value: string) => /^[a-f0-9]{64}$/.test(value);
function require(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`Immutable CE receipt publication: ${reason}`);
}

async function privateBytes(path: string, links = 1) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    require(before.isFile() &&
      before.uid === process.getuid?.() &&
      before.nlink === links &&
      (before.mode & 0o077) === 0, 'file ownership differs');
    const bytes = await file.readFile(),
      after = await file.stat(),
      named = await lstat(path);
    require(after.dev === before.dev &&
      after.ino === before.ino &&
      after.size === before.size &&
      after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs &&
      named.isFile() &&
      !named.isSymbolicLink() &&
      named.dev === before.dev &&
      named.ino === before.ino &&
      named.uid === before.uid &&
      named.nlink === links &&
      (named.mode & 0o077) === 0, 'named bytes changed during read');
    return bytes;
  } finally {
    await file.close();
  }
}

function context(store: Store, namespace: string, request: unknown, signal?: AbortSignal) {
  require(/^[a-z][a-z0-9-]{0,39}$/.test(namespace), 'namespace differs');
  const verifier = store.verify,
    directory = store.directory,
    owner = structuredClone(store.owner),
    expected = canonicalSha256(request);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(store.verify === verifier &&
      store.directory === directory &&
      canonicalEqual(store.owner, owner) &&
      canonicalSha256(request) === expected, 'owning context changed');
  };
  const step = async <T>(work: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  // Request-local inode custody; equal bytes on a replacement file do not preserve publication identity.
  const fileIdentities = new Map<string, string>();
  const readBytes = async (path: string, links = 1) => {
    const before = await step(() => lstat(path)),
      bytes = await step(() => privateBytes(path, links)),
      after = await step(() => lstat(path));
    const identity = (stat: typeof before) =>
      canonicalSha256({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs });
    const current = identity(after),
      prior = fileIdentities.get(path);
    require(identity(before) === current &&
      (prior === undefined || prior === current), 'publication inode changed across callback');
    fileIdentities.set(path, current);
    return bytes;
  };
  let ownerIdentity: string | undefined;
  const inspect = async () => {
    const root = await step(() => lstat(directory));
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await step(() => realpath(directory))) === directory, 'directory ownership differs');
    const path = join(directory, 'owner.json'),
      before = await step(() => lstat(path)),
      bytes = await step(() => privateBytes(path)),
      after = await step(() => lstat(path));
    require(before.dev === after.dev &&
      before.ino === after.ino &&
      before.mtimeMs === after.mtimeMs &&
      before.ctimeMs === after.ctimeMs, 'owner manifest changed during inspection');
    let manifest: { schemaVersion?: unknown; owner?: unknown };
    try {
      manifest = JSON.parse(bytes.toString());
    } catch {
      throw Error('Malformed native owner manifest');
    }
    require(manifest &&
      Object.keys(manifest).sort().join(',') === 'owner,schemaVersion' &&
      manifest.schemaVersion === 2 &&
      canonicalEqual(manifest.owner, owner), 'native owner differs');
    const identity = canonicalSha256({
      root: { dev: root.dev, ino: root.ino },
      owner: { dev: after.dev, ino: after.ino, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs, sha256: hash(bytes) },
    });
    require(ownerIdentity === undefined || ownerIdentity === identity, 'native owner identity changed');
    ownerIdentity = identity;
  };
  const verify = async () => {
    await inspect();
    await step(() => verifier.call(store));
    await inspect();
  };
  const sync = async () => {
    const handle = await step(() => open(directory, constants.O_RDONLY));
    try {
      await step(() => handle.sync());
    } finally {
      await handle.close();
    }
  };
  return { step, seal, verify, sync, directory, readBytes };
}

/** Storage integrity only. The owning producer must separately authenticate record meaning,
 * native receipts, source/outcome joins and every admission/operational acceptance gate. */
export async function publishImmutableCeReceipt(
  store: Store,
  namespace: string,
  request: unknown,
  signal?: AbortSignal,
) {
  const c = context(store, namespace, request, signal),
    record = structuredClone(request),
    digest = canonicalSha256(record),
    content = Buffer.from(JSON.stringify(record)),
    name = `${namespace}-${digest}.json`,
    path = join(c.directory, name);
  await c.verify();
  const pendingNames = async () =>
    (await c.step(() => readdir(c.directory)))
      .filter((value) => new RegExp(`^${namespace}-${digest}-[a-f0-9-]{36}\\.pending$`).test(value))
      .sort();
  try {
    const stat = await c.step(() => lstat(path));
    if (stat.nlink === 2) {
      const matches: string[] = [];
      for (const candidate of await pendingNames()) {
        const pending = await c.step(() => lstat(join(c.directory, candidate)));
        if (pending.dev === stat.dev && pending.ino === stat.ino) matches.push(candidate);
      }
      require(matches.length === 1, 'linked recovery is ambiguous');
      const pending = join(c.directory, matches[0]);
      require((await c.readBytes(path, 2)).equals(content) &&
        (await c.readBytes(pending, 2)).equals(content), 'linked recovery bytes differ');
      await c.verify();
      require((await c.readBytes(path, 2)).equals(content) &&
        (await c.readBytes(pending, 2)).equals(content), 'linked recovery bytes changed');
      await c.step(() => unlink(pending));
      await c.sync();
    }
    require((await c.readBytes(path)).equals(content), 'immutable collision retained');
    await c.verify();
    require((await c.readBytes(path)).equals(content), 'publication changed');
    require((await pendingNames()).length === 0, 'published receipt has unresolved pending evidence');
    return { name, publicationSha256: digest, byteSha256: hash(content) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const retained = await pendingNames();
  require(retained.length <= 1, 'pending recovery is ambiguous');
  const pending = join(c.directory, retained[0] ?? `${namespace}-${digest}-${randomUUID()}.pending`);
  if (retained.length) require((await c.readBytes(pending)).equals(content), 'incomplete or foreign pending retained');
  const file = await c.step(() =>
    open(pending, retained.length ? constants.O_RDONLY | constants.O_NOFOLLOW : 'wx', 0o600),
  );
  try {
    if (!retained.length) await c.step(() => file.writeFile(content));
    await c.step(() => file.sync());
    await file.close();
    await c.verify();
    require((await c.readBytes(pending)).equals(content), 'pending bytes changed');
    try {
      await c.step(() => link(pending, path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      require((await c.readBytes(path)).equals(content), 'late immutable collision retained');
    }
    await c.step(() => unlink(pending));
    await c.sync();
    await c.verify();
    require((await c.readBytes(path)).equals(content), 'publication changed');
    require((await pendingNames()).length === 0, 'published receipt has unresolved pending evidence');
    c.seal();
    return { name, publicationSha256: digest, byteSha256: hash(content) };
  } catch (error) {
    await file.close().catch(() => {});
    throw error;
  }
}

/** Read-only exact content-addressed storage integrity, never execution provenance. */
export async function readImmutableCeReceipt(store: Store, namespace: string, digest: string, signal?: AbortSignal) {
  require(sha(digest), 'publication digest differs');
  const c = context(store, namespace, { digest }, signal),
    name = `${namespace}-${digest}.json`,
    path = join(c.directory, name);
  await c.verify();
  const bytes = await c.readBytes(path);
  let record: unknown;
  try {
    record = JSON.parse(bytes.toString());
  } catch {
    throw Error('Malformed immutable receipt publication');
  }
  require(canonicalSha256(record) === digest &&
    bytes.equals(Buffer.from(JSON.stringify(record))), 'publication digest or encoding differs');
  await c.verify();
  require((await c.readBytes(path)).equals(bytes), 'publication changed across verifier callback');
  c.seal();
  return { name, publicationSha256: digest, byteSha256: hash(bytes), record };
}
