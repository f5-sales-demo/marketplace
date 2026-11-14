import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { initializeWorkspace, readInitializationManifest } from '../src/initialization';
import type { Deployment } from '../src/runner';
import { createCeTerraformService } from '../src/service';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
for (const provider of ['aws', 'azure'] as const) {
  test(`${provider} service recovers only original creator inputs after a read-only manifest observation`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-initialization-service-'));
    roots.push(root);
    const owner: CeOwner = {
      deploymentId: 'ce-original-service',
      engine: 'terraform',
      provider,
      account: 'example-account',
      region: 'example-region',
    };
    const deployment: Deployment = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: owner.deploymentId,
      scope: { cloud: provider, account: owner.account, region: owner.region },
      terraformVersion: '1.16.5',
      configuration: '{"terraform":{"required_version":"= 1.16.5"}}',
      providerLock: '# original lock',
      backendIdentity: 'local:ce-original-service',
    };
    const platform = { storage: (o: CeOwner) => CeDeploymentStore.open(root, o) } as CePlatformService;
    const service = createCeTerraformService(async () => platform);
    await service.open(owner, deployment, false);
    const store = await platform.storage(owner);
    const directory = join(store.directory, owner.deploymentId);
    const manifest = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
    const cliConfig = await readFile(join(directory, 'deployment.tfrc'), 'utf8');
    await rm(directory, { recursive: true });
    await expect(
      initializeWorkspace(
        {
          root: store.directory,
          deploymentId: owner.deploymentId,
          manifest,
          configuration: deployment.configuration,
          providerLock: deployment.providerLock,
          cliConfig,
        },
        {
          write: async (path, bytes) => {
            await writeFile(path, path.endsWith('/main.tf.json') ? bytes.subarray(0, 5) : bytes, {
              mode: 0o600,
              flag: 'wx',
            });
            if (path.endsWith('/main.tf.json')) throw Error('Original creator interrupted');
          },
        },
      ),
    ).rejects.toThrow('interrupted');
    await expect(service.open(owner, deployment, 'current')).rejects.toThrow();
    expect(await readInitializationManifest(store.directory, owner.deploymentId, owner)).toEqual(manifest);
    expect(await readdir(directory)).toEqual(['main.tf.json']);
    await expect(
      readInitializationManifest(store.directory, owner.deploymentId, { ...owner, account: 'example-foreign-account' }),
    ).rejects.toThrow();
    const recovered = await service.open(owner, deployment, 'recover-initialization');
    expect(await recovered.readConfigurationSha256?.()).toBe(manifest.configurationSha256);
    expect((await readdir(directory)).sort()).toEqual([
      '.terraform.lock.hcl',
      'deployment.json',
      'deployment.tfrc',
      'main.tf.json',
    ]);
    await rm(join(directory, 'deployment.json'));
    await expect(service.open(owner, deployment, 'recover-initialization')).rejects.toThrow();
  });
}

for (const field of ['root', 'custody', 'deploymentId', 'configurationHash', 'manifestHash', 'extraField'] as const) {
  test(`manifest observation rejects altered creator intent ${field} without repairing inputs`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-intent-rejection-'));
    roots.push(root);
    const owner: CeOwner = {
      deploymentId: 'ce-intent-rejection',
      engine: 'terraform',
      provider: 'aws',
      account: 'example-account',
      region: 'example-region',
    };
    const configuration = '{"terraform":{}}',
      providerLock = '# original lock';
    const manifest = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: owner.deploymentId,
      scope: { cloud: owner.provider, account: owner.account, region: owner.region },
      configurationSha256: createHash('sha256').update(configuration).digest('hex'),
      providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
    };
    await expect(
      initializeWorkspace(
        {
          root,
          deploymentId: owner.deploymentId,
          manifest,
          configuration,
          providerLock,
          cliConfig: 'original cli',
        },
        {
          write: async (path, data) => {
            await writeFile(path, path.endsWith('/main.tf.json') ? data.subarray(0, 3) : data, {
              mode: 0o600,
              flag: 'wx',
            });
            if (path.endsWith('/main.tf.json')) throw Error('interrupted');
          },
        },
      ),
    ).rejects.toThrow('interrupted');
    const intentPath = join(root, '.initialization-' + owner.deploymentId + '.json');
    const record = JSON.parse(await readFile(intentPath, 'utf8'));
    if (field === 'root') record.root = root + '-foreign';
    if (field === 'custody') record.custody.ino++;
    if (field === 'deploymentId') record.deploymentId = 'foreign-owner';
    if (field === 'configurationHash') record.inputs['main.tf.json'] = 'f'.repeat(64);
    if (field === 'manifestHash') record.inputs['deployment.json'] = 'f'.repeat(64);
    if (field === 'extraField') record.futureSuccess = true;
    await writeFile(intentPath, JSON.stringify(record), { mode: 0o600 });
    await expect(readInitializationManifest(root, owner.deploymentId, owner)).rejects.toThrow();
    expect(await readdir(join(root, owner.deploymentId))).toEqual(['main.tf.json']);
    expect(await readFile(join(root, owner.deploymentId, 'main.tf.json'), 'utf8')).toBe(configuration.slice(0, 3));
  });
}
test('read-only manifest observation rejects a symlinked original input without following it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-intent-symlink-'));
  roots.push(root);
  const owner: CeOwner = {
    deploymentId: 'ce-intent-symlink',
    engine: 'terraform',
    provider: 'azure',
    account: 'example-account',
    region: 'example-region',
  };
  const configuration = '{"terraform":{}}',
    providerLock = '# original lock';
  const manifest = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: owner.deploymentId,
    scope: { cloud: owner.provider, account: owner.account, region: owner.region },
    configurationSha256: createHash('sha256').update(configuration).digest('hex'),
    providerLockSha256: createHash('sha256').update(providerLock).digest('hex'),
  };
  await expect(
    initializeWorkspace(
      {
        root,
        deploymentId: owner.deploymentId,
        manifest,
        configuration,
        providerLock,
        cliConfig: 'original cli',
      },
      {
        write: async (path, data) => {
          await writeFile(path, path.endsWith('/main.tf.json') ? data.subarray(0, 3) : data, {
            mode: 0o600,
            flag: 'wx',
          });
          if (path.endsWith('/main.tf.json')) throw Error('interrupted');
        },
      },
    ),
  ).rejects.toThrow('interrupted');
  const input = join(root, owner.deploymentId, 'main.tf.json'),
    foreign = join(root, 'foreign');
  await rm(input);
  await writeFile(foreign, 'retain original foreign content', { mode: 0o600 });
  await symlink(foreign, input);
  await expect(readInitializationManifest(root, owner.deploymentId, owner)).rejects.toThrow('custody');
  expect(await readFile(foreign, 'utf8')).toBe('retain original foreign content');
});
