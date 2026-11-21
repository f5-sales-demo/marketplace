import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { independentRetirementFixture } from '../../../terraform/test/fixtures/independent-retirement';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCePlan } from '../../src/ce/types';

export async function prepareRelayParentRetirement(
  base: AzureCePlan,
  siteUid: string,
  artifacts: Map<string, unknown>,
  tokens: Array<{ node: string; name: string }> = [],
) {
  const root = await mkdtemp(join(tmpdir(), 'relay-parent-retirement-'));
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(base).owner);
  const teardown = {
    kind: 'azure-ce-terraform-teardown',
    sourcePlanSha256: base.planSha256,
    planSha256: 'a'.repeat(64),
    planId: 'azure-ce-teardown-fixture',
    drain: { siteContractFingerprint: 'synthetic' },
    retirement: [{ siteName: base.siteName, siteUid, tokens }],
  };
  const retirementEvidence = { platform: { status: 'absent' }, cloud: { status: 'absent' } };
  const evidence = canonicalSha256(retirementEvidence);
  await store.write(`${teardown.planId}.json`, teardown);
  await store.write(`${teardown.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  });
  await beginAzureTerraformRetirement(base, teardown, store);
  const { configuration, providerLock, ...rest } = await azureTerraformCurrentDeployment(base);
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const manifest = { ...rest, configurationSha256: hash(configuration), providerLockSha256: hash(providerLock) };
  const final = { planSha256: 'c'.repeat(64) };
  const marker = {
    schemaVersion: 1,
    status: 'runner-artifacts-retired',
    manifestSha256: canonicalSha256(manifest),
    evidenceSha256: evidence,
    finalPlanSha256: final.planSha256,
    planReceiptSha256: canonicalSha256(final),
    artifacts: [],
    inventorySha256: hash('[]'),
    ...independentRetirementFixture({
      manifestSha256: canonicalSha256(manifest),
      evidenceSha256: evidence,
      finalPlanSha256: final.planSha256,
      planReceiptSha256: canonicalSha256(final),
    }),
  };
  const runner = join(store.directory, base.deploymentName);
  await mkdir(runner, { mode: 0o700 });
  await writeFile(join(runner, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
  await writeFile(join(runner, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
  await store.write('azure-terraform-terminal-cleanup.json', {
    phase: 'retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    retirementEvidence,
    retirementEvidenceSha256: evidence,
    final,
    artifacts: { ...marker, retiredArtifacts: 0 },
  });
  await store.write('terraform-workflow.json', { syntheticSecret: 'retire-owned-staging' });
  for (const [name, value] of artifacts) await store.write(name, value);
  return { store, teardown, evidence, cleanup: () => rm(root, { recursive: true, force: true }) };
}
