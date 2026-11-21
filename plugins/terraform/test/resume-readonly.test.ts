import { afterEach, expect, test } from 'bun:test';
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Deployment, TerraformRunner } from '../src/runner';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const deployment: Deployment = {
  schemaVersion: 1,
  deploymentId: 'ce-status-first',
  engine: 'terraform',
  scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
  terraformVersion: '1.14.0',
  configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
  providerLock: '# fixture lock',
  backendIdentity: 'local:ce-status-first',
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-resume-observer-'));
  directories.push(root);
  let commands = 0;
  const runner = new TerraformRunner(join(root, 'native'), async () => {
    commands++;
    throw new Error('Resume/prepare must not execute Terraform');
  });
  return { root, runner, commands: () => commands };
}

test('observing an unstarted deployment leaves it absent and permits its first preparation', async () => {
  const { root, runner, commands } = await fixture();
  await expect(runner.resume(deployment.deploymentId, deployment, 'current')).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  await runner.prepare(deployment);
  expect((await lstat(join(root, 'native', deployment.deploymentId, 'deployment.json'))).isFile()).toBe(true);
  expect(commands()).toBe(0);
});

test('missing manifests preserve existing partial workspace bytes and directory permissions', async () => {
  const { root, runner, commands } = await fixture();
  const directory = join(root, 'native', deployment.deploymentId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'retained-partial.json'), '{}', { mode: 0o600 });
  await chmod(directory, 0o750);
  await expect(runner.resume(deployment.deploymentId, deployment, 'current')).rejects.toThrow();
  expect((await lstat(directory)).mode & 0o777).toBe(0o750);
  expect(await readdir(directory)).toEqual(['retained-partial.json']);
  expect(commands()).toBe(0);
});

test('an already private partial workspace is rejected without adding a manifest', async () => {
  const { root, runner, commands } = await fixture();
  const directory = join(root, 'native', deployment.deploymentId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await expect(runner.resume(deployment.deploymentId, deployment, 'current')).rejects.toThrow();
  expect(await readdir(directory)).toEqual([]);
  expect(commands()).toBe(0);
});
