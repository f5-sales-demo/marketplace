import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { CeOwner } from './runtime';

const immutableIdentityKeys = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'] as const;
export interface CeImmutableRecord {
  readonly schemaVersion: 1;
  readonly kind: 'ce-immutable-file';
  readonly name: string;
  readonly binding: Readonly<{
    path: string;
    sha256: string;
    expectedIdentity: Readonly<Record<(typeof immutableIdentityKeys)[number], string>>;
    expectedParentIdentity: Readonly<Record<'dev' | 'ino' | 'uid' | 'mode', string>>;
  }>;
}
const immutableHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const immutableIdentity = (metadata: Awaited<ReturnType<typeof immutableMetadata>>) =>
  Object.fromEntries(immutableIdentityKeys.map((key) => [key, String(metadata[key])])) as Record<
    (typeof immutableIdentityKeys)[number],
    string
  >;
async function immutableMetadata(path: string) {
  return lstat(path, { bigint: true });
}

function key(owner: CeOwner): string {
  return createHash('sha256')
    .update(JSON.stringify([owner.provider, owner.account, owner.region, owner.deploymentId]))
    .digest('hex');
}
function sameOwner(a: CeOwner, b: CeOwner): boolean {
  return ['deploymentId', 'engine', 'provider', 'account', 'region'].every(
    (field) => a[field as keyof CeOwner] === b[field as keyof CeOwner],
  );
}
async function directory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path
  )
    throw new Error('CE deployment storage ownership is invalid');
  await chmod(path, 0o700);
}
async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export class CeDeploymentStore {
  private constructor(
    readonly directory: string,
    readonly owner: CeOwner,
  ) {}
  static async open(root: string, owner: CeOwner): Promise<CeDeploymentStore> {
    if (
      !isAbsolute(root) ||
      !['native', 'terraform'].includes(owner.engine) ||
      !['aws', 'azure', 'gcp'].includes(owner.provider) ||
      [owner.account, owner.region, owner.deploymentId].some((value) => !value || /[\r\n]/.test(value))
    )
      throw new Error('Invalid CE storage binding');
    await directory(root);
    const path = join(root, key(owner));
    await directory(path);
    const store = new CeDeploymentStore(path, structuredClone(owner));
    try {
      await writeFile(join(path, 'owner.json'), JSON.stringify({ schemaVersion: 2, owner }), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    // Flush both new and resumed owner manifests before granting storage access.
    const manifest = await open(join(path, 'owner.json'), 'r');
    try {
      await manifest.sync();
    } finally {
      await manifest.close();
    }
    await syncDirectory(path);
    await syncDirectory(root);
    await syncDirectory(dirname(root));
    await store.verify();
    return store;
  }
  #path(name: string): string {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name)) throw new Error('Invalid CE storage item');
    return join(this.directory, name);
  }
  async #read(name: string): Promise<Buffer> {
    const path = this.#path(name);
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    )
      throw new Error('CE storage item ownership is invalid');
    return readFile(path);
  }
  async verify(): Promise<void> {
    let manifest: { schemaVersion: number; owner: CeOwner };
    try {
      manifest = JSON.parse((await this.#read('owner.json')).toString());
    } catch {
      throw new Error('CE owner manifest is unavailable');
    }
    if (manifest.schemaVersion !== 2 || !sameOwner(manifest.owner, this.owner))
      throw new Error('CE deployment belongs to another execution engine or scope');
  }
  async write(name: string, value: unknown): Promise<void> {
    if (name === 'owner.json' || name.startsWith('immutable-'))
      throw new Error('CE deployment storage item is immutable');
    await this.verify();
    const temporary = this.#path(`tmp-${randomUUID()}`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(value));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, this.#path(name));
      // Rename alone is atomic, not a durable consume-before-return boundary.
      await syncDirectory(this.directory);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async read(name: string): Promise<unknown> {
    await this.verify();
    return JSON.parse((await this.#read(name)).toString());
  }
  /** One immutable source publication. A collision, even with identical bytes,
   * cannot replace evidence or turn an unchanged retry into success. */
  async writeImmutableBytes(name: string, input: Uint8Array): Promise<CeImmutableRecord> {
    if (!name.startsWith('immutable-')) throw new Error('Reserved immutable CE record name required');
    const path = this.#path(name);
    const bytes = Buffer.from(input);
    if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('Immutable CE record exceeds byte limit');
    await this.verify();
    const parent = await immutableMetadata(this.directory);
    const handle = await open(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o400,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(this.directory);
    const file = await immutableMetadata(path);
    const currentParent = await immutableMetadata(this.directory);
    if (
      file.uid !== BigInt(process.getuid?.() ?? -1) ||
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.nlink !== 1n ||
      (file.mode & 0o777n) !== 0o400n ||
      !parent.isDirectory() ||
      currentParent.isSymbolicLink() ||
      ['dev', 'ino', 'uid', 'mode'].some(
        (key) =>
          String(parent[key as keyof typeof parent]) !== String(currentParent[key as keyof typeof currentParent]),
      ) ||
      (await realpath(path)) !== path ||
      immutableHash(await readFile(path)) !== immutableHash(bytes)
    )
      throw new Error('Original immutable CE publication identity changed');
    return Object.freeze({
      schemaVersion: 1,
      kind: 'ce-immutable-file',
      name,
      binding: Object.freeze({
        path,
        sha256: immutableHash(bytes),
        expectedIdentity: Object.freeze(immutableIdentity(file)),
        expectedParentIdentity: Object.freeze({
          dev: String(parent.dev),
          ino: String(parent.ino),
          uid: String(parent.uid),
          mode: String(parent.mode),
        }),
      }),
    });
  }
  /** Read original bytes through their preserved file and parent identity. */
  async readImmutableBytes(input: CeImmutableRecord): Promise<Buffer> {
    const record = structuredClone(input);
    await this.verify();
    const binding = record.binding;
    if (
      record.schemaVersion !== 1 ||
      record.kind !== 'ce-immutable-file' ||
      !record.name.startsWith('immutable-') ||
      binding.path !== this.#path(record.name) ||
      !/^[a-f0-9]{64}$/.test(binding.sha256) ||
      !binding.expectedIdentity ||
      !binding.expectedParentIdentity
    )
      throw new Error('Original immutable CE record binding required');
    const inspect = async () => {
      const file = await immutableMetadata(binding.path),
        parent = await immutableMetadata(this.directory);
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        file.nlink !== 1n ||
        file.uid !== BigInt(process.getuid?.() ?? -1) ||
        (file.mode & 0o777n) !== 0o400n ||
        !parent.isDirectory() ||
        parent.isSymbolicLink() ||
        immutableIdentityKeys.some((key) => String(file[key]) !== binding.expectedIdentity[key]) ||
        (['dev', 'ino', 'uid', 'mode'] as const).some(
          (key) => String(parent[key]) !== binding.expectedParentIdentity[key],
        ) ||
        (await realpath(binding.path)) !== binding.path
      )
        throw new Error('Original immutable CE record identity changed');
      return file;
    };
    await inspect();
    const handle = await open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat({ bigint: true });
      if (immutableIdentityKeys.some((key) => String(opened[key]) !== binding.expectedIdentity[key]))
        throw new Error('Original immutable CE open identity changed');
      const bytes = await handle.readFile();
      if (immutableHash(bytes) !== binding.sha256) throw new Error('Original immutable CE bytes changed');
      await inspect();
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async remove(name: string): Promise<void> {
    if (name === 'owner.json' || name.startsWith('immutable-'))
      throw new Error('CE deployment storage item is immutable');
    await this.verify();
    await rm(this.#path(name), { force: true });
  }
}
