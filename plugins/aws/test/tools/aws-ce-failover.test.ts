import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/aws/types';
import { type AwsCeToolContext, saveAwsPlan } from '../../src/ce/artifacts';
import { canonicalSha256, sha256Hex } from '../../src/ce/canonical';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import type { AwsTerraformFailover } from '../../src/ce/terraform-failover';
import { createAwsCeFailoverTool } from '../../src/tools/aws-ce-failover';
import { connectFixture } from '../ce/terraform-connect-fixture';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const typebox = {
  Type: {
    Object: (value: unknown) => value,
    String: () => ({}),
    Number: () => ({}),
    Optional: (value: unknown) => value,
    Union: (value: unknown) => value,
    Literal: (value: unknown) => value,
  },
} as unknown as PluginInterface['typebox'];

test('public failover prepares a private plan and applies it with one durable authorization', async () => {
  const fixture = connectFixture();
  const { planId: _id, planSha256: _sha, ...draft } = fixture.plan;
  draft.routing = structuredClone(draft.intent.routing);
  const normalized = {
    ...draft,
    accountId: fixture.plan.intent.accountId,
    region: fixture.plan.intent.region,
    deploymentName: fixture.plan.intent.deploymentName,
  };
  const planSha256 = canonicalSha256(normalized);
  const plan = { ...normalized, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const configuration = renderAwsTerraformConnect(plan, fixture.observation, fixture.bootstrap);
  const directory = await mkdtemp(join(tmpdir(), 'aws-ce-failover-tool-'));
  directories.push(directory);
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: plan.accountId,
    region: plan.region,
  };
  const storage = await CeDeploymentStore.open(directory, owner);
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: sha256Hex(configuration),
    stage: 'applied',
  });
  await storage.write('terraform-routing-checkpoint.json', {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    resolvedValues: {},
    state: 'running',
  });
  const session = {
    async readConfiguration(expected: string) {
      expect(expected).toBe(sha256Hex(configuration));
      return configuration;
    },
    async readOutputs() {
      return {
        ce_instances: Object.fromEntries(
          Array.from({ length: plan.intent.topology.nodeCount }, (_, index) => [
            String(index + 1),
            {
              id: `i-${String(index + 1).repeat(17)}`,
              hostname: `${plan.deploymentName}-${index + 1}`,
              site_name: plan.intent.topology.sites?.[index]?.name,
            },
          ]),
        ),
      };
    },
  } as unknown as TerraformSession;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const platform = { storage: async () => storage } as unknown as CePlatformService;
  const artifacts: string[] = [];
  let confirms = 0;
  let runs = 0;
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
      getSessionId: () => 'failover-tool-test',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value: string) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  } satisfies AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, plan, fixture.observation);
  const tool = createAwsCeFailoverTool({ typebox } as PluginInterface, {
    platform: async () => platform,
    terraform: async () => terraform,
    makeApi: () => ({ exec: async () => ({ exitCode: 0, stdout: '{}', stderr: '' }) }),
    collect: async () => ({ acceptance: 'passed' }),
    async run(_base, failover, authorized) {
      runs++;
      expect(authorized).toBe(failover.planSha256);
      return {
        status: 'failover-complete' as const,
        engine: 'terraform' as const,
        planId: failover.planId,
        planSha256: failover.planSha256,
        nodeIndex: failover.nodeIndex,
        finalPlanSha256: 'f'.repeat(64),
        observedAt: new Date().toISOString(),
        traffic: 'unknown' as const,
        originControl: 'unknown' as const,
      };
    },
  });
  const prepared = (await tool.execute(
    '1',
    { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256, nodeIndex: 1 },
    undefined,
    undefined,
    ctx,
  )) as { isError?: boolean; details: { planId: string; planSha256: string } };
  if (prepared.isError) throw new Error((prepared as unknown as { content: Array<{ text: string }> }).content[0].text);
  expect(prepared.isError).toBeUndefined();
  const privatePlan = (await storage.read(`${prepared.details.planId}.json`)) as AwsTerraformFailover;
  expect(privatePlan.stages.stop.configuration).toContain('aws_ec2_instance_state');
  expect(artifacts[0]).not.toContain('user_data_base64');
  const input = {
    operation: 'apply' as const,
    basePlanId: plan.planId,
    basePlanSha256: plan.planSha256,
    failoverPlanId: prepared.details.planId,
    failoverPlanSha256: prepared.details.planSha256,
  };
  expect((await tool.execute('2', input, undefined, undefined, ctx)).isError).toBeUndefined();
  expect((await tool.execute('3', input, undefined, undefined, ctx)).isError).toBeUndefined();
  expect(confirms).toBe(1);
  expect(runs).toBe(2);
});
