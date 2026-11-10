import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { runAwsTerraformInitialReplacement } from '../../src/ce/terraform-initial-replacement';
import { admissionFixture } from './terraform-admission-fixture';

test('ordinary admission does not load a replacement contract or mutate resources', async () => {
  const f = admissionFixture();
  let loaded = 0;
  const result = await runAwsTerraformInitialReplacement(
    f.plan,
    {} as never,
    f.runtime as never,
    f.storage as never,
    f.api,
    fetch,
    undefined,
    async () => {
      loaded++;
      throw Error('not needed');
    },
  );
  expect(result).toEqual({ handled: false, status: 'not-required' });
  expect(loaded).toBe(0);
});

test('unstable replacement versions remain pending before shutdown and preserve source journal', async () => {
  const f = admissionFixture();
  const siteName = f.plan.intent.topology.sites?.[0].name ?? 'missing';
  const preparation = {
    evidenceKind: 'preboot-interface-configuration-required',
    planId: f.plan.planId,
    planSha256: f.plan.planSha256,
    uid: 'site-uid',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  await f.storage.write(`terraform-interface-mtu-${siteName}.json`, preparation);
  let opened = 0;
  const result = await runAwsTerraformInitialReplacement(
    f.plan,
    {
      open: async () => {
        opened++;
        return f.session;
      },
    },
    { engine: 'terraform', observeUpgrade: async () => ({ status: 'unknown' }) } as unknown as CeRuntime,
    f.storage as unknown as CeDeploymentStore,
    f.api,
    fetch,
    undefined,
    async () => ({ fingerprint: `sha256:${'b'.repeat(64)}` }) as VerifiedUpgradeContract,
  );
  expect(result).toEqual({ handled: true, status: 'pending-replacement-versions' });
  expect(opened).toBe(1);
  expect(await f.storage.read(`terraform-interface-mtu-${siteName}.json`)).toEqual(preparation);
  await expect(f.storage.read(`terraform-initial-replacement-${siteName}.json`)).rejects.toThrow('missing');
  expect(f.nodes.size).toBe(0);
});

test('foreign preparation or runtime cannot reach replacement shutdown', async () => {
  const f = admissionFixture();
  const siteName = f.plan.intent.topology.sites?.[0].name ?? 'missing';
  await f.storage.write(`terraform-interface-mtu-${siteName}.json`, {
    evidenceKind: 'preboot-interface-configuration-required',
    planId: 'foreign',
    planSha256: 'b'.repeat(64),
  });
  const runtime = { engine: 'terraform' } as CeRuntime;
  const service = { open: async () => f.session };
  await expect(
    runAwsTerraformInitialReplacement(
      f.plan,
      service,
      runtime,
      f.storage as never,
      f.api,
      fetch,
      undefined,
      async () => ({}) as VerifiedUpgradeContract,
    ),
  ).rejects.toThrow('owning plan');
  await expect(
    runAwsTerraformInitialReplacement(
      f.plan,
      service,
      { engine: 'native' } as CeRuntime,
      f.storage as never,
      f.api,
      fetch,
    ),
  ).rejects.toThrow('runtime ownership');
});
