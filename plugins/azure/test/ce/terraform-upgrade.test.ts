import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256, sha256Hex } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  type AzureTerraformUpgrade,
  azureUpgradeBinding,
  prepareAzureTerraformUpgrade,
  runAzureTerraformUpgrade,
  verifyAzureTerraformUpgrade,
} from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;

function base(ha = false) {
  const current = structuredClone(observation);
  current.regions[0].quotaAvailable = 32;
  return compileAzureCePlan({ ...intent, engine: 'terraform', topology: { ha } }, current);
}

function observed(binding: SiteBinding, target: string, state: 'ready' | 'complete' = 'ready') {
  const installed = state === 'complete' ? target : 'crt-20260201-0178';
  return {
    owner: binding.owner,
    nodes: binding.nodes,
    siteName: binding.siteName,
    source: `/api/config/namespaces/system/sites/${binding.siteName}`,
    siteUid: 'logical-azure',
    physicalSiteUid: 'physical-azure',
    contractFingerprint: contract.fingerprint,
    siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
    status: 'observed' as const,
    startedAt: new Date(Date.now() - 100).toISOString(),
    observedAt: new Date().toISOString(),
    targetSoftware: target,
    online: true,
    siteState: 'ONLINE',
    software: { installed, available: target, phase: 'UPGRADE_COMPLETED', result: 'Completed' },
    os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
    targets: [target],
    targetSoftwareListed: true,
    prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
    progress: { status: 'COMPLETED', version: installed },
    sources: { site: '', targets: '', precheck: '', progress: '' },
    nodeHealth: 'unknown' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}

test('prepares exact Azure software and OS actions for one-node and three-node sites', async () => {
  for (const ha of [false, true]) {
    const plan = base(ha);
    for (const kind of ['software', 'os'] as const) {
      const binding = azureUpgradeBinding(plan);
      const runtime: Pick<CeRuntime, 'observeUpgrade'> = {
        async observeUpgrade(_binding, _contract, target) {
          return observed(binding, target ?? 'crt-20260201-0178');
        },
      };
      const upgrade = await prepareAzureTerraformUpgrade(
        plan,
        { kind, version: kind === 'software' ? 'crt-20260201-0179' : '9.2026.17' },
        runtime,
        contract,
      );
      expect(upgrade.schemaVersion).toBe(2);
      expect(upgrade.engine).toBe('terraform');
      expect(upgrade.expectation.binding.nodes).toHaveLength(ha ? 3 : 1);
      expect(upgrade.deployment.scope).toEqual({
        cloud: 'azure',
        account: plan.subscription.id,
        region: plan.region,
      });
      const suffix = kind === 'software' ? 'sw' : 'os';
      expect(upgrade.action.address).toBe(`action.xcsh_site_upgrade_${suffix}.ce`);
      await verifyAzureTerraformUpgrade(plan, upgrade, contract);
    }
  }
});

test('rejects stale plans and resumes exact action completion idempotently', async () => {
  const plan = base();
  const binding = azureUpgradeBinding(plan);
  let observations = 0;
  const runtime = {
    engine: 'terraform' as const,
    async observeUpgrade() {
      observations++;
      return observed(binding, 'crt-20260201-0179', observations >= 4 ? 'complete' : 'ready');
    },
  };
  const upgrade = await prepareAzureTerraformUpgrade(
    plan,
    { kind: 'software', version: 'crt-20260201-0179' },
    runtime,
    contract,
  );
  const path = await mkdtemp(join(tmpdir(), 'azure-ce-upgrade-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let applies = 0;
  const session = {
    async planAction(action: unknown) {
      return {
        schemaVersion: 1 as const,
        deploymentId: upgrade.deployment.deploymentId,
        engine: 'terraform' as const,
        backendIdentity: upgrade.deployment.backendIdentity,
        configurationSha256: sha256Hex(upgrade.deployment.configuration),
        providerLockSha256: sha256Hex(upgrade.deployment.providerLock),
        planSha256: 'c'.repeat(64),
        changes: [],
        noChanges: false,
        actionInvocations: [action],
      };
    },
    async apply() {
      applies++;
    },
  } as unknown as TerraformSession;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const first = await runAzureTerraformUpgrade(
    plan,
    upgrade,
    upgrade.planSha256,
    runtime,
    contract,
    terraform,
    storage,
    {},
  );
  expect(first.status).toBe('upgrade-complete');
  expect(
    (await runAzureTerraformUpgrade(plan, upgrade, upgrade.planSha256, runtime, contract, terraform, storage, {}))
      .status,
  ).toBe('upgrade-complete');
  expect(applies).toBe(1);
  const obsolete = { ...upgrade, schemaVersion: 1 } as unknown as AzureTerraformUpgrade;
  await expect(
    runAzureTerraformUpgrade(plan, obsolete, obsolete.planSha256, runtime, contract, terraform, storage, {}),
  ).rejects.toThrow('obsolete');
  const forged = structuredClone(upgrade);
  forged.expectation.binding.owner.account = '00000000-0000-4000-8000-000000000099';
  await expect(verifyAzureTerraformUpgrade(plan, forged, contract)).rejects.toThrow();
  expect(canonicalSha256(await storage.read(`${upgrade.planId}.json`))).toBe(canonicalSha256(upgrade));
});
