import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { assertInstalledRuntime, createInstalledRuntimeResolver } from '../src/installed-runtime';
import type { Deployment } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'installed-runtime-'));
  roots.push(root);
  const owner: CeOwner = {
    provider: 'gcp',
    engine: 'terraform',
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'ce-fixture',
  };
  const store = await CeDeploymentStore.open(root, owner);
  const platform = { storage: (who: CeOwner) => CeDeploymentStore.open(root, who) } as CePlatformService;
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: owner.deploymentId,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: owner.account, region: owner.region },
    terraformVersion: '1.16.6',
    configuration: '{}',
    providerLock: '# fixture',
    backendIdentity: 'local:ce-fixture',
  };
  return { root, owner, deployment, store, platform };
}
test('legacy GCP resume reports missing setup without rewriting its manifest or credential mode', async () => {
  const f = await fixture();
  await mkdir(join(f.store.directory, f.owner.deploymentId), { mode: 0o700 });
  await writeFile(join(f.store.directory, f.owner.deploymentId, 'deployment.json'), JSON.stringify(f.deployment), {
    mode: 0o600,
  });
  const resolve = createInstalledRuntimeResolver({ XCSH_TERRAFORM_RUNTIME_DIR: join(f.root, 'absent-runtime') });
  await expect(
    resolve({
      owner: f.owner,
      deployment: f.deployment,
      directory: f.store.directory,
      resume: true,
      platform: f.platform,
    }),
  ).rejects.toThrow('set up the Terraform');
  expect(await Bun.file(join(f.store.directory, f.owner.deploymentId, 'deployment.json')).text()).toBe(
    JSON.stringify(f.deployment),
  );
  expect(await Bun.file(join(f.store.directory, 'google-runtime-mode.json')).exists()).toBe(false);
});
test('new GCP sessions report the installed prerequisite before creating a credential-mode receipt', async () => {
  const f = await fixture();
  const resolve = createInstalledRuntimeResolver({ XCSH_TERRAFORM_RUNTIME_DIR: join(f.root, 'absent-runtime') });
  await expect(
    resolve({
      owner: f.owner,
      deployment: f.deployment,
      directory: f.store.directory,
      resume: false,
      platform: f.platform,
    }),
  ).rejects.toThrow('set up the Terraform');
  expect(await Bun.file(join(f.store.directory, 'google-runtime-mode.json')).exists()).toBe(false);
});
test('opening an existing deployment as new cannot add or migrate its credential-mode receipt', async () => {
  const f = await fixture();
  await mkdir(join(f.store.directory, f.owner.deploymentId), { mode: 0o700 });
  await writeFile(join(f.store.directory, f.owner.deploymentId, 'deployment.json'), JSON.stringify(f.deployment), {
    mode: 0o600,
  });
  const resolve = createInstalledRuntimeResolver({ XCSH_TERRAFORM_RUNTIME_DIR: join(f.root, 'absent-runtime') });
  await expect(
    resolve({
      owner: f.owner,
      deployment: f.deployment,
      directory: f.store.directory,
      resume: false,
      platform: f.platform,
    }),
  ).rejects.toThrow('Existing deployment must resume');
  expect(await Bun.file(join(f.store.directory, 'google-runtime-mode.json')).exists()).toBe(false);
});
test('other provider sessions retain their existing runtime and do not require Google setup', async () => {
  const f = await fixture();
  const resolve = createInstalledRuntimeResolver({ XCSH_TERRAFORM_RUNTIME_DIR: join(f.root, 'absent-runtime') });
  expect(
    await resolve({
      owner: { ...f.owner, provider: 'aws' },
      deployment: { ...f.deployment, scope: { ...f.deployment.scope, cloud: 'aws' } },
      directory: f.store.directory,
      resume: false,
      platform: f.platform,
    }),
  ).toEqual({});
});
test('installed runtime preflight refuses an absent or aliased SDK without launching an interpreter', async () => {
  const f = await fixture();
  await expect(assertInstalledRuntime({ XCSH_TERRAFORM_RUNTIME_DIR: join(f.root, 'absent-runtime') })).rejects.toThrow(
    'set up the Terraform',
  );
});
