import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeWorkspace } from '../src/initialization';
import { type Deployment, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-original-initialization-'));
  roots.push(root);
  const deployment: Deployment = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'ce-original-initialization',
    scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
    terraformVersion: '1.14.0',
    backendIdentity: 'local:ce-original-initialization',
    configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
    providerLock: '# original lock',
  };
  const { configuration, providerLock, ...identity } = deployment;
  const manifest = { ...identity, configurationSha256: sha(configuration), providerLockSha256: sha(providerLock) };
  let calls = 0;
  const runner = new TerraformRunner(root, async () => {
    calls++;
    throw Error('No Terraform command permitted during initialization recovery');
  });
  return { root, deployment, manifest, runner, calls: () => calls };
}
test('the real runner recovers original partial initialization without executing Terraform', async () => {
  const { root, deployment, manifest, runner, calls } = await fixture();
  const original = new TerraformRunner(root);
  await original.prepare(deployment);
  const directory = join(root, deployment.deploymentId);
  const cliConfig = await readFile(join(directory, 'deployment.tfrc'), 'utf8');
  await rm(directory, { recursive: true });
  await expect(
    initializeWorkspace(
      {
        root,
        deploymentId: deployment.deploymentId,
        manifest,
        configuration: deployment.configuration,
        providerLock: deployment.providerLock,
        cliConfig,
      },
      {
        write: async (path, data) => {
          await writeFile(path, path.endsWith('/main.tf.json') ? data.subarray(0, 3) : data, {
            mode: 0o600,
            flag: 'wx',
          });
          if (path.endsWith('/main.tf.json')) throw Error('Original creator interrupted');
        },
      },
    ),
  ).rejects.toThrow('interrupted');
  await expect(new TerraformRunner(root).resume(deployment.deploymentId, deployment, 'current')).rejects.toThrow();
  expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toHaveLength(3);
  await runner.recoverPreparation(deployment);
  expect(await runner.readConfigurationSha256()).toBe(sha(deployment.configuration));
  expect(calls()).toBe(0);
  expect(await readdir(root)).toEqual([deployment.deploymentId]);
});
test('real runner recovery rejects historical missing intent and changed original scope', async () => {
  const { root, deployment, runner } = await fixture();
  await expect(runner.recoverPreparation(deployment)).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
  await runner.prepare(deployment);
  await expect(
    new TerraformRunner(root).recoverPreparation({
      ...deployment,
      scope: { ...deployment.scope, account: 'foreign-example-account' },
    }),
  ).rejects.toThrow();
});
