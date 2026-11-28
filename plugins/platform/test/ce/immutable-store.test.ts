import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const owner = {
  provider: 'gcp' as const,
  engine: 'terraform' as const,
  account: 'example-project',
  region: 'us-central1',
  deploymentId: 'original',
};
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'immutable-ce-'));
  roots.push(root);
  return { root, store: await CeDeploymentStore.open(root, owner) };
}

test('immutable CE snapshots retain exact bytes and original file binding through a new store instance', async () => {
  const f = await setup(),
    bytes = Buffer.from('{"original":"private-example-content"}\n');
  const record = await f.store.writeImmutableBytes('immutable-state.private.json', bytes);
  const reopened = await CeDeploymentStore.open(f.root, owner);
  expect(await reopened.readImmutableBytes(record)).toEqual(bytes);
  expect(record.binding.expectedIdentity?.ino).toBeDefined();
  expect((await stat(record.binding.path)).mode & 0o777).toBe(0o400);
});

test('immutable writes refuse unchanged collisions and mutable APIs cannot overwrite or remove their records', async () => {
  const f = await setup();
  const record = await f.store.writeImmutableBytes('immutable-proof.json', Buffer.from('original'));
  await expect(f.store.writeImmutableBytes(record.name, Buffer.from('original'))).rejects.toThrow();
  await expect(f.store.write(record.name, { changed: true })).rejects.toThrow('immutable');
  await expect(f.store.remove(record.name)).rejects.toThrow('immutable');
  expect(await readFile(record.binding.path, 'utf8')).toBe('original');
});

test('same-byte immutable file replacement refuses resumed reads', async () => {
  const f = await setup();
  const record = await f.store.writeImmutableBytes('immutable-proof.json', Buffer.from('original'));
  await rename(record.binding.path, `${record.binding.path}.original`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(record.binding.path, 'original', { mode: 0o400, flag: 'wx' });
  await expect(f.store.readImmutableBytes(record)).rejects.toThrow();
});

test('immutable records cannot cross a deployment owner or alias a symlink', async () => {
  const f = await setup(),
    record = await f.store.writeImmutableBytes('immutable-proof.json', Buffer.from('original'));
  const foreign = await CeDeploymentStore.open(f.root, { ...owner, deploymentId: 'foreign' });
  await expect(foreign.readImmutableBytes(record)).rejects.toThrow();
  await rename(record.binding.path, `${record.binding.path}.original`);
  await symlink(`${record.binding.path}.original`, record.binding.path);
  await expect(f.store.readImmutableBytes(record)).rejects.toThrow();
});

test('concurrent immutable writers publish one original snapshot and never replace the winner', async () => {
  const f = await setup();
  const results = await Promise.allSettled([
    f.store.writeImmutableBytes('immutable-proof.json', Buffer.from('one')),
    f.store.writeImmutableBytes('immutable-proof.json', Buffer.from('two')),
  ]);
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((row) => row.status === 'rejected')).toHaveLength(1);
});

test('immutable bytes require a reserved safe name and cannot rewrite ownership', async () => {
  const f = await setup();
  for (const name of ['owner.json', 'ordinary.json', '../immutable-escape'])
    await expect(f.store.writeImmutableBytes(name, Buffer.from('original'))).rejects.toThrow();
});
