import { afterEach, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { openGcpTerraformSession, resumeGcpTerraformSession } from '../../src/ce/terraform-session';
import { intent } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true });
});
function inputs() {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const providerLock = ['hashicorp/google', 'f5-sales-demo/xcsh']
    .map(
      (p, n) =>
        `provider "registry.terraform.io/${p}" {\n  version     = "${n ? '15.10.5' : '8.7.0'}"\n  hashes = ["zh:${'a'.repeat(64)}"]\n}`,
    )
    .join('\n');
  return {
    intent: i,
    versions: { google: '8.7.0', xcsh: '15.10.5', terraform: '1.16.6' },
    providerLock,
    expectedLockSha256: `sha256:${createHash('sha256').update(providerLock).digest('hex')}`,
  };
}
it('prepares GCP configuration through shared restricted session and resumes exact identity', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-session-')));
  roots.push(root);
  const platform = { storage: (owner) => CeDeploymentStore.open(root, owner) } as CePlatformService;
  const first = await openGcpTerraformSession(platform, inputs());
  const digest = await first.readConfigurationSha256?.();
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  const resumed = await openGcpTerraformSession(platform, inputs(), true);
  expect(await resumed.readConfigurationSha256?.()).toBe(digest);
  const owner = {
    deploymentId: inputs().intent.deploymentName,
    engine: 'terraform' as const,
    provider: 'gcp' as const,
    account: inputs().intent.project,
    region: inputs().intent.region,
  };
  const saved = (await (await platform.storage(owner)).read('gcp-terraform-input-identity.json')) as {
    intent: ReturnType<typeof inputs>['intent'];
    platformContext: string;
  };
  expect(saved.intent).toEqual(inputs().intent);
  expect(saved.platformContext).toBe(inputs().intent.platformContext);
  const current = await resumeGcpTerraformSession(platform, inputs().intent);
  expect(await current.readConfigurationSha256?.()).toBe(digest);
});
it('rejects wrong owning engine, changed lock or unpinned provider before storage access', async () => {
  let calls = 0;
  const platform = {
    storage: async () => {
      calls++;
      throw new Error('must not open');
    },
  } as unknown as CePlatformService;
  const input = inputs();
  input.intent.engine = 'native';
  await expect(openGcpTerraformSession(platform, input)).rejects.toThrow('native');
  input.intent.engine = 'terraform';
  input.providerLock += 'changed';
  await expect(openGcpTerraformSession(platform, input)).rejects.toThrow('bytes');
  expect(calls).toBe(0);
});
it('resume refuses changed configuration and preserves recorded identity', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-session-drift-')));
  roots.push(root);
  const platform = { storage: (owner) => CeDeploymentStore.open(root, owner) } as CePlatformService;
  const first = inputs();
  await openGcpTerraformSession(platform, first);
  const changed = inputs();
  changed.intent.diskGiB = 100;
  await expect(openGcpTerraformSession(platform, changed, true)).rejects.toThrow('resume input identity');
  await expect(openGcpTerraformSession(platform, first)).rejects.toThrow('must resume');
  await openGcpTerraformSession(platform, first, true);
});

it('resume rejects F5 context changes even when generated Terraform configuration is identical', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-session-context-')));
  roots.push(root);
  const platform = { storage: (owner) => CeDeploymentStore.open(root, owner) } as CePlatformService;
  const first = inputs();
  const session = await openGcpTerraformSession(platform, first);
  const digest = await session.readConfigurationSha256?.();
  const changed = inputs();
  changed.intent.platformContext = 'another-context';
  await expect(openGcpTerraformSession(platform, changed, true)).rejects.toThrow('resume input identity');
  const resumed = await openGcpTerraformSession(platform, first, true);
  expect(await resumed.readConfigurationSha256?.()).toBe(digest);
});
