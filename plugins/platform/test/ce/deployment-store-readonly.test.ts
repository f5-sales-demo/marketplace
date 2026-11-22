import { afterEach, expect, test } from 'bun:test';
import { chmod, lstat, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCeTerraformService } from '../../../terraform/src/service';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import type { CeOwner } from '../../src/ce/runtime';
import { createCePlatformService } from '../../src/ce/service';

const roots: string[] = [];
const owner: CeOwner = {
  deploymentId: 'ce-readonly',
  engine: 'terraform',
  provider: 'aws',
  account: '123456789012',
  region: 'us-east-2',
};
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'ce-readonly-'));
  roots.push(base);
  return join(base, 'deployments');
}
test('read-only deployment lookup leaves missing storage absent', async () => {
  const root = await fixture();
  await expect(CeDeploymentStore.open(root, owner, { readOnly: true })).rejects.toThrow();
  await expect(lstat(root)).rejects.toThrow();
});
test('public platform storage read-only selection does not initialize owner metadata', async () => {
  const root = await fixture();
  const service = createCePlatformService({ XCSH_CE_DEPLOYMENTS_DIR: root });
  await expect(service.storage(owner, { readOnly: true })).rejects.toThrow();
  await expect(lstat(root)).rejects.toThrow();
});
test('read-only existing storage preserves evidence and rejects every write method', async () => {
  const root = await fixture();
  const writable = await CeDeploymentStore.open(root, owner);
  await writable.write('evidence.json', { state: 'observed' });
  const before = await readdir(writable.directory);
  const existing = await CeDeploymentStore.open(root, owner, { readOnly: true });
  expect(await existing.read('evidence.json')).toEqual({ state: 'observed' });
  await expect(existing.write('other.json', {})).rejects.toThrow();
  await expect(existing.reserve('reservation.json', {})).rejects.toThrow();
  await expect(existing.remove('evidence.json')).rejects.toThrow();
  expect(await readdir(writable.directory)).toEqual(before);
  expect(await writable.read('evidence.json')).toEqual({ state: 'observed' });
});
test('read-only lookup rejects a foreign engine without creating or repairing metadata', async () => {
  const root = await fixture();
  const writable = await CeDeploymentStore.open(root, owner);
  const before = await readdir(root);
  await expect(CeDeploymentStore.open(root, { ...owner, engine: 'native' }, { readOnly: true })).rejects.toThrow();
  expect(await readdir(root)).toEqual(before);
  await chmod(writable.directory, 0o755);
  await expect(CeDeploymentStore.open(root, owner, { readOnly: true })).rejects.toThrow();
  expect((await lstat(writable.directory)).mode & 0o777).toBe(0o755);
});

test('current Terraform observation cannot initialize a missing deployment owner', async () => {
  const root = await fixture();
  const platform = createCePlatformService({ XCSH_CE_DEPLOYMENTS_DIR: root });
  const service = createCeTerraformService(async () => platform);
  await expect(
    service.open(
      owner,
      {
        schemaVersion: 1,
        deploymentId: owner.deploymentId,
        engine: 'terraform',
        scope: { cloud: 'aws', account: owner.account, region: owner.region },
        terraformVersion: '1.17.1',
        configuration: '{}',
        providerLock: '# fixture',
        backendIdentity: 'local:ce-readonly',
      },
      'current',
    ),
  ).rejects.toThrow();
  await expect(lstat(root)).rejects.toThrow();
});
