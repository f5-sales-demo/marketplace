import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeWorkspace } from '../src/initialization';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-initialization-'));
  roots.push(root);
  const input = {
    root,
    deploymentId: 'ce-initialization',
    manifest: {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: 'ce-initialization',
      scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
    },
    configuration: '{"terraform":{}}',
    providerLock: '# exact lock',
    cliConfig: 'provider_installation { direct {} }',
  };
  return { root, input, directory: join(root, input.deploymentId) };
}
async function interrupted(input: Awaited<ReturnType<typeof fixture>>['input']) {
  await expect(
    initializeWorkspace(input, {
      write: async (path, bytes) => {
        if (path.endsWith('/main.tf.json')) {
          await writeFile(path, bytes.subarray(0, 4), { mode: 0o600, flag: 'wx' });
          throw new Error('Interruption after original input prefix');
        }
        await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
      },
    }),
  ).rejects.toThrow('Interruption');
}
test('recovery completes only the original interrupted private input bytes', async () => {
  const { input, directory, root } = await fixture();
  await interrupted(input);
  const intent = await readFile(join(root, '.initialization-ce-initialization.json'), 'utf8');
  expect(intent).not.toContain(input.configuration);
  await initializeWorkspace(input, { recoverOnly: true });
  expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toBe(input.configuration);
  expect((await readdir(directory)).sort()).toEqual([
    '.terraform.lock.hcl',
    'deployment.json',
    'deployment.tfrc',
    'main.tf.json',
  ]);
  expect(await readdir(root)).toEqual(['ce-initialization']);
});
test('an unknown preexisting empty workspace receives no invented initialization intent', async () => {
  const { input, directory, root } = await fixture();
  await mkdir(directory, { mode: 0o700 });
  await expect(initializeWorkspace(input)).rejects.toThrow();
  expect(await readdir(root)).toEqual(['ce-initialization']);
  expect(await readdir(directory)).toEqual([]);
});
test('recovery cannot begin a fresh initialization or accept changed original inputs', async () => {
  const { input, root } = await fixture();
  await expect(initializeWorkspace(input, { recoverOnly: true })).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  await interrupted(input);
  await expect(
    initializeWorkspace({ ...input, providerLock: '# different lock' }, { recoverOnly: true }),
  ).rejects.toThrow();
});
test('conflicting partial bytes and extra artifacts block recovery without being removed', async () => {
  const { input, directory } = await fixture();
  await interrupted(input);
  await writeFile(join(directory, 'main.tf.json'), 'FOREIGN', { mode: 0o600 });
  await expect(initializeWorkspace(input, { recoverOnly: true })).rejects.toThrow();
  expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toBe('FOREIGN');
  await writeFile(join(directory, 'main.tf.json'), input.configuration, { mode: 0o600 });
  await writeFile(join(directory, 'unknown.json'), '{}', { mode: 0o600 });
  await expect(initializeWorkspace(input, { recoverOnly: true })).rejects.toThrow();
  expect(await readFile(join(directory, 'unknown.json'), 'utf8')).toBe('{}');
});
test('a symlinked interrupted input cannot redirect recovery writes', async () => {
  const { input, directory, root } = await fixture();
  await interrupted(input);
  await rm(join(directory, 'main.tf.json'));
  const foreign = join(root, 'foreign');
  await writeFile(foreign, 'retain', { mode: 0o600 });
  await symlink(foreign, join(directory, 'main.tf.json'));
  await expect(initializeWorkspace(input, { recoverOnly: true })).rejects.toThrow();
  expect(await readFile(foreign, 'utf8')).toBe('retain');
});
