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
import {
  type AwsTerraformUpgrade,
  prepareAwsTerraformUpgrade,
  runAwsTerraformUpgrade,
} from '../../src/ce/terraform-upgrade';
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
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan();
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
  const plan = base(),
    binding = siteBindings(plan)[0].binding,
    target = 'crt-20260201-0179';
  const preparationRuntime: Pick<CeRuntime, 'observeUpgrade'> = {
    async observeUpgrade() {
      return observed(binding, target, 'ready');
    },
  };
  const upgrade = await prepareAwsTerraformUpgrade(
    plan,
    binding.siteName,
    { kind: 'software', version: target },
    preparationRuntime,
    contract,
  );
  const path = await mkdtemp(join(tmpdir(), 'ce-upgrade-run-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let index = 0,
    applies = 0,
    opens = 0,
    failApply = false;
  const runtime = {
    engine: 'terraform' as const,
    async observeUpgrade() {
      return observed(binding, target, states[Math.min(index++, states.length - 1)]);
    },
  };
  const receipt = (value: AwsTerraformUpgrade) => ({
    schemaVersion: 1 as const,
    deploymentId: value.deployment.deploymentId,
    engine: 'terraform' as const,
    backendIdentity: value.deployment.backendIdentity,
    configurationSha256: sha256Hex(value.deployment.configuration),
    providerLockSha256: sha256Hex(value.deployment.providerLock),
    planSha256: 'c'.repeat(64),
    changes: [],
    noChanges: false,
    actionInvocations: [value.action],
  });
  const session = {
    planAction: async () => receipt(upgrade),
    apply: async () => {
      applies++;
      if (failApply) throw new Error('lost action response');
    },
  } as unknown as TerraformSession;
  const terraform = {
    async open() {
      opens++;
      return session;
    },
  } as unknown as CeTerraformService;
  return {
    plan,
    upgrade,
    runtime,
    terraform,
    storage,
    counts: () => ({ applies, opens }),
    loseApply: () => {
      failApply = true;
    },
    restoreApply: () => {
      failApply = false;
    },
  };
}

test('executes one exact saved action and idempotently accepts observed completion', async () => {
  const f = await setup(['ready', 'ready', 'complete', 'complete']);
  const result = await runAwsTerraformUpgrade(
    f.plan,
    f.upgrade,
    f.upgrade.planSha256,
    f.runtime,
    contract,
    f.terraform,
    f.storage,
    {},
  );
  expect(result.status).toBe('upgrade-complete');
  expect(f.counts()).toEqual({ applies: 1, opens: 1 });
  expect(
    (
      await runAwsTerraformUpgrade(
        f.plan,
        f.upgrade,
        f.upgrade.planSha256,
        f.runtime,
        contract,
        f.terraform,
        f.storage,
        {},
      )
    ).status,
  ).toBe('upgrade-complete');
  expect(f.counts()).toEqual({ applies: 1, opens: 1 });
});

test('resumes an ambiguous action through platform convergence without replaying it', async () => {
  const f = await setup(['ready', 'ready', 'converging', 'complete']);
  f.loseApply();
  await expect(
    runAwsTerraformUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow('lost action response');
  f.restoreApply();
  expect(
    (
      await runAwsTerraformUpgrade(
        f.plan,
        f.upgrade,
        f.upgrade.planSha256,
        f.runtime,
        contract,
        f.terraform,
        f.storage,
        {},
      )
    ).status,
  ).toBe('upgrade-converging');
  expect(
    (
      await runAwsTerraformUpgrade(
        f.plan,
        f.upgrade,
        f.upgrade.planSha256,
        f.runtime,
        contract,
        f.terraform,
        f.storage,
        {},
      )
    ).status,
  ).toBe('upgrade-complete');
  expect(f.counts()).toEqual({ applies: 1, opens: 1 });
});

test('rejects authorization and serial-site conflicts before action planning', async () => {
  const f = await setup(['ready']);
  await expect(
    runAwsTerraformUpgrade(f.plan, f.upgrade, 'd'.repeat(64), f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow('authorization');
  await f.storage.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'active',
    activePlanId: 'aws-ce-upgrade-other',
    activePlanSha256: 'e'.repeat(64),
  });
  await expect(
    runAwsTerraformUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow('Another site upgrade');
  expect(f.counts()).toEqual({ applies: 0, opens: 0 });
});

test('rejects obsolete schema-v1 plans before Terraform mutation', async () => {
  const f = await setup(['ready']);
  const obsolete = { ...f.upgrade, schemaVersion: 1 } as unknown as AwsTerraformUpgrade;
  await expect(
    runAwsTerraformUpgrade(f.plan, obsolete, obsolete.planSha256, f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow('obsolete');
  expect(f.counts()).toEqual({ applies: 0, opens: 0 });
});

test('rejects a forged saved action while reconciling an interrupted submission', async () => {
  const f = await setup(['ready', 'ready', 'converging']);
  f.loseApply();
  await expect(
    runAwsTerraformUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow('lost action response');
  await f.storage.write(`${f.upgrade.planId}-action-plan.json`, null);
  await expect(
    runAwsTerraformUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.terraform, f.storage, {}),
  ).rejects.toThrow();
  expect(f.counts()).toEqual({ applies: 1, opens: 1 });
});
