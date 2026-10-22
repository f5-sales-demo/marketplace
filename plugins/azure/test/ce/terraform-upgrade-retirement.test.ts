import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { canonicalSha256 } from '../../src/ce/canonical';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { beginAzureTerraformRetirement } from '../../src/ce/terraform-retirement';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import {
  qualifiedAzureTerraformUpgradeStages,
  retireAzureTerraformUpgradeStage,
} from '../../src/ce/terraform-upgrade-retirement';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;
async function fixture() {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(base);
  const upgrade = await prepareAzureTerraformUpgrade(
    base,
    { kind: 'software', version: 'crt-20260201-0179' },
    {
      observeUpgrade: async () => ({
        owner: binding.owner,
        nodes: binding.nodes,
        siteName: binding.siteName,
        source: `/api/config/namespaces/system/sites/${binding.siteName}`,
        siteUid: 'logical-one',
        physicalSiteUid: 'physical-one',
        contractFingerprint: contract.fingerprint,
        siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
        status: 'observed' as const,
        startedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        targetSoftware: 'crt-20260201-0179',
        online: true,
        siteState: 'ONLINE',
        software: {
          installed: 'crt-20260201-0178',
          available: 'crt-20260201-0179',
          phase: 'UPGRADE_COMPLETED',
          result: 'Completed',
        },
        os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
        targets: ['crt-20260201-0179'],
        targetSoftwareListed: true,
        prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
        progress: { status: 'COMPLETED', version: 'crt-20260201-0178' },
        sources: { site: '', targets: '', precheck: '', progress: '' },
        nodeHealth: 'unknown' as const,
        routing: 'unknown' as const,
        traffic: 'unknown' as const,
      }),
    },
    contract,
  );
  const root = await mkdtemp(join(tmpdir(), 'upgrade-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  await store.write(`${upgrade.planId}.json`, upgrade);
  await store.write(`${upgrade.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    mutations: true,
  });
  await store.write(`${upgrade.planId}-checkpoint.json`, {
    schemaVersion: 2,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    phase: 'complete',
    actionPlanSha256: 'c'.repeat(64),
  });
  const action = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: base.deploymentName,
    backendIdentity: upgrade.deployment.backendIdentity,
    configurationSha256: sha256Hex(upgrade.deployment.configuration),
    providerLockSha256: sha256Hex(upgrade.deployment.providerLock),
    planSha256: 'c'.repeat(64),
    changes: [],
    noChanges: false,
    actionInvocations: [upgrade.action],
  };
  await store.write(`${upgrade.planId}-action-plan.json`, action);
  await store.write(`${upgrade.planId}-receipt.json`, {
    status: 'upgrade-complete',
    engine: 'terraform',
    planId: upgrade.planId,
    planSha256: upgrade.planSha256,
    siteName: binding.siteName,
    target: upgrade.expectation.target,
    actionPlanSha256: action.planSha256,
    observedAt: new Date().toISOString(),
    nodeHealth: 'unknown',
    routing: 'unknown',
    traffic: 'unknown',
  });
  await store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: upgrade.planId,
    lastPlanSha256: upgrade.planSha256,
  });
  let plans = 0,
    retires = 0,
    opens = 0,
    interrupted = false;
  let state = 'applied',
    changing = false;
  const session = {
    readPlanApplicationState: async () => state,
    readConfigurationSha256: async () => action.configurationSha256,
    plan: async () => {
      plans++;
      return { ...action, planSha256: 'd'.repeat(64), noChanges: !changing, actionInvocations: undefined };
    },
    retireArtifacts: async (receipt: { planSha256: string }, evidence: string) => {
      retires++;
      if (interrupted) {
        interrupted = false;
        throw Error('retirement interrupted');
      }
      return {
        status: 'runner-artifacts-retired',
        evidenceSha256: evidence,
        finalPlanSha256: receipt.planSha256,
        manifestSha256: 'e'.repeat(64),
        inventorySha256: 'f'.repeat(64),
        retiredArtifacts: 3,
      };
    },
  };
  const terraform = {
    open: async () => {
      opens++;
      return session;
    },
  };
  const run = () =>
    retireAzureTerraformUpgradeStage(base, upgrade, contract, terraform as never, store, 'b'.repeat(64), {});
  return {
    base,
    upgrade,
    store,
    run,
    counts: () => ({ plans, retires, opens }),
    setState: (s: string) => {
      state = s;
    },
    setChanging: () => {
      changing = true;
    },
    interrupt: () => {
      interrupted = true;
    },
  };
}
test('retires the exact complete upgrade from an ordinary plan and resumes its receipt without replanning', async () => {
  const f = await fixture();
  f.interrupt();
  await expect(f.run()).rejects.toThrow('retirement interrupted');
  expect(f.counts().plans).toBe(1);
  expect((await f.run()).status).toBe('runner-artifacts-retired');
  await f.store.write('terraform-ce-upgrade-serial.json', { schemaVersion: 2, engine: 'terraform', status: 'active' });
  await expect(f.run()).rejects.toThrow('serial upgrade');
  await f.store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: f.upgrade.planId,
    lastPlanSha256: f.upgrade.planSha256,
  });
  expect((await f.run()).status).toBe('runner-artifacts-retired');
  await f.store.write('terraform-ce-upgrade-serial.json', { schemaVersion: 2, engine: 'terraform', status: 'active' });
  await expect(f.run()).rejects.toThrow('serial upgrade');
  await f.store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: f.upgrade.planId,
    lastPlanSha256: f.upgrade.planSha256,
  });
  expect(f.counts().plans).toBe(1);
});
for (const mode of [
  'active',
  'foreign-serial',
  'submitted',
  'authorization',
  'action',
  'stage',
  'applying',
  'changing',
  'checkpoint',
] as const)
  test(`upgrade retirement rejects ${mode} evidence`, async () => {
    const f = await fixture(),
      id = f.upgrade.planId;
    if (mode === 'active')
      await f.store.write('terraform-ce-upgrade-serial.json', {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: id,
        activePlanSha256: f.upgrade.planSha256,
      });
    if (mode === 'foreign-serial')
      await f.store.write('terraform-ce-upgrade-serial.json', {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: 'foreign',
        lastPlanSha256: 'a'.repeat(64),
      });
    if (mode === 'submitted') {
      const c = (await f.store.read(`${id}-checkpoint.json`)) as Record<string, unknown>;
      await f.store.write(`${id}-checkpoint.json`, { ...c, phase: 'submitted' });
    }
    if (mode === 'authorization') await f.store.write(`${id}-authorization.json`, { mutations: false });
    if (mode === 'action') {
      const c = (await f.store.read(`${id}-action-plan.json`)) as Record<string, unknown>;
      await f.store.write(`${id}-action-plan.json`, { ...c, backendIdentity: 'foreign' });
    }
    if (mode === 'stage') f.upgrade.deployment.stage = 'upgrade-software-foreign';
    if (mode === 'applying') f.setState('applying');
    if (mode === 'changing') f.setChanging();
    if (mode === 'checkpoint')
      await f.store.write(`${id}-stage-retirement.json`, {
        schemaVersion: 1,
        status: 'retiring',
        evidenceSha256: 'foreign',
      });
    await expect(f.run()).rejects.toThrow();
    expect(f.counts().retires).toBe(0);
    if (['active', 'foreign-serial', 'submitted', 'authorization', 'action', 'stage', 'checkpoint'].includes(mode))
      expect(f.counts().opens).toBe(0);
  });

test('retirement preparation survives response loss after ordinary planning overwrites the action journal', async () => {
  const f = await fixture();
  const write = f.store.write.bind(f.store);
  let interrupted = false;
  f.store.write = async (name, value) => {
    if (
      name === `${f.upgrade.planId}-stage-retirement.json` &&
      (value as { status?: string }).status === 'retiring' &&
      !interrupted
    ) {
      interrupted = true;
      f.setState('planned');
      throw Error('receipt write lost');
    }
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow('receipt write lost');
  expect((await f.run()).status).toBe('runner-artifacts-retired');
  await f.store.write('terraform-ce-upgrade-serial.json', { schemaVersion: 2, engine: 'terraform', status: 'active' });
  await expect(f.run()).rejects.toThrow('serial upgrade');
  await f.store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: f.upgrade.planId,
    lastPlanSha256: f.upgrade.planSha256,
  });
});

test('stage discovery joins exact source identity and rejects absent or forged stage owners', async () => {
  const f = await fixture(),
    stage = String(f.upgrade.deployment.stage);
  expect((await qualifiedAzureTerraformUpgradeStages(f.base, f.store, [stage], contract)).map((v) => v.planId)).toEqual(
    [f.upgrade.planId],
  );
  await expect(
    qualifiedAzureTerraformUpgradeStages(f.base, f.store, [stage, `upgrade-os-${'a'.repeat(24)}`], contract),
  ).rejects.toThrow('Unqualified');
  const source = { ...f.upgrade, sourcePlanSha256: '0'.repeat(64) };
  await f.store.write(`${f.upgrade.planId}.json`, source);
  await expect(qualifiedAzureTerraformUpgradeStages(f.base, f.store, [stage], contract)).rejects.toThrow();
});

test('Azure parent preserves exact retired upgrade provenance and rejects changed stage markers', async () => {
  const f = await fixture();
  await f.run();
  const evidence = 'b'.repeat(64);
  const teardown = {
    kind: 'azure-ce-terraform-teardown',
    sourcePlanSha256: f.base.planSha256,
    planSha256: '1'.repeat(64),
    planId: 'azure-ce-teardown-stage-test',
    drain: { siteContractFingerprint: 'fingerprint' },
    retirement: [],
  };
  await f.store.write(`${teardown.planId}.json`, teardown);
  await f.store.write(`${teardown.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: f.base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  });
  await beginAzureTerraformRetirement(f.base, teardown, f.store);
  const retired = (await f.store.read(`${f.upgrade.planId}-stage-retirement.json`)) as Record<string, unknown>;
  const final = retired.receipt as Record<string, unknown>;
  const rootDeployment = await azureTerraformCurrentDeployment(f.base);
  const make = async (
    deployment: typeof rootDeployment,
    path: string,
    finalPlan: string,
    planReceiptSha256: string,
  ) => {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const { configuration, providerLock, ...identity } = deployment;
    const manifest = {
      ...identity,
      configurationSha256: sha256Hex(configuration),
      providerLockSha256: sha256Hex(providerLock),
    };
    const marker = {
      schemaVersion: 1,
      status: 'runner-artifacts-retired',
      manifestSha256: canonicalSha256(manifest),
      evidenceSha256: evidence,
      finalPlanSha256: finalPlan,
      planReceiptSha256,
      artifacts: [],
      inventorySha256: sha256Hex('[]'),
    };
    await writeFile(join(path, 'deployment.json'), JSON.stringify(manifest), { mode: 0o600 });
    await writeFile(join(path, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
    return marker;
  };
  const rootMarker = await make(
    rootDeployment,
    join(f.store.directory, f.base.deploymentName),
    'c'.repeat(64),
    'd'.repeat(64),
  );
  const stagePath = join(
    f.store.directory,
    'terraform-stages',
    String(f.upgrade.deployment.stage),
    f.base.deploymentName,
  );
  const stageMarker = await make(f.upgrade.deployment, stagePath, String(final.planSha256), canonicalSha256(final));
  await f.store.write('azure-terraform-terminal-cleanup.json', {
    phase: 'retired',
    sourcePlanSha256: f.base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    retirementEvidenceSha256: evidence,
    final: { planSha256: 'c'.repeat(64) },
    artifacts: rootMarker,
  });
  const run = () => retireAzureTerraformParentArtifacts(f.base, teardown, evidence, f.store);
  expect((await run()).status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).toContain(`${f.upgrade.planId}-stage-retirement.json`);
  expect((await run()).status).toBe('deployment-artifacts-retired');
  await writeFile(
    join(stagePath, 'artifact-retirement.json'),
    JSON.stringify({ ...stageMarker, evidenceSha256: 'f'.repeat(64) }),
    { mode: 0o600 },
  );
  await expect(run()).rejects.toThrow('provenance');
});
