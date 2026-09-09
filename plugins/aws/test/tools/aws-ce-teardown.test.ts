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
