import { lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Root = { path: string; identity: string; retired: boolean };
const identity = (s: Awaited<ReturnType<typeof lstat>>) => `${s.dev}:${s.ino}:${s.birthtimeMs}:${s.uid}`;

/** Own local test roots through the creating body and its cleanup. */
export class OwnedFixtureRoots {
  #roots: Root[] = [];
  #creations: Promise<string>[] = [];
  #disposal?: Promise<{ scope: 'local-test-fixture-roots'; retiredRoots: number; ceCleanupQualified: false }>;
  #closed = false;
  create(prefix = 'azure-network-nic-execution-') {
    if (this.#closed || !/^[a-z][a-z0-9-]{1,63}-$/.test(prefix))
      return Promise.reject(Error('Fixture root creation is unavailable'));
    const creation = this.#create(prefix);
    this.#creations.push(creation);
    return creation;
  }
  async #create(prefix: string) {
    const path = await realpath(await mkdtemp(join(tmpdir(), prefix)));
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077)
      throw Error('Created fixture root custody differs');
    this.#roots.push({ path, identity: identity(stat), retired: false });
    return path;
  }
  dispose() {
    if (this.#disposal) return this.#disposal;
    this.#closed = true;
    const disposal = this.#dispose();
    this.#disposal = disposal;
    void disposal.catch(() => {
      if (this.#disposal === disposal) this.#disposal = undefined;
    });
    return disposal;
  }
  async #dispose() {
    const creations = await Promise.allSettled(this.#creations);
    const failed = creations.filter((row): row is PromiseRejectedResult => row.status === 'rejected');
    if (failed.length)
      throw new AggregateError(
        failed.map((row) => row.reason),
        'Fixture creation custody failed',
      );
    for (const root of this.#roots) {
      if (root.retired) continue;
      const stat = await lstat(root.path);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        stat.mode & 0o077 ||
        identity(stat) !== root.identity ||
        (await realpath(root.path)) !== root.path
      )
        throw Error('Owned fixture root custody changed; cleanup refused');
      await rm(root.path, { recursive: true });
      root.retired = true;
    }
    return {
      scope: 'local-test-fixture-roots' as const,
      retiredRoots: this.#roots.length,
      ceCleanupQualified: false as const,
    };
  }
}

export async function withOwnedFixtureRoots<T>(body: (roots: OwnedFixtureRoots) => Promise<T>) {
  const roots = new OwnedFixtureRoots();
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: await body(roots) };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    await roots.dispose();
  } catch (cleanupError) {
    if (!outcome.ok) throw new AggregateError([outcome.error, cleanupError], 'Fixture body and owned cleanup failed');
    throw cleanupError;
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
