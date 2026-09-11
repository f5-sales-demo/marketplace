import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/az/types';
import { type AzureCeToolContext, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureNativeTeardown } from '../../src/ce/native-teardown';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCeTeardownTool } from '../../src/tools/azure-ce-teardown';
import { intent, observation } from '../ce/fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

test('routes an exact native cloud teardown through the coordinated plan without a second approval', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'native' }, observation);
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': plan.deploymentName,
  };
  const current = structuredClone(observation);
  current.resources = [
    {
      id: `${groupId}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-1`,
      location: plan.region,
      exists: true,
      owned: true,
      tags,
      state: {},
    },
    { id: groupId, location: plan.region, exists: true, owned: true, tags, state: {} },
  ];
  const cloud = compileAzureCePlan({ ...intent, engine: 'native', operation: 'teardown' }, current);
  const binding = azureUpgradeBinding(plan);
  const contract = { fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedIngressContract;
  const runtime = { engine: 'native', contract: { fingerprint: `sha256:${'a'.repeat(64)}` } } as CeRuntime;
  const teardown = compileAzureNativeTeardown(
    plan,
    cloud,
    {
      schemaVersion: 1,
      owner: binding.owner,
      sourcePlanSha256: plan.planSha256,
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      listeners: [],
      origins: [],
      sites: [{ binding, siteUid: 'site-uid', routing: [] }],
    },
    [
      {
        siteName: plan.siteName,
        siteUid: 'site-uid',
        physicalSiteUid: 'physical-uid',
        tokens: [{ node: binding.nodes[0], name: 'ce-token' }],
      },
    ],
  );
  const root = await mkdtemp(join(tmpdir(), 'azure-native-teardown-tool-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner);
  const ctx: AzureCeToolContext = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'azure-native-teardown-tool',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => '1',
    },
  };
  await savePlanArtifact(ctx.sessionManager, plan, observation);
  await savePlanArtifact(ctx.sessionManager, cloud, current);
  let nativeApplies = 0;
  const tool = createAzureCeTeardownTool({ typebox } as PluginInterface, {
    platform: async () =>
      ({ storage: async () => storage, runtime: async () => runtime }) as unknown as CePlatformService,
    terraform: async () => {
      throw new Error('unexpected Terraform');
    },
    contract: async () => contract,
    makeApi: () => ({
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
    }),
    prepare: async () => {
      throw new Error('unexpected Terraform preparation');
    },
    run: async () => {
      throw new Error('unexpected Terraform run');
    },
    prepareNative: async () => {
      await storage.write(`${teardown.planId}.json`, teardown);
      return teardown;
    },
    runNative: async (_base, selectedCloud, selected, authorized, _runtime, _contract, _storage, applyCloud) => {
      expect(selectedCloud.planSha256).toBe(cloud.planSha256);
      expect(selected.planSha256).toBe(authorized);
      expect(await applyCloud()).toEqual({ status: 'retired', absence: 'absent' });
      return { status: 'retired' } as never;
    },
    applyNative: async () => {
      nativeApplies++;
      return { plan: cloud, checkpoint: { state: 'complete' } } as never;
    },
  });
  expect(
    (
      await tool.execute(
        'prepare',
        {
          operation: 'prepare',
          basePlanId: plan.planId,
          basePlanSha256: plan.planSha256,
          cloudPlanId: cloud.planId,
          cloudPlanSha256: cloud.planSha256,
        },
        undefined,
        undefined,
        ctx,
      )
    ).isError,
  ).toBeUndefined();
  expect(
    (
      await tool.execute(
        'apply',
        {
          operation: 'apply',
          basePlanId: plan.planId,
          basePlanSha256: plan.planSha256,
          teardownPlanId: teardown.planId,
          teardownPlanSha256: teardown.planSha256,
        },
        undefined,
        undefined,
        ctx,
      )
    ).isError,
  ).toBeUndefined();
  expect(nativeApplies).toBe(1);
});
const typebox = {
  Type: {
    Object: (value: unknown) => value,
    String: () => ({}),
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
  },
} as unknown as PluginInterface['typebox'];

test('prepares, authorizes once, and applies the exact Azure Terraform teardown', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const contract = { fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedIngressContract;
  const runtime = {
    engine: 'terraform',
    contract: { fingerprint: `sha256:${'a'.repeat(64)}` },
  } as CeRuntime;
  const teardown = compileAzureTerraformTeardown(
    plan,
    {
      schemaVersion: 1,
      owner: binding.owner,
      sourcePlanSha256: plan.planSha256,
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      listeners: [],
      origins: [],
      sites: [{ binding, siteUid: 'site-uid', routing: [] }],
    },
    [
      {
        siteName: plan.siteName,
        siteUid: 'site-uid',
        physicalSiteUid: 'physical-uid',
        tokens: [{ node: binding.nodes[0], name: 'ce-token' }],
      },
    ],
  );
  const root = await mkdtemp(join(tmpdir(), 'azure-teardown-tool-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner);
  const artifacts: string[] = [];
  let confirms = 0;
  const ctx: AzureCeToolContext = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'azure-teardown-tool',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  };
  await savePlanArtifact(ctx.sessionManager, plan, observation);
  const session = {} as TerraformSession;
  let runs = 0;
  const tool = createAzureCeTeardownTool({ typebox } as PluginInterface, {
    platform: async () =>
      ({ storage: async () => storage, runtime: async () => runtime }) as unknown as CePlatformService,
    terraform: async () => ({ open: async () => session }) as CeTerraformService,
    contract: async () => contract,
    makeApi: () => ({ exec: async () => ({ exitCode: 1, stdout: '', stderr: '' }) }),
    prepare: async () => {
      await storage.write(`${teardown.planId}.json`, teardown);
      return teardown;
    },
    run: async (_base, selected, authorized, _runtime, _contract, selectedSession) => {
      expect(selected.planSha256).toBe(teardown.planSha256);
      expect(authorized).toBe(teardown.planSha256);
      expect(selectedSession).toBe(session);
      runs++;
      return { status: 'retired' as const } as never;
    },
    prepareNative: async () => {
      throw new Error('unexpected native preparation');
    },
    runNative: async () => {
      throw new Error('unexpected native run');
    },
    applyNative: async () => {
      throw new Error('unexpected native apply');
    },
  });
  const prepared = (await tool.execute(
    'prepare',
    { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256 },
    undefined,
    undefined,
    ctx,
  )) as { isError?: boolean };
  expect(prepared.isError).toBeUndefined();
  const apply = () =>
    tool.execute(
      'apply',
      {
        operation: 'apply',
        basePlanId: plan.planId,
        basePlanSha256: plan.planSha256,
        teardownPlanId: teardown.planId,
        teardownPlanSha256: teardown.planSha256,
      },
      undefined,
      undefined,
      ctx,
    );
  expect((await apply()).isError).toBeUndefined();
  ctx.ui.confirm = async () => {
    throw new Error('authorization should persist');
  };
  expect((await apply()).isError).toBeUndefined();
  expect({ confirms, runs }).toEqual({ confirms: 1, runs: 2 });
});
