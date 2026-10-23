import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { prepareAzureNativeUpgrade, runAzureNativeUpgrade } from '../../src/ce/native-upgrade';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;

function observed(binding: SiteBinding, target: string, state: 'ready' | 'converging' | 'complete') {
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
    online: state !== 'converging',
    siteState: state === 'converging' ? 'UPGRADING' : 'ONLINE',
    software: {
      installed,
      available: target,
      phase: state === 'converging' ? 'UPGRADE_IN_PROGRESS' : 'UPGRADE_COMPLETED',
      result: state === 'converging' ? 'In progress' : 'Completed',
    },
    os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
    targets: [target],
    targetSoftwareListed: true,
    prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
    progress: {
      status: state === 'converging' ? 'IN_PROGRESS' : 'COMPLETED',
      version: state === 'converging' ? target : installed,
    },
    sources: { site: '', targets: '', precheck: '', progress: '' },
    nodeHealth: 'unknown' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}

async function setup(states: Array<'ready' | 'converging' | 'complete'>) {
  const plan = compileAzureCePlan(intent, observation);
  const binding = azureUpgradeBinding(plan);
  const target = 'crt-20260201-0179';
  const upgrade = await prepareAzureNativeUpgrade(
    plan,
    { kind: 'software', version: target },
    { observeUpgrade: async () => observed(binding, target, 'ready') },
    contract,
  );
  const path = await mkdtemp(join(tmpdir(), 'azure-native-upgrade-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let index = 0;
  let submissions = 0;
  let loseResponse = false;
  const runtime = {
    engine: 'native' as const,
    async observeUpgrade() {
      return observed(binding, target, states[Math.min(index++, states.length - 1)]);
    },
    async submitUpgrade(
      _binding: SiteBinding,
      _contract: VerifiedUpgradeContract,
      _target: unknown,
      _siteUid: string,
      boundary: () => Promise<void>,
    ) {
      await boundary();
      submissions++;
      if (loseResponse) throw new Error('response lost');
      return { status: 'submitted' as const } as never;
    },
  } as Pick<CeRuntime, 'engine' | 'observeUpgrade' | 'submitUpgrade'>;
  return {
    plan,
    upgrade,
    runtime,
    storage,
    submissions: () => submissions,
    loseResponse: () => {
      loseResponse = true;
    },
    restoreResponse: () => {
      loseResponse = false;
    },
  };
}

test('runs and idempotently verifies an Azure native upgrade', async () => {
  const f = await setup(['ready', 'complete', 'complete']);
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});

test('reconciles an ambiguous Azure native submission without replay', async () => {
  const f = await setup(['ready', 'converging', 'complete']);
  f.loseResponse();
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-submission-unconfirmed');
  f.restoreResponse();
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-converging');
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});
