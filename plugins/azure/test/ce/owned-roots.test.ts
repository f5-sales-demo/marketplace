import { expect, test } from 'bun:test';
import { chmod, lstat, mkdir, rename, rm, symlink } from 'node:fs/promises';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { OwnedFixtureRoots, withOwnedFixtureRoots } from './owned-roots';

async function store(root: string) {
  return CeDeploymentStore.open(root, {
    provider: 'azure',
    engine: 'terraform',
    account: 'example-subscription',
    region: 'fixture-region',
    deploymentId: 'fixture-deployment',
  });
}

test('late predecessor cleanup preserves a real successor owner manifest', async () => {
  const predecessor = new OwnedFixtureRoots(),
    successor = new OwnedFixtureRoots();
  const first = await predecessor.create(),
    second = await successor.create();
  const a = await store(first),
    b = await store(second);
  try {
    await a.verify();
    await b.verify();
    expect(await predecessor.dispose()).toMatchObject({ retiredRoots: 1, ceCleanupQualified: false });
    await expect(b.verify()).resolves.toBeUndefined();
    expect(await successor.dispose()).toMatchObject({ retiredRoots: 1, ceCleanupQualified: false });
  } finally {
    await rm(first, { recursive: true, force: true });
    await rm(second, { recursive: true, force: true });
  }
});
test('owned disposal is idempotent and closes creation', async () => {
  const roots = new OwnedFixtureRoots();
  await roots.create();
  expect(await roots.dispose()).toEqual(await roots.dispose());
  await expect(roots.create()).rejects.toThrow('unavailable');
});
test('disposal waits for a creation already in flight', async () => {
  const roots = new OwnedFixtureRoots(),
    creating = roots.create(),
    disposing = roots.dispose();
  const root = await creating;
  try {
    await disposing;
    await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('overlapping disposals share retirement instead of racing directory deletion', async () => {
  const roots = new OwnedFixtureRoots(),
    root = await roots.create();
  try {
    const [a, b] = await Promise.all([roots.dispose(), roots.dispose()]);
    expect(a).toEqual(b);
    await expect(lstat(root)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('replaced root cannot authorize deletion of a foreign real store', async () => {
  const roots = new OwnedFixtureRoots(),
    root = await roots.create(),
    old = `${root}-retained`;
  await rename(root, old);
  await mkdir(root, { mode: 0o700 });
  const foreign = await store(root);
  try {
    await expect(roots.dispose()).rejects.toThrow('custody changed');
    await expect(foreign.verify()).resolves.toBeUndefined();
  } finally {
    await rm(root, { recursive: true });
    await rm(old, { recursive: true });
  }
});
test('symlink replacement is rejected without deleting its target', async () => {
  const a = new OwnedFixtureRoots(),
    b = new OwnedFixtureRoots();
  const root = await a.create(),
    target = await b.create(),
    old = `${root}-retained`;
  await rename(root, old);
  await symlink(target, root);
  const foreign = await store(target);
  try {
    await expect(a.dispose()).rejects.toThrow('custody changed');
    await expect(foreign.verify()).resolves.toBeUndefined();
  } finally {
    await rm(root);
    await rm(old, { recursive: true });
    await b.dispose();
  }
});
test('nonprivate root refuses cleanup', async () => {
  const roots = new OwnedFixtureRoots(),
    root = await roots.create();
  await chmod(root, 0o755);
  try {
    await expect(roots.dispose()).rejects.toThrow('custody changed');
  } finally {
    await chmod(root, 0o700);
    await roots.dispose();
  }
});
test('body failure survives owned retirement', async () => {
  const error = Error('synthetic body failure');
  let path = '';
  try {
    await withOwnedFixtureRoots(async (roots) => {
      path = await roots.create();
      throw error;
    });
    throw Error('body unexpectedly passed');
  } catch (received) {
    expect(received).toBe(error);
  }
  await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('cleanup failure retains the original body failure', async () => {
  const body = Error('synthetic body failure');
  let root = '',
    old = '';
  try {
    await withOwnedFixtureRoots(async (roots) => {
      root = await roots.create();
      old = `${root}-retained`;
      await rename(root, old);
      await mkdir(root, { mode: 0o700 });
      throw body;
    });
    throw Error('cleanup unexpectedly passed');
  } catch (received) {
    expect(received).toBeInstanceOf(AggregateError);
    expect((received as AggregateError).errors[0]).toBe(body);
    expect((received as AggregateError).errors[1].message).toContain('custody changed');
  } finally {
    await rm(root, { recursive: true });
    await rm(old, { recursive: true });
  }
});
