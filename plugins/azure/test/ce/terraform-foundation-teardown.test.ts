import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as typebox from '@sinclair/typebox';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { type PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import type { PluginInterface } from '../../src/az/types';
import { type AzureCeToolContext, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAzureNativeTeardown, runAzureNativeTeardown } from '../../src/ce/native-teardown';
import { compileAzureCePlan } from '../../src/ce/planner';
import { executeAzureCeTerraformApply } from '../../src/ce/terraform-apply';
import { verifyAzureTerraformDestroyOwnership } from '../../src/ce/terraform-destroy-ownership';
import { azureTerraformFoundationDeployment } from '../../src/ce/terraform-foundation';
import {
  type AzureFoundationTeardownPlan,
  runAzureFoundationTeardown,
} from '../../src/ce/terraform-foundation-teardown';
import { assertAzureTerraformDeploymentActive } from '../../src/ce/terraform-retirement';
import { prepareAzureTerraformTeardown, runAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCeTeardownTool } from '../../src/tools/azure-ce-teardown';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const contract = { fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedIngressContract;
async function fixture(version = '1.16.5') {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const root = await mkdtemp(join(tmpdir(), 'azure-foundation-retirement-'));
  directories.push(root);
  const binding = azureUpgradeBinding(plan);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const deployment = await azureTerraformFoundationDeployment(plan);
  const configuration = JSON.parse(deployment.configuration);
  configuration.terraform.required_version = `= ${version}`;
  deployment.configuration = JSON.stringify(configuration);
  deployment.terraformVersion = version;
  const runner = new TerraformRunner(store.directory);
  await runner.prepare(deployment);
  await store.write(`terraform-authorization-${plan.planSha256}.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    mutations: true,
  });
  await store.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: hash(deployment.configuration),
    bootstrapByNode: {},
    launchedAtByNode: {},
    stage: 'network-pending',
  });
  let observations = 0;
  const runtime = {
    engine: 'terraform',
    contract: { fingerprint: `sha256:${'a'.repeat(64)}` },
    async teardownInventory() {
      throw Error('registered-site inventory must not be required');
    },
    async unregisteredAbsence() {
      observations++;
      return {
        status: 'absent',
        owner: binding.owner,
        siteContractFingerprint: this.contract.fingerprint,
        ingressContractFingerprint: contract.fingerprint,
        observedAt: new Date().toISOString(),
      };
    },
  } as unknown as CeRuntime;
  const api: AzExecApi = {
    async exec(_command, args) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'account'
            ? {
                id: plan.subscription.id,
                tenantId: plan.subscription.tenantId,
                environmentName: plan.subscription.cloud,
                state: 'Enabled',
              }
            : false,
        ),
      };
    },
  };
  return { plan, store, deployment, runner, runtime, api, observations: () => observations };
}
test('prepares exact pre-admission Azure retirement without a registered site', async () => {
  const f = await fixture();
  const teardown = await prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store);
  expect(teardown.kind).toBe('azure-ce-terraform-foundation-teardown');
  expect(teardown.retirement).toEqual([]);
  expect(teardown.drain.sites).toEqual([]);
  expect(f.observations()).toBeGreaterThanOrEqual(2);
});
test('accepts independently absent Azure group only for an exact empty destroy plan and empty projection', async () => {
  const f = await fixture();
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: 'c'.repeat(64),
    providerLockSha256: 'd'.repeat(64),
    planSha256: 'e'.repeat(64),
    operation: 'destroy',
    changes: [],
    noChanges: true,
  };
  expect(
    await verifyAzureTerraformDestroyOwnership(
      f.plan,
      receipt,
      {
        readPlannedResourceFields: async () => ({ 'azurerm_resource_group.ce': null }),
      },
      f.api,
      {},
    ),
  ).toMatchObject({ resourceCount: 0 });
});

for (const [label, change] of [
  ['unknown', { status: 'unknown' }],
  ['foreign owner', { owner: { deploymentId: 'foreign' } }],
  ['foreign site contract', { siteContractFingerprint: `sha256:${'c'.repeat(64)}` }],
  ['foreign ingress contract', { ingressContractFingerprint: `sha256:${'c'.repeat(64)}` }],
  ['stale', { observedAt: '2020-01-01T00:00:00Z' }],
  ['missing timestamp', { observedAt: undefined }],
  ['future timestamp', { observedAt: '2099-01-01T00:00:00Z' }],
] as const)
  test(`rejects ${label} unregistered platform evidence before teardown persistence`, async () => {
    const f = await fixture();
    const observe = f.runtime.unregisteredAbsence.bind(f.runtime);
    f.runtime.unregisteredAbsence = async (...args) => ({ ...(await observe(...args)), ...change }) as never;
    await expect(prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store)).rejects.toThrow();
  });
for (const [label, value] of [
  ['started registration', { stage: 'registration-pending' }],
  ['bootstrap checkout', { bootstrapByNode: { '1': 'opaque-owned-checkout' } }],
  ['launched node', { launchedAtByNode: { '1': '2026-01-01T00:00:00Z' } }],
  ['foreign journal plan', { planSha256: 'f'.repeat(64) }],
  ['changed configuration', { configurationSha256: 'f'.repeat(64) }],
] as const)
  test(`rejects ${label} as unregistered foundation retirement`, async () => {
    const f = await fixture();
    await f.store.write('terraform-workflow.json', {
      ...((await f.store.read('terraform-workflow.json')) as object),
      ...value,
    });
    await expect(prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store)).rejects.toThrow();
  });
test('rejects admission artifacts and unauthorized cloud absence reads', async () => {
  const f = await fixture();
  await f.store.write('terraform-site.json', { siteUid: 'generated-site' });
  await expect(prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store)).rejects.toThrow('admission');
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    operation: 'destroy',
    changes: [],
    noChanges: true,
  } as PlanReceipt;
  await expect(
    verifyAzureTerraformDestroyOwnership(
      f.plan,
      receipt,
      { readPlannedResourceFields: async () => ({ 'azurerm_resource_group.ce': null }) },
      { exec: async () => ({ exitCode: 1, stdout: '', stderr: 'unauthorized' }) },
      {},
    ),
  ).rejects.toThrow('unavailable');
});
test('rejects nonempty or malformed state projections when the Azure group is absent', async () => {
  const f = await fixture();
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    operation: 'destroy',
    changes: [],
    noChanges: true,
  } as PlanReceipt;
  for (const fields of [
    { 'azurerm_resource_group.ce': { id: 'foreign-id' } },
    {},
    { 'azurerm_resource_group.ce': null, extra: null },
  ])
    await expect(
      verifyAzureTerraformDestroyOwnership(
        f.plan,
        receipt,
        { readPlannedResourceFields: async () => fields },
        f.api,
        {},
      ),
    ).rejects.toThrow();
  await expect(
    verifyAzureTerraformDestroyOwnership(
      f.plan,
      {
        ...receipt,
        changes: [{ address: 'azurerm_network_interface.ce', type: 'azurerm_network_interface', actions: ['delete'] }],
      },
      { readPlannedResourceFields: async () => ({}) },
      f.api,
      {},
    ),
  ).rejects.toThrow('absent');
});
async function driver(interruption?: 'before-cancel' | 'after-cancel' | 'retire', version?: string) {
  const f = await fixture(version);
  const plan = (await prepareAzureTerraformTeardown(
    f.plan,
    f.runtime,
    contract,
    f.store,
  )) as AzureFoundationTeardownPlan;
  let destroys = 0,
    plans = 0,
    cancellations = 0,
    retirements = 0,
    interrupted = false;
  const base: PlanReceipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: hash(f.deployment.configuration),
    providerLockSha256: hash(f.deployment.providerLock),
    planSha256: 'd'.repeat(64),
    changes: [],
    noChanges: true,
  };
  const session = {
    async planDestroy() {
      destroys++;
      return { ...base, operation: 'destroy', planSha256: 'e'.repeat(64) };
    },
    async readPlannedResourceFields() {
      return { 'azurerm_resource_group.ce': null };
    },
    async apply() {
      throw Error('Unexecuted foundation must not invoke cloud apply');
    },
    async cancelUnsubmittedPlan(_receipt: PlanReceipt, expected: string, empty: string) {
      cancellations++;
      if (!interrupted && interruption === 'before-cancel') {
        interrupted = true;
        throw Error('cancel interrupted');
      }
      if ((await f.runner.readConfigurationSha256()) !== hash(empty))
        await f.runner.reviseConfiguration(expected, empty);
      if (!interrupted && interruption === 'after-cancel') {
        interrupted = true;
        throw Error('cancel response lost');
      }
      return hash(empty);
    },
    async plan() {
      plans++;
      return { ...base, configurationSha256: await f.runner.readConfigurationSha256(), planSha256: 'f'.repeat(64) };
    },
    async retireArtifacts(final: PlanReceipt, evidence: string) {
      retirements++;
      if (!interrupted && interruption === 'retire') {
        interrupted = true;
        throw Error('retirement interrupted');
      }
      const current = JSON.parse(
        await Bun.file(join(f.store.directory, f.plan.deploymentName, 'deployment.json')).text(),
      );
      return {
        status: 'runner-artifacts-retired',
        manifestSha256: canonicalSha256(current),
        evidenceSha256: evidence,
        finalPlanSha256: final.planSha256,
        inventorySha256: 'a'.repeat(64),
        retiredArtifacts: 3,
      };
    },
  } as unknown as TerraformSession;
  const run = (authorized = plan.planSha256) =>
    runAzureFoundationTeardown(f.plan, plan, authorized, f.runtime, contract, session, f.store, f.api, {});
  return { ...f, teardown: plan, session, run, counts: () => ({ destroys, plans, cancellations, retirements }) };
}
test('retires unexecuted foundation through an ordinary empty refresh plan and preserves the deployment barrier', async () => {
  const f = await driver();
  expect(await f.run()).toMatchObject({ status: 'deployment-artifacts-retired', cloud: 'absent', platform: 'absent' });
  await expect(assertAzureTerraformDeploymentActive(f.store)).rejects.toThrow('retirement');
  const before = f.counts();
  expect(await f.run()).toMatchObject({ status: 'deployment-artifacts-retired' });
  expect(f.counts()).toEqual(before);
  expect(before).toEqual({ destroys: 2, plans: 1, cancellations: 1, retirements: 1 });
});
for (const fault of ['before-cancel', 'after-cancel', 'retire'] as const)
  test(`resumes ${fault} interruption without repeating cloud retirement`, async () => {
    const f = await driver(fault);
    await expect(f.run()).rejects.toThrow();
    expect(await f.run()).toMatchObject({ status: 'deployment-artifacts-retired' });
    expect(f.counts().destroys).toBe(2);
    expect(f.counts().plans).toBe(1);
  });
test('rejects wrong authorization, changed saved teardown and forged terminal checkpoint before execution', async () => {
  const f = await driver();
  await expect(f.run('a'.repeat(64))).rejects.toThrow('authorization');
  expect(f.counts().destroys).toBe(0);
  await f.store.write(`${f.teardown.planId}.json`, { ...f.teardown, sourcePlanSha256: 'c'.repeat(64) });
  await expect(f.run()).rejects.toThrow('authorization');
  expect(f.counts().destroys).toBe(0);
  await f.store.write(`${f.teardown.planId}.json`, f.teardown);
  await f.store.write('azure-terraform-foundation-teardown-checkpoint.json', {
    schemaVersion: 1,
    sourcePlanSha256: f.plan.planSha256,
    teardownPlanSha256: f.teardown.planSha256,
    phase: 'retired',
    artifacts: { status: 'runner-artifacts-retired' },
  });
  await expect(f.run()).rejects.toThrow('checkpoint');
  expect(f.counts().destroys).toBe(0);
});

test('public teardown prepares and applies frozen 1.16.1 foundation while preserving its runtime binding', async () => {
  const f = await driver(undefined, '1.16.1');
  let approvals = 0,
    opens = 0;
  const ctx: AzureCeToolContext = {
    cwd: f.store.directory,
    hasUI: true,
    ui: {
      confirm: async () => {
        approvals++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => f.store.directory,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => String(Date.now()),
    },
  };
  await savePlanArtifact(ctx.sessionManager, f.plan, observation);
  const platform = { storage: async () => f.store, runtime: async () => f.runtime } as unknown as CePlatformService;
  const terraform = {
    open: async (_owner, value, resume) => {
      opens++;
      expect(value.terraformVersion).toBe('1.16.1');
      expect(resume).toBe('current');
      expect(JSON.parse(value.configuration).terraform.required_version).toBe('= 1.16.1');
      return f.session;
    },
  } as CeTerraformService;
  const tool = createAzureCeTeardownTool({ typebox } as PluginInterface, {
    platform: async () => platform,
    terraform: async () => terraform,
    contract: async () => contract,
    prepare: prepareAzureTerraformTeardown,
    run: runAzureTerraformTeardown,
    prepareNative: prepareAzureNativeTeardown,
    runNative: runAzureNativeTeardown,
    applyNative: async () => {
      throw Error('unexpected native apply');
    },
    makeApi: () => f.api,
  });
  const result = await tool.execute(
    'prepare',
    { operation: 'prepare', basePlanId: f.plan.planId, basePlanSha256: f.plan.planSha256 },
    undefined,
    undefined,
    ctx,
  );
  expect(result.isError).not.toBe(true);
  const args = {
    operation: 'apply' as const,
    basePlanId: f.plan.planId,
    basePlanSha256: f.plan.planSha256,
    teardownPlanId: f.teardown.planId,
    teardownPlanSha256: f.teardown.planSha256,
  };
  expect(await tool.execute('apply', args, undefined, undefined, ctx)).toMatchObject({
    details: { status: 'deployment-artifacts-retired' },
  });
  expect(await tool.execute('resume', args, undefined, undefined, ctx)).toMatchObject({
    details: { status: 'deployment-artifacts-retired' },
  });
  expect(approvals).toBe(1);
  expect(opens).toBe(2);
  const current = JSON.parse(await Bun.file(join(f.store.directory, f.plan.deploymentName, 'deployment.json')).text());
  expect(current.terraformVersion).toBe('1.16.1');
});
test('public apply rejects retirement before cloud discovery and shares the teardown owner lock', async () => {
  const f = await driver();
  await f.run();
  const ctx: AzureCeToolContext = {
    cwd: f.store.directory,
    hasUI: false,
    sessionManager: {
      getSessionId: () => f.store.directory,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => String(Date.now()),
    },
  };
  await savePlanArtifact(ctx.sessionManager, f.plan, observation);
  const platform = { storage: async () => f.store } as unknown as CePlatformService;
  const api: AzExecApi = {
    exec: async () => {
      throw Error('unexpected cloud discovery');
    },
  };
  await expect(
    executeAzureCeTerraformApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      ctx,
      api,
      platform,
      {} as CeTerraformService,
    ),
  ).rejects.toThrow('retirement');
  const release = await acquireProcessLock(join(f.store.directory, '.azure-terraform-lifecycle-lock'));
  try {
    await expect(
      executeAzureCeTerraformApply(
        { planId: f.plan.planId, planSha256: f.plan.planSha256 },
        ctx,
        api,
        platform,
        {} as CeTerraformService,
      ),
    ).rejects.toThrow();
  } finally {
    await release();
  }
});

async function reservedFixture() {
  const f = await fixture();
  const binding = azureUpgradeBinding(f.plan);
  const siteUid = 'owned-reserved-site';
  const physicalSiteUid = 'generated-empty-site';
  await f.store.write('terraform-site.json', {
    siteName: binding.siteName,
    uid: siteUid,
    owner: binding.owner,
    contractFingerprint: f.runtime.contract.fingerprint,
  });
  await f.store.write(`site-binding-${binding.siteName}.json`, {
    schemaVersion: 1,
    tenantOrigin: 'https://example.test',
    contractFingerprint: f.runtime.contract.fingerprint,
    siteUid,
    binding,
    expectedInterfaces: [],
  });
  let deleted = false;
  f.runtime.preRegistrationInventory = async () => ({
    status: 'observed',
    owner: binding.owner,
    siteContractFingerprint: f.runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    sites: [
      {
        siteName: binding.siteName,
        siteUid: deleted ? null : siteUid,
        physicalSiteUid: deleted ? null : physicalSiteUid,
      },
    ],
    resources: [],
    sources: [],
    startedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
  });
  f.runtime.deleteSiteExact = async (_binding, uid) => {
    expect(uid).toBe(siteUid);
    deleted = true;
    return { status: 'deleted' } as never;
  };
  return { ...f, siteUid, physicalSiteUid };
}
test('prepares a separate exact reserved-site foundation retirement with no enrollment', async () => {
  const f = await reservedFixture();
  const teardown = await prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store);
  expect(teardown.kind).toBe('azure-ce-terraform-foundation-teardown');
  expect(teardown).toMatchObject({ reservedSite: { siteUid: f.siteUid, physicalSiteUid: f.physicalSiteUid } });
});
for (const [label, change] of [
  ['foreign logical UID', { sites: [{ siteName: 'ce-demo', siteUid: 'foreign', physicalSiteUid: null }] }],
  ['issued token', { resources: [{ kind: 'tokens', name: 'unexpected' }] }],
  ['unknown', { status: 'unknown' }],
  ['stale', { observedAt: '2020-01-01T00:00:00Z' }],
] as const)
  test(`reserved-site retirement rejects ${label}`, async () => {
    const f = await reservedFixture();
    const observe = f.runtime.preRegistrationInventory.bind(f.runtime);
    f.runtime.preRegistrationInventory = async (...args) => ({ ...(await observe(...args)), ...change }) as never;
    await expect(prepareAzureTerraformTeardown(f.plan, f.runtime, contract, f.store)).rejects.toThrow();
  });

test('reserved-site deletion precedes cloud retirement and supports interruption resume', async () => {
  const f = await reservedFixture();
  const plan = (await prepareAzureTerraformTeardown(
    f.plan,
    f.runtime,
    contract,
    f.store,
  )) as AzureFoundationTeardownPlan;
  let retiredSite = false;
  const deletion = f.runtime.deleteSiteExact.bind(f.runtime);
  f.runtime.deleteSiteExact = async (...args) => {
    retiredSite = true;
    return deletion(...args);
  };
  f.runtime.unregisteredAbsence = async () => {
    expect(retiredSite).toBe(true);
    throw Error('test interruption after reserved site retirement');
  };
  await expect(
    runAzureFoundationTeardown(
      f.plan,
      plan,
      plan.planSha256,
      f.runtime,
      contract,
      {} as TerraformSession,
      f.store,
      f.api,
      {},
    ),
  ).rejects.toThrow('test interruption');
  expect(retiredSite).toBe(true);
  await expect(
    runAzureFoundationTeardown(
      f.plan,
      plan,
      plan.planSha256,
      f.runtime,
      contract,
      {} as TerraformSession,
      f.store,
      f.api,
      {},
    ),
  ).rejects.toThrow('test interruption');
});
