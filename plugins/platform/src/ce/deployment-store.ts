import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import type { CeOwner } from './runtime';

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
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
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
  async remove(name: string): Promise<void> {
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    await rm(this.#path(name), { force: true });
  }
}
