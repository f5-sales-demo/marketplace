import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAwsNativeUpgrade, runAwsNativeUpgrade } from '../../src/ce/native-upgrade';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;

function base() {
  const source = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = source;
  draft.engine = 'native';
  draft.intent.engine = 'native';
  draft.deploymentName = draft.intent.deploymentName;
  draft.accountId = draft.intent.accountId;
  draft.region = draft.intent.region;
  draft.intent.initialVersions = { software: 'crt-20260201-0177', os: '9.2026.13' };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
}

function observed(binding: SiteBinding, target: string, state: 'ready' | 'converging' | 'complete') {
  const installed = state === 'complete' ? target : 'crt-20260201-0178';
  return {
    owner: binding.owner,
    nodes: binding.nodes,
    siteName: binding.siteName,
    source: `/api/config/namespaces/system/sites/${binding.siteName}`,
    siteUid: 'logical-one',
    physicalSiteUid: 'physical-one',
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
  const plan = base();
  const binding = siteBindings(plan)[0].binding;
  const target = 'crt-20260201-0179';
  const upgrade = await prepareAwsNativeUpgrade(
    plan,
    binding.siteName,
    { kind: 'software', version: target },
    { observeUpgrade: async () => observed(binding, target, 'ready') },
    contract,
  );
  const path = await mkdtemp(join(tmpdir(), 'ce-native-upgrade-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let index = 0;
  let submissions = 0;
  let loseResponse = false;
  let failBeforeBoundary = false;
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
      if (failBeforeBoundary) throw new Error('identity changed');
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
    failBeforeBoundary: () => {
      failBeforeBoundary = true;
    },
    restoreBoundary: () => {
      failBeforeBoundary = false;
    },
  };
}

test('submits one native upgrade and idempotently verifies completion', async () => {
  const f = await setup(['ready', 'complete', 'complete']);
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});

test('reconciles a lost native response from platform state without replay', async () => {
  const f = await setup(['ready', 'converging', 'complete']);
  f.loseResponse();
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-submission-unconfirmed');
  f.restoreResponse();
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-converging');
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});

test('keeps a pre-boundary rejection retryable and rejects another active site', async () => {
  const f = await setup(['ready', 'ready', 'complete']);
  f.failBeforeBoundary();
  await expect(
    runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage),
  ).rejects.toThrow('identity changed');
  f.restoreBoundary();
  expect(
    (await runAwsNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);

  const conflict = await setup(['ready']);
  await conflict.storage.write('native-ce-upgrade-serial.json', {
    schemaVersion: 1,
    engine: 'native',
    status: 'active',
    activePlanId: 'other',
    activePlanSha256: 'f'.repeat(64),
  });
  await expect(
    runAwsNativeUpgrade(
      conflict.plan,
      conflict.upgrade,
      conflict.upgrade.planSha256,
      conflict.runtime,
      contract,
      conflict.storage,
    ),
  ).rejects.toThrow('Another native site upgrade');
  expect(conflict.submissions()).toBe(0);
});
