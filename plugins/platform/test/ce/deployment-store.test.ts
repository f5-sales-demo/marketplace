import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
const owner = {
  deploymentId: 'ce-test',
  engine: 'native' as const,
  provider: 'aws' as const,
  account: 'demo',
  region: 'us-east-1',
};
test('deployment storage survives a new service instance and rejects engine migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-store-'));
  dirs.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  await store.write('checkpoint.json', { step: 'issued' });
  const resumed = await CeDeploymentStore.open(root, owner);
  expect(await resumed.read('checkpoint.json')).toEqual({ step: 'issued' });
  expect((await stat(store.directory)).mode & 0o777).toBe(0o700);
  expect((await stat(join(store.directory, 'checkpoint.json'))).mode & 0o777).toBe(0o600);
  await expect(CeDeploymentStore.open(root, { ...owner, engine: 'terraform' })).rejects.toThrow('engine');
  await expect(store.write('owner.json', {})).rejects.toThrow('immutable');
  await expect(store.read('../escape')).rejects.toThrow('Invalid');
  await symlink('owner.json', join(store.directory, 'link.json'));
  await expect(store.read('link.json')).rejects.toThrow('ownership');
});

test('GCP deployment storage resumes exact project and engine bindings with private modes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gcp-ce-store-'));
  dirs.push(root);
  const gcp = { ...owner, provider: 'gcp' as const, account: 'example-project', region: 'northamerica-northeast1' };
  const store = await CeDeploymentStore.open(root, gcp);
  await store.write('checkpoint.json', {
    schemaVersion: 1,
    project: gcp.account,
    authorization: 'retained',
    operation: 'pending',
  });
  const resumed = await CeDeploymentStore.open(root, gcp);
  expect(await resumed.read('checkpoint.json')).toEqual({
    schemaVersion: 1,
    project: 'example-project',
    authorization: 'retained',
    operation: 'pending',
  });
  expect((await stat(join(store.directory, 'checkpoint.json'))).mode & 0o777).toBe(0o600);
  await expect(CeDeploymentStore.open(root, { ...gcp, engine: 'terraform' })).rejects.toThrow('engine');
});

import { spyOn } from 'bun:test';
import * as fs from 'node:fs/promises';

test('checkpoint persistence flushes file before rename and directory before completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'durable-ce-store-'));
  dirs.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  const events: string[] = [];
  const realOpen = fs.open;
  const realRename = fs.rename;
  const opening = spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await realOpen(...args);
    const sync = handle.sync.bind(handle);
    const path = String(args[0]);
    handle.sync = async () => {
      events.push(path === store.directory ? 'directory-sync' : 'file-sync');
      await sync();
    };
    return handle;
  });
  const renaming = spyOn(fs, 'rename').mockImplementation(async (...args) => {
    events.push('rename');
    return realRename(...args);
  });
  try {
    await store.write('checkpoint.json', { state: 'consumed' });
    events.push('returned');
    expect(events).toEqual(['file-sync', 'rename', 'directory-sync', 'returned']);
  } finally {
    opening.mockRestore();
    renaming.mockRestore();
  }
});

test('failed directory flush reports uncertain persistence and preserves renamed consumed state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'failed-durable-ce-store-'));
  dirs.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  const realOpen = fs.open;
  const opening = spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await realOpen(...args);
    if (String(args[0]) === store.directory)
      handle.sync = async () => {
        throw new Error('fixture directory flush failed');
      };
    return handle;
  });
  try {
    await expect(store.write('checkpoint.json', { state: 'consumed' })).rejects.toThrow('flush failed');
  } finally {
    opening.mockRestore();
  }
  expect(await store.read('checkpoint.json')).toEqual({ state: 'consumed' });
});

test('new store placement flushes the storage root and its parent before returning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'durable-store-placement-'));
  dirs.push(root);
  const realOpen = fs.open;
  const flushed: string[] = [];
  const opening = spyOn(fs, 'open').mockImplementation(async (...args) => {
    const handle = await realOpen(...args);
    const sync = handle.sync.bind(handle);
    handle.sync = async () => {
      flushed.push(String(args[0]));
      await sync();
    };
    return handle;
  });
  try {
    await CeDeploymentStore.open(root, owner);
    expect(flushed).toContain(root);
    expect(flushed).toContain((await import('node:path')).dirname(root));
  } finally {
    opening.mockRestore();
  }
});
