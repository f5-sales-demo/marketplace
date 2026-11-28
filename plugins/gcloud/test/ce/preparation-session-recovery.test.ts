import { expect, test } from 'bun:test';
import { lstat, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { createCeTerraformService } from '../../../terraform/src/service';
import { GCP_LEGACY_TERRAFORM_ARTIFACTS } from '../../src/ce/terraform-public-artifacts';
import { openGcpTerraformSession } from '../../src/ce/terraform-session';
import { intent } from './fixtures';

test('production session recovers failed preparation once and keeps both original input receipts', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-session-preparation-recovery-')));
  try {
    const i = intent();
    i.engine = 'terraform';
    i.routing.destinationCidrs = [];
    const owner: CeOwner = {
      deploymentId: i.deploymentName,
      engine: 'terraform',
      provider: 'gcp',
      account: i.project,
      region: i.region,
    };
    const platform = { storage: (o: CeOwner) => CeDeploymentStore.open(root, o) } as CePlatformService;
    const input = { ...GCP_LEGACY_TERRAFORM_ARTIFACTS, intent: i };
    const failed = createCeTerraformService(async () => platform, {
      resolveRuntime: async () => {
        throw new Error('synthetic credential preparation failed');
      },
    });
    await expect(openGcpTerraformSession(platform, input, false, failed)).rejects.toThrow(
      'credential preparation failed',
    );
    const store = await platform.storage(owner);
    const original = [
      await store.read('gcp-terraform-input-identity.json'),
      await store.read('gcp-terraform-session-inputs.json'),
    ];
    await expect(lstat(join(store.directory, owner.deploymentId))).rejects.toThrow('ENOENT');
    const changed = { ...input, intent: { ...i, diskGiB: i.diskGiB + 10 } };
    await expect(openGcpTerraformSession(platform, changed, 'current')).rejects.toThrow('resume input identity');
    const outcomes = await Promise.allSettled([
      openGcpTerraformSession(platform, input, 'current'),
      openGcpTerraformSession(platform, input, 'current'),
    ]);
    const sessions = outcomes.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    const digest = await sessions[0].readConfigurationSha256?.();
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    const resumed = await openGcpTerraformSession(platform, input, 'current');
    expect(await resumed.readConfigurationSha256?.()).toBe(digest);
    expect([
      await store.read('gcp-terraform-input-identity.json'),
      await store.read('gcp-terraform-session-inputs.json'),
    ]).toEqual(original);
    await expect(openGcpTerraformSession(platform, input)).rejects.toThrow('must resume');
  } finally {
    await rm(root, { recursive: true });
  }
});

test('partial preparation with authorization cannot reopen any Terraform runtime', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-session-preparation-authority-')));
  try {
    const i = intent();
    i.engine = 'terraform';
    i.routing.destinationCidrs = [];
    const owner: CeOwner = {
      deploymentId: i.deploymentName,
      engine: 'terraform',
      provider: 'gcp',
      account: i.project,
      region: i.region,
    };
    const platform = { storage: (o: CeOwner) => CeDeploymentStore.open(root, o) } as CePlatformService;
    const input = { ...GCP_LEGACY_TERRAFORM_ARTIFACTS, intent: i };
    let opened = 0;
    const failed = createCeTerraformService(async () => platform, {
      resolveRuntime: async () => {
        opened++;
        throw new Error('synthetic preparation failure');
      },
    });
    await expect(openGcpTerraformSession(platform, input, false, failed)).rejects.toThrow('preparation failure');
    const store = await platform.storage(owner);
    await writeFile(join(store.directory, 'reviewed-authorization.json'), '{}', { mode: 0o600 });
    await expect(openGcpTerraformSession(platform, input, 'current', failed)).rejects.toThrow('reconcile');
    expect(opened).toBe(1);
    await expect(lstat(join(store.directory, owner.deploymentId))).rejects.toThrow('ENOENT');
  } finally {
    await rm(root, { recursive: true });
  }
});
