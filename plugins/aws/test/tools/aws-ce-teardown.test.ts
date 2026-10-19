import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/aws/types';
import { type AwsCeToolContext, saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsNativeTeardownPlan } from '../../src/ce/native-teardown';
import type { AwsTerraformTeardownPlan } from '../../src/ce/terraform-teardown';
import { siteBindings } from '../../src/ce/topology';
import { createAwsCeTeardownTool } from '../../src/tools/aws-ce-teardown';
import { foundationPlan } from '../ce/terraform-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
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

test('public teardown tool prepares, authorizes once and resumes the exact Terraform manifest', async () => {
  const initial = foundationPlan(),
    { planId: _id, planSha256: _sha, ...baseDraft } = initial,
    normalized = {
      ...baseDraft,
      deploymentName: initial.intent.deploymentName,
      accountId: initial.intent.accountId,
      region: initial.intent.region,
    },
    planSha256 = canonicalSha256(normalized),
    plan = { ...normalized, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` },
    binding = siteBindings(plan)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'aws-ce-teardown-tool-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner),
    teardownDraft = {
      schemaVersion: 1 as const,
      kind: 'aws-ce-terraform-teardown' as const,
      engine: 'terraform' as const,
      sourcePlanSha256: plan.planSha256,
      drain: {
        schemaVersion: 1 as const,
        owner: binding.owner,
        sourcePlanSha256: plan.planSha256,
        siteContractFingerprint: 'site-contract',
        ingressContractFingerprint: 'ingress-contract',
        listeners: [],
        origins: [],
        sites: [],
      },
      retirement: [],
    },
    teardownSha = canonicalSha256(teardownDraft),
    teardown: AwsTerraformTeardownPlan = {
      ...teardownDraft,
      planId: `aws-ce-teardown-${teardownSha.slice(0, 24)}`,
      planSha256: teardownSha,
    };
  let confirms = 0,
    runs = 0,
    opens = 0;
  const platform = {
    storage: async () => storage,
    runtime: async () => ({ engine: 'terraform' }),
  } as unknown as CePlatformService;
  const terraform = {
    async open() {
      opens++;
      return {};
    },
  } as unknown as CeTerraformService;
  const artifacts: string[] = [];
  const ctx = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'teardown-tool-test',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value: string) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  } satisfies AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, plan, {} as never);
  const tool = createAwsCeTeardownTool(
    { typebox } as PluginInterface,
    () => ({ exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }) }),
    {
      platform: async () => platform,
      terraform: async () => terraform,
      contract: async () => ({ fingerprint: 'ingress-contract' }) as never,
      async prepare(_plan, _runtime, _contract, target) {
        await target.write(`${teardown.planId}.json`, teardown);
        return teardown;
      },
      async run(_plan, selected, authorized) {
        expect(selected).toEqual(teardown);
        expect(authorized).toBe(teardown.planSha256);
        runs++;
        return {
          status: 'ce-retired-supporting-infrastructure-unverified' as const,
          cloudInventory: 'absent-or-retired' as const,
        } as never;
      },
      prepareNative: async () => {
        throw new Error('native preparation must not run');
      },
      runNative: async () => {
        throw new Error('native teardown must not run');
      },
      applyNative: async () => {
        throw new Error('native apply must not run');
      },
    },
  );
  const prepared = (await tool.execute(
    '1',
    { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256 },
    undefined,
    undefined,
    ctx,
  )) as { details: { planId: string; planSha256: string } };
  const input = {
    operation: 'apply' as const,
    basePlanId: plan.planId,
    basePlanSha256: plan.planSha256,
    teardownPlanId: prepared.details.planId,
    teardownPlanSha256: prepared.details.planSha256,
  };
  expect(
    ((await tool.execute('2', input, undefined, undefined, ctx)) as { details: { status: string } }).details.status,
  ).toBe('ce-retired-supporting-infrastructure-unverified');
  expect(
    ((await tool.execute('3', input, undefined, undefined, ctx)) as { details: { status: string } }).details.status,
  ).toBe('ce-retired-supporting-infrastructure-unverified');
  expect({ confirms, runs, opens }).toEqual({ confirms: 1, runs: 2, opens: 2 });
  expect(artifacts.some((value) => value.includes('tokens'))).toBe(false);
});

test('public teardown tool routes a native-owned plan without opening Terraform', async () => {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...initialDraft } = initial;
  const baseDraft = {
    ...initialDraft,
    engine: 'native' as const,
    intent: { ...initial.intent, engine: 'native' as const },
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const baseSha = canonicalSha256(baseDraft);
  const base = { ...baseDraft, planSha256: baseSha, planId: `aws-ce-${baseSha.slice(0, 24)}` };
  const { planId: _baseId, planSha256: _baseSha, ...cloudSource } = base;
  const cloudDraft = { ...cloudSource, intent: { ...base.intent, operation: 'teardown' as const } };
  const cloudSha = canonicalSha256(cloudDraft);
  const cloud = { ...cloudDraft, planSha256: cloudSha, planId: `aws-ce-${cloudSha.slice(0, 24)}` };
  const binding = siteBindings(base)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'aws-ce-native-teardown-tool-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner);
  const teardownDraft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-native-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: {
      schemaVersion: 1 as const,
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: 'site-contract',
      ingressContractFingerprint: 'ingress-contract',
      listeners: [],
      origins: [],
      sites: [],
    },
    retirement: [],
  };
  const teardownSha = canonicalSha256(teardownDraft);
  const teardown: AwsNativeTeardownPlan = {
    ...teardownDraft,
    planId: `aws-ce-native-teardown-${teardownSha.slice(0, 24)}`,
    planSha256: teardownSha,
  };
  let confirms = 0;
  let terraformCalls = 0;
  let nativeRuns = 0;
  const artifacts: string[] = [];
  const ctx = {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      confirm: async () => {
        confirms++;
        return true;
      },
    },
    sessionManager: {
      getSessionId: () => 'native-teardown-tool-test',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async (value: string) => {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  } satisfies AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, base, {} as never);
  await saveAwsPlan(ctx.sessionManager, cloud, {} as never);
  const platform = {
    storage: async () => storage,
    runtime: async () => ({ engine: 'native' }),
  } as unknown as CePlatformService;
  const tool = createAwsCeTeardownTool(
    { typebox } as PluginInterface,
    () => ({ exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }) }),
    {
      platform: async () => platform,
      terraform: async () => {
        terraformCalls++;
        throw new Error('Terraform must not open');
      },
      contract: async () => ({ fingerprint: 'ingress-contract' }) as never,
      prepare: async () => {
        throw new Error('Terraform preparation must not run');
      },
      run: async () => {
        throw new Error('Terraform teardown must not run');
      },
      async prepareNative(_base, _cloud, _runtime, _contract, target) {
        await target.write(`${teardown.planId}.json`, teardown);
        return teardown;
      },
      async runNative(_base, selected, saved, authorized) {
        expect(selected).toEqual(cloud);
        expect(saved).toEqual(teardown);
        expect(authorized).toBe(teardown.planSha256);
        nativeRuns++;
        return { status: 'ce-retired-supporting-infrastructure-unverified', cloudInventory: 'absent' } as never;
      },
      applyNative: async () => {
        throw new Error('coordinator mock owns cloud execution');
      },
    },
  );
  const prepared = (await tool.execute(
    'native-prepare',
    {
      operation: 'prepare',
      basePlanId: base.planId,
      basePlanSha256: base.planSha256,
      cloudPlanId: cloud.planId,
      cloudPlanSha256: cloud.planSha256,
    },
    undefined,
    undefined,
    ctx,
  )) as { details: { planId: string; planSha256: string } };
  const applied = (await tool.execute(
    'native-apply',
    {
      operation: 'apply',
      basePlanId: base.planId,
      basePlanSha256: base.planSha256,
      teardownPlanId: prepared.details.planId,
      teardownPlanSha256: prepared.details.planSha256,
    },
    undefined,
    undefined,
    ctx,
  )) as { details: { status: string } };
  expect(applied.details.status).toBe('ce-retired-supporting-infrastructure-unverified');
  expect({ confirms, terraformCalls, nativeRuns }).toEqual({ confirms: 1, terraformCalls: 0, nativeRuns: 1 });
});
