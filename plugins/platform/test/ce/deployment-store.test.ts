import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises';
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

test('private deployment JSON diagnostics do not expose malformed enrollment material', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-store-private-json-'));
  dirs.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  const secret = 'opaque-ce-private-material';
  await writeFile(join(store.directory, 'enrollment.json'), `{"jwt":"${secret}", broken-json}`, { mode: 0o600 });
  await expect(store.read('enrollment.json')).rejects.toThrow('Malformed CE deployment artifact');
  try {
    await store.read('enrollment.json');
  } catch (error) {
    expect(String(error)).not.toContain(secret);
  }
  await expect(store.read('missing.json')).rejects.toMatchObject({ code: 'ENOENT' });
});
