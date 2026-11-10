import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
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
async function directory(path: string, readOnly = false): Promise<void> {
  if (!readOnly) await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (await realpath(path)) !== path ||
    (readOnly && (stat.mode & 0o077) !== 0)
  )
    throw new Error('CE deployment storage ownership is invalid');
  if (!readOnly) await chmod(path, 0o700);
}
export interface CeStorageOptions {
  readOnly?: boolean;
}
export class CeDeploymentStore {
  #readOnly: boolean;
  private constructor(
    readonly directory: string,
    readonly owner: CeOwner,
    readOnly = false,
  ) {
    this.#readOnly = readOnly;
  }
  static async open(root: string, owner: CeOwner, options: CeStorageOptions = {}): Promise<CeDeploymentStore> {
    if (
      !isAbsolute(root) ||
      !['native', 'terraform'].includes(owner.engine) ||
      !['aws', 'azure'].includes(owner.provider) ||
      [owner.account, owner.region, owner.deploymentId].some((value) => !value || /[\r\n]/.test(value))
    )
      throw new Error('Invalid CE storage binding');
    const readOnly = options.readOnly === true;
    await directory(root, readOnly);
    const path = join(root, key(owner));
    await directory(path, readOnly);
    const store = new CeDeploymentStore(path, structuredClone(owner), readOnly);
    if (readOnly) {
      await store.verify();
      return store;
    }
    try {
      await writeFile(join(path, 'owner.json'), JSON.stringify({ schemaVersion: 2, owner }), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
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
  #assertWritable(): void {
    if (this.#readOnly) throw new Error('CE deployment storage is read-only');
  }
  /** Immutable reservation: existing matching bytes never authorize a second request. */
  async reserve(name: string, value: unknown): Promise<boolean> {
    this.#assertWritable();
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    const bytes = JSON.stringify(value);
    try {
      const handle = await open(this.#path(name), 'wx', 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const parent = await open(this.directory, 'r');
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // O_EXCL reserves the name before the winning writer finishes publishing.
      // A losing caller never writes or submits; wait only for the exact prefix
      // already reserved by that writer, and fail closed if publication stalls.
      const deadline = performance.now() + 1000;
      const expected = Buffer.from(bytes);
      for (;;) {
        const current = await this.#read(name);
        if (current.equals(expected)) return false;
        if (
          current.length > expected.length ||
          !current.equals(expected.subarray(0, current.length)) ||
          performance.now() >= deadline
        )
          throw new Error('CE request reservation identity differs');
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
  }
  async write(name: string, value: unknown, signal?: AbortSignal): Promise<void> {
    this.#assertWritable();
    signal?.throwIfAborted();
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    signal?.throwIfAborted();
    const temporary = this.#path(`tmp-${randomUUID()}`);
    try {
      await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600, signal });
      signal?.throwIfAborted();
      await rename(temporary, this.#path(name));
      signal?.throwIfAborted();
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async read(name: string): Promise<unknown> {
    await this.verify();
    const bytes = await this.#read(name);
    try {
      return JSON.parse(bytes.toString());
    } catch {
      // Runtime parser diagnostics may include private enrollment material.
      throw new Error('Malformed CE deployment artifact');
    }
  }
  async remove(name: string): Promise<void> {
    this.#assertWritable();
    if (name === 'owner.json') throw new Error('CE deployment ownership is immutable');
    await this.verify();
    await rm(this.#path(name), { force: true });
  }
}
