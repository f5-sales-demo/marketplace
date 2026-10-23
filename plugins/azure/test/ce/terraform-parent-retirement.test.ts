import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { storeBootstrapToken } from '../../../platform/src/ce/token-store';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
for (const fault of [
  'none',
  'missing-independent',
  'unknown',
  'public-update',
  'public-update-prepared',
  'foreign-public-update',
  'malformed-public-update',
  'foreign-public-update-plan',
  'foreign-runner',
  'changed-artifact',
  'interrupted',
  'reconciliation',
  'foreign-reconciliation',
  'malformed-reconciliation',
  'owned-reconciliation',
  'foreign-owned-reconciliation',
] as const) {
  test(`Azure parent retirement ${fault}`, async () => {
    const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation),
      binding = azureUpgradeBinding(base);
    const root = await mkdtemp(join(tmpdir(), 'azure-parent-retirement-'));
    roots.push(root);
    const store = await CeDeploymentStore.open(root, binding.owner);
    const teardown = {
      kind: 'azure-ce-terraform-teardown',
      sourcePlanSha256: base.planSha256,
      planSha256: 'a'.repeat(64),
      planId: 'azure-ce-teardown-fixture',
      drain: { siteContractFingerprint: 'fingerprint' },
      retirement: [
        { siteName: base.siteName, siteUid: 'site-uid', tokens: [{ node: binding.nodes[0], name: 'token-one' }] },
      ],
    };
    await store.write(`${teardown.planId}.json`, teardown);
    await store.write(`${teardown.planId}-authorization.json`, {
      schemaVersion: 1,
      engine: 'terraform',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      mutations: true,
    });
    await beginAzureTerraformRetirement(base, teardown, store);
    const evidence = 'b'.repeat(64),
      finalPlan = 'c'.repeat(64),
      deployment = await azureTerraformCurrentDeployment(base);
    const { configuration, providerLock, ...rest } = deployment,
      hash = (value: string) => createHash('sha256').update(value).digest('hex');
    const manifest = { ...rest, configurationSha256: hash(configuration), providerLockSha256: hash(providerLock) };
    const marker = {
      schemaVersion: 1,
      status: 'runner-artifacts-retired',
      manifestSha256: fault === 'foreign-runner' ? 'd'.repeat(64) : canonicalSha256(manifest),
      evidenceSha256: evidence,
      finalPlanSha256: finalPlan,
      planReceiptSha256: canonicalSha256({ planSha256: finalPlan }),
      artifacts: [],
      inventorySha256: hash('[]'),
    };
    if (fault !== 'missing-independent')
      Object.assign(
        marker,
        independentRetirementFixture({
          manifestSha256: marker.manifestSha256,
          evidenceSha256: evidence,
          finalPlanSha256: finalPlan,
          planReceiptSha256: marker.planReceiptSha256,
        }),
      );
    const runner = join(store.directory, base.deploymentName);
    await mkdir(runner, { mode: 0o700 });
    await writeFile(join(runner, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(join(runner, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
    await store.write('azure-terraform-terminal-cleanup.json', {
      phase: 'retired',
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      retirementEvidenceSha256: evidence,
      final: { planSha256: finalPlan },
      artifacts: { ...marker, retiredArtifacts: 0 },
    });
    await store.write('terraform-workflow.json', { bootstrapByNode: { [binding.nodes[0]]: 'fixture-secret' } });
    await store.write('token-one.json', {
      tokenName: 'token-one',
      siteName: base.siteName,
      node: binding.nodes[0],
      jwt: 'fixture-secret',
    });
    await storeBootstrapToken({
      sessionId: 'session-one',
      token: 'fixture-secret',
      expiresInSeconds: 60,
      root: join(root, 'checkout'),
      onPrepared: async (checkout) => {
        await store.write(`bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`, {
          schemaVersion: 1,
          owner: binding.owner,
          binding,
          siteUid: 'site-uid',
          contractFingerprint: 'fingerprint',
          tokenName: 'token-one',
          node: binding.nodes[0],
          checkout,
        });
      },
    });
    if (fault.includes('reconciliation')) {
      await store.write('azure-terraform-cloud-destroy-reconciliation.json', {
        status: fault.includes('owned-reconciliation') ? 'owned' : 'absent',
        ownerPlanSha256: fault === 'foreign-owned-reconciliation' ? 'd'.repeat(64) : base.planSha256,
        resourceGroupId: `/subscriptions/${base.subscription.id}/resourceGroups/${fault === 'foreign-reconciliation' ? 'foreign-group' : base.intent.resourceGroup}`,
        observedAt: fault === 'malformed-reconciliation' ? 'invalid' : new Date().toISOString(),
      });
    }
    if (fault.includes('public-update')) {
      await store.write(`public-site-${base.siteName}.json`, {
        planId: fault === 'foreign-public-update-plan' ? 'foreign-plan' : `f5xc-ce-v2-${'d'.repeat(24)}`,
        record: {
          phase:
            fault === 'malformed-public-update'
              ? 'unrecognized'
              : fault === 'public-update-prepared'
                ? 'replace-prepared'
                : 'replace-observed',
          uid: fault === 'foreign-public-update' ? 'foreign-site-uid' : 'site-uid',
          resourceVersion: 'fixture-resource-version',
        },
      });
    }
    if (fault === 'unknown') await store.write('foreign.json', { jwt: 'unowned' });
    const run = (signal?: AbortSignal) => retireAzureTerraformParentArtifacts(base, teardown, evidence, store, signal);
    if (
      [
        'unknown',
        'missing-independent',
        'foreign-public-update',
        'malformed-public-update',
        'foreign-public-update-plan',
        'foreign-runner',
        'foreign-reconciliation',
        'malformed-reconciliation',
        'foreign-owned-reconciliation',
      ].includes(fault)
    ) {
      await expect(run()).rejects.toThrow();
      expect(await store.read('terraform-workflow.json')).toBeDefined();
      return;
    }
    if (fault === 'interrupted' || fault === 'changed-artifact') {
      const controller = new AbortController();
      const write = store.write.bind(store);
      store.write = async (name, value) => {
        await write(name, value);
        if (name === 'azure-terraform-parent-artifact-retirement.json') controller.abort();
      };
      await expect(run(controller.signal)).rejects.toThrow();
      store.write = write;
      if (fault === 'changed-artifact') {
        await store.write('terraform-workflow.json', { changed: true });
        await expect(run()).rejects.toThrow('changed');
        return;
      }
    }
    const receipt = await run();
    expect(receipt.status).toBe('deployment-artifacts-retired');
    expect(await readdir(store.directory)).not.toContain(`public-site-${base.siteName}.json`);
    expect(await readdir(store.directory)).not.toContain('terraform-workflow.json');
    expect(await readdir(store.directory)).not.toContain('token-one.json');
    expect(await readdir(store.directory)).not.toContain('azure-terraform-cloud-destroy-reconciliation.json');
    expect(await run()).toEqual(receipt);
  });
}
