import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureFailoverOwner, buildAzureCeFailoverPlan } from '../../src/ce/failover';
import { compileAzureCePlan } from '../../src/ce/planner';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const p of directories.splice(0)) await rm(p, { recursive: true, force: true });
});
function failoverFixture() {
  const sourceVmResourceId =
    `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.topology.ha = true;
  selected.routing = { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 };
  selected.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
  }));
  selected.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.2.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
  };
  selected.brownfield.resourceIds = [sourceVmResourceId];
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(selected, observed);
  const vmResourceId = plan.actions.find((action) => action.kind === 'vm-create' && action.node === 1)?.resourceId;
  if (!vmResourceId) throw new Error('missing failover VM');
  const failover = buildAzureCeFailoverPlan(plan, {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine: 'terraform',
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex: 1,
    vmResourceId,
    vmId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    powerState: 'running',
    observedAt: '2026-09-10T12:00:00Z',
  });
  return { plan, failover };
}

import { qualifyAzureTerraformTeardownStageHistory } from '../../src/ce/terraform-teardown-stage-history';

for (const fault of [
  'identity-fingerprint',
  'none',
  'no-stage',
  'missing-source',
  'malformed-source',
  'foreign-source',
  'wrong-source-filename',
  'public-root',
  'public-stage',
  'symlink-stage',
  'foreign-owner',
  'changed-reader',
  'changed-verifier',
  'source-changed',
  'inventory-changed',
  'source-added',
  'directory-replaced',
  'public-store',
  'ignored-cancellation',
  'pre-aborted',
] as const) {
  test(`Azure teardown stage history ${fault}`, async () => {
    const { plan, failover } = failoverFixture();
    const root = await mkdtemp(join(tmpdir(), 'azure-stage-preflight-'));
    directories.push(root);
    const store = await CeDeploymentStore.open(root, azureFailoverOwner(plan));
    const stageRoot = join(store.directory, 'terraform-stages');
    const stage = `failover-${failover.planSha256.slice(0, 24)}`;
    const sourceName = `${failover.planId}.json`;
    await store.write(sourceName, failover);
    if (fault !== 'no-stage') await mkdir(join(stageRoot, stage), { recursive: true, mode: 0o700 });
    if (fault === 'missing-source') await store.remove(sourceName);
    if (fault === 'malformed-source') await store.write(sourceName, {});
    if (fault === 'foreign-source') await store.write(sourceName, { ...failover, sourcePlanSha256: 'f'.repeat(64) });
    if (fault === 'wrong-source-filename') {
      await store.remove(sourceName);
      await store.write(`azure-ce-failover-${'f'.repeat(24)}.json`, failover);
    }
    if (fault === 'public-store') await chmod(store.directory, 0o755);
    if (fault === 'public-root') await chmod(stageRoot, 0o755);
    if (fault === 'public-stage') await chmod(join(stageRoot, stage), 0o755);
    if (fault === 'symlink-stage') {
      await rm(join(stageRoot, stage), { recursive: true });
      await symlink(root, join(stageRoot, stage));
    }
    if (fault === 'foreign-owner') store.owner.deploymentId = 'foreign';
    const read = store.read,
      verify = store.verify,
      write = store.write;
    let reads = 0,
      writes = 0;
    store.write = async () => {
      writes++;
      throw Error('unexpected preflight write');
    };
    if (['changed-reader', 'source-changed', 'inventory-changed', 'source-added', 'directory-replaced'].includes(fault))
      store.read = async (name) => {
        const value = await read.call(store, name);
        if (name === sourceName && ++reads === 1) {
          if (fault === 'directory-replaced') {
            await rename(join(stageRoot, stage), join(root, 'retained-stage'));
            await mkdir(join(stageRoot, stage), { mode: 0o700 });
          }
          if (fault === 'changed-reader') store.read = read;
          if (fault === 'source-changed')
            await write.call(store, name, { ...failover, sourcePlanSha256: 'f'.repeat(64) });
          if (fault === 'inventory-changed')
            await mkdir(join(stageRoot, `failover-${'b'.repeat(24)}`), { mode: 0o700 });
          if (fault === 'source-added') await write.call(store, `azure-ce-failover-${'b'.repeat(24)}.json`, failover);
        }
        return value;
      };
    if (fault === 'changed-verifier')
      store.verify = async () => {
        await verify.call(store);
        store.verify = verify;
      };
    if (fault === 'ignored-cancellation') store.verify = () => new Promise<void>(() => {});
    const controller = new AbortController();
    if (fault === 'pre-aborted') controller.abort(Error('already cancelled'));
    const signal = fault === 'ignored-cancellation' ? AbortSignal.timeout(25) : controller.signal;
    const before = Date.now();
    if (fault === 'none' || fault === 'identity-fingerprint' || fault === 'no-stage') {
      const result = await qualifyAzureTerraformTeardownStageHistory(plan, store, signal);
      expect(result.stages).toEqual(fault !== 'no-stage' ? [stage] : []);
      expect(result.failovers.map((value) => canonicalSha256(value))).toEqual(
        fault !== 'no-stage' ? [canonicalSha256(failover)] : [],
      );
      expect(result.upgrades).toEqual([]);
      expect(result.upgradeContract).toBeUndefined();
      if (fault === 'identity-fingerprint') {
        expect((await qualifyAzureTerraformTeardownStageHistory(plan, store, signal)).sourceSha256).toBe(
          result.sourceSha256,
        );
        await rename(join(stageRoot, stage), join(root, 'retained-stage'));
        await mkdir(join(stageRoot, stage), { mode: 0o700 });
        expect((await qualifyAzureTerraformTeardownStageHistory(plan, store, signal)).sourceSha256).not.toBe(
          result.sourceSha256,
        );
      }
    } else await expect(qualifyAzureTerraformTeardownStageHistory(plan, store, signal)).rejects.toThrow();
    if (fault === 'ignored-cancellation') expect(Date.now() - before).toBeLessThan(1000);
    expect(writes).toBe(0);
  });
}
