import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkoutGcpBootstrap, storeGcpBootstrap } from '../../src/ce/bootstrap-checkout';
import { openGcpDeploymentStorage } from '../../src/ce/shared-storage';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true });
});
it('shared restricted storage retains one-use state across new GCP adapter instances', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-shared-')));
  dirs.push(root);
  const owner = {
    project: 'test-project',
    deploymentName: 'ce-test',
    siteName: 'site-test',
    nodeName: 'node-test',
    engine: 'native' as const,
  };
  const s = await openGcpDeploymentStorage(root, owner, 'northamerica-northeast1');
  const jwt = ['fixtureheader', 'fixturepayload', 'fixturesignature'].join('.');
  await storeGcpBootstrap(s, owner, { ...owner, jwt, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const resumed = await openGcpDeploymentStorage(root, owner, 'northamerica-northeast1');
  const data = await checkoutGcpBootstrap(resumed, owner);
  expect(data).toContain('/etc/vpm/user_data');
  const next = await openGcpDeploymentStorage(root, owner, 'northamerica-northeast1');
  await expect(checkoutGcpBootstrap(next, owner)).rejects.toThrow('unavailable');
  await expect(
    openGcpDeploymentStorage(root, { ...owner, engine: 'terraform' }, 'northamerica-northeast1'),
  ).rejects.toThrow('engine');
});
