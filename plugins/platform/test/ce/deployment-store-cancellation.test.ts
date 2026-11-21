import { expect, test } from 'bun:test';
import { lstat, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';

const owner = {
  deploymentId: 'cancellation-fixture',
  engine: 'terraform' as const,
  provider: 'azure' as const,
  account: 'example-fixture-account',
  region: 'fixture-region',
};

test('native private write rejects preabort without replacing retained bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-store-cancellation-'));
  try {
    const store = await CeDeploymentStore.open(root, owner);
    await store.write('checkpoint.json', { retained: 'original' });
    const path = join(store.directory, 'checkpoint.json');
    const before = await readFile(path),
      identity = await lstat(path);
    const controller = new AbortController(),
      reason = Error('fixture-preabort');
    controller.abort(reason);
    let failure: unknown;
    try {
      await store.write('checkpoint.json', { projected: true }, controller.signal);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(reason);
    expect(await readFile(path)).toEqual(before);
    expect((await lstat(path)).ino).toBe(identity.ino);
    expect((await readdir(store.directory)).sort()).toEqual(['checkpoint.json', 'owner.json']);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('native private write cannot continue after abort during ignored verification', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-store-cancellation-'));
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  let pending: Promise<void> | undefined;
  try {
    const store = await CeDeploymentStore.open(root, owner);
    await store.write('checkpoint.json', { retained: 'original' });
    const path = join(store.directory, 'checkpoint.json');
    const before = await readFile(path),
      identity = await lstat(path);
    const verify = store.verify.bind(store);
    store.verify = async () => {
      await verify();
      entered.resolve();
      await release.promise;
    };
    const controller = new AbortController(),
      reason = Error('fixture-inflight-abort');
    let settled = false,
      failure: unknown;
    const writing: Promise<void> = store.write('checkpoint.json', { projected: true }, controller.signal);
    pending = writing;
    void writing.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await entered.promise;
    controller.abort(reason);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    release.resolve();
    try {
      await writing;
    } catch (error) {
      failure = error;
    }
    expect(failure).toBe(reason);
    expect(await readFile(path)).toEqual(before);
    expect((await lstat(path)).ino).toBe(identity.ino);
    expect((await readdir(store.directory)).sort()).toEqual(['checkpoint.json', 'owner.json']);
  } finally {
    release.resolve();
    await pending?.catch(() => {});
    await rm(root, { recursive: true });
  }
});

test('native private write still publishes exact private bytes without cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-store-cancellation-'));
  try {
    const store = await CeDeploymentStore.open(root, owner);
    const controller = new AbortController();
    await store.write('checkpoint.json', { projected: true }, controller.signal);
    expect(await store.read('checkpoint.json')).toEqual({ projected: true });
    expect((await lstat(join(store.directory, 'checkpoint.json'))).mode & 0o077).toBe(0);
    expect((await readdir(store.directory)).sort()).toEqual(['checkpoint.json', 'owner.json']);
  } finally {
    await rm(root, { recursive: true });
  }
});
