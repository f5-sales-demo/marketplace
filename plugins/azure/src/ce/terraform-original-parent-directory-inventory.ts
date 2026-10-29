import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from './canonical';
import { readAzureTerraformOriginalReceiptProvenance } from './terraform-original-receipt-provenance';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256({ value: a }) === canonicalSha256({ value: b });
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const identity = (stat: { dev: number; ino: number; birthtimeMs: number }) =>
  `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure original parent directory inventory: ${message}`);
}
type Loaders = Parameters<typeof readAzureTerraformOriginalReceiptProvenance>[2];
const witnesses = new WeakMap<
  object,
  {
    request: AzureCePlan;
    store: CeDeploymentStore;
    loaders: Loaders;
    digest: string;
    recheck(signal?: AbortSignal): Promise<void>;
  }
>();
/** Read-only enrollment of original receipt metadata and authenticated interrupted publication
 * fragments. The owning public outcome, descriptor inventory and exact native bytes/identities
 * authenticate these directories. This does not retire a parent or authorize arbitrary root
 * directories, native saved plans, rendered bootstrap/configuration, or operational acceptance.
 */
export async function readAzureTerraformOriginalParentDirectoryInventory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: Loaders,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = store.directory;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const dependencies = [
    { target: store, key: 'read', value: store.read },
    { target: store, key: 'verify', value: store.verify },
    { target: loaders, key: 'loadSource', value: loaders.loadSource },
    { target: loaders, key: 'loadOutcome', value: loaders.loadOutcome },
  ];
  const seal = () => {
    deadline.throwIfAborted();
    require(same(request, plan) &&
      same(store.owner, owner) &&
      store.directory === directory &&
      dependencies.every(({ target, key, value }) => Reflect.get(target, key) === value), 'owning context changed');
  };
  const step = async <T>(action: () => Promise<T>, parent?: AbortSignal) => {
    seal();
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    active.throwIfAborted();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  const snapshot = async (parent?: AbortSignal) => {
    const root = await step(() => lstat(directory), parent);
    require(root.isDirectory() &&
      !root.isSymbolicLink() &&
      root.uid === process.getuid?.() &&
      (root.mode & 0o077) === 0 &&
      (await step(() => realpath(directory), parent)) === directory, 'private root differs');
    const directories: Array<{ path: string; identity: string; names: string[] }> = [];
    const files: Array<{ path: string; identity: string; bytesSha256: string }> = [];
    for (const name of [
      'terraform-original-deployment-receipts',
      'terraform-original-deployment-publication-fragments',
    ]) {
      const path = join(directory, name);
      let first: Stats;
      try {
        first = await step(() => lstat(path), parent);
      } catch (error) {
        if (name.endsWith('publication-fragments') && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      require(first.isDirectory() &&
        !first.isSymbolicLink() &&
        first.uid === process.getuid?.() &&
        (first.mode & 0o077) === 0 &&
        (await step(() => realpath(path), parent)) === path, 'original directory ownership differs');
      const names = (await step(() => readdir(path), parent)).sort();
      for (const fileName of names) {
        require(name.endsWith('receipts')
          ? /^[a-f0-9]{64}\.json$/.test(fileName)
          : /^[a-f0-9]{64}-[a-f0-9-]{36}\.pending\.[a-f0-9]{64}\.fragment$/.test(
              fileName,
            ), 'unaccounted original directory entry');
        const selected = join(path, fileName),
          handle = await step(() => open(selected, constants.O_RDONLY | constants.O_NOFOLLOW), parent);
        try {
          const before = await step(() => handle.stat(), parent),
            bytes = await step(() => handle.readFile(), parent),
            after = await step(() => handle.stat(), parent),
            named = await step(() => lstat(selected), parent);
          require(before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 0o077) === 0 &&
            identity(before) === identity(after) &&
            before.size === after.size &&
            before.mtimeMs === after.mtimeMs &&
            before.ctimeMs === after.ctimeMs &&
            named.isFile() &&
            !named.isSymbolicLink() &&
            identity(named) === identity(before) &&
            named.uid === before.uid &&
            named.nlink === 1 &&
            (named.mode & 0o077) === 0, 'original file bytes or identity changed');
          files.push({ path: `${name}/${fileName}`, identity: identity(before), bytesSha256: hash(bytes) });
        } finally {
          await handle.close();
        }
      }
      const after = await step(() => lstat(path), parent);
      require(after.isDirectory() &&
        !after.isSymbolicLink() &&
        identity(after) === identity(first) &&
        after.uid === first.uid &&
        (after.mode & 0o077) === 0 &&
        same((await step(() => readdir(path), parent)).sort(), names), 'original directory changed during read');
      directories.push({ path: name, identity: identity(first), names });
    }
    const afterRoot = await step(() => lstat(directory), parent);
    require(afterRoot.isDirectory() &&
      !afterRoot.isSymbolicLink() &&
      identity(afterRoot) === identity(root) &&
      afterRoot.uid === root.uid &&
      (afterRoot.mode & 0o077) === 0, 'private root identity changed');
    return { rootIdentity: identity(root), directories, files };
  };
  seal();
  await step(() => store.verify());
  const original = await snapshot();
  const inspect = async (parent?: AbortSignal) => {
    require(same(await snapshot(parent), original), 'original bytes, inode or namespace changed');
    const active = AbortSignal.any([deadline, ...(parent ? [parent] : [])]);
    const provenance = await step(
      () => readAzureTerraformOriginalReceiptProvenance(plan, store, loaders, active),
      parent,
    );
    const receipts = original.directories.find((row) => row.path === 'terraform-original-deployment-receipts');
    require(receipts &&
      same(
        receipts.names,
        provenance.receipts.map((row) => `${canonicalSha256(row.record)}.json`).sort(),
      ), 'original directory differs from authenticated public receipt inventory');
    const fragments = original.directories.find(
      (row) => row.path === 'terraform-original-deployment-publication-fragments',
    );
    require(same(
      fragments?.names ?? [],
      provenance.publicationFragments.map((row) => row.name).sort(),
    ), 'original fragments differ from authenticated publication provenance');
    require(same(await snapshot(parent), original), 'original bytes, inode or namespace changed across callbacks');
    await step(() => store.verify(), parent);
    return canonicalSha256(provenance);
  };
  const provenanceSha256 = await inspect();
  const result = {
    schemaVersion: 1 as const,
    scope: 'authenticated-original-parent-enrollment-directory-inventory' as const,
    owner,
    originalPlanSha256: plan.planSha256,
    ...original,
    provenanceSha256,
    originalReceiptMetadataQualified: true as const,
    completeParentInventoryQualified: false as const,
    nativeJournalsQualified: false as const,
    parentRetirementQualified: false as const,
    currentOperationalAcceptanceQualified: false as const,
  };
  const digest = canonicalSha256(result);
  witnesses.set(result, {
    request,
    store,
    loaders,
    digest,
    async recheck(parent) {
      require(canonicalSha256(result) === digest &&
        (await inspect(parent)) === provenanceSha256, 'original directory inventory changed');
    },
  });
  return result;
}
export async function recheckAzureTerraformOriginalParentDirectoryInventory(
  witness: unknown,
  request: AzureCePlan,
  store: CeDeploymentStore,
  loaders: Loaders,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const bound = witness && typeof witness === 'object' ? witnesses.get(witness) : undefined;
  require(bound &&
    bound.request === request &&
    bound.store === store &&
    bound.loaders === loaders &&
    canonicalSha256(witness) === bound.digest, 'owning original directory witness required');
  await bound.recheck(signal);
}
