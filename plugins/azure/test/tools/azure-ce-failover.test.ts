import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PluginInterface } from '../../src/az/types';
import { type AzureCeToolContext, savePlanArtifact } from '../../src/ce/artifacts';
import { azureFailoverOwner, verifyAzureCeFailoverPlan } from '../../src/ce/failover';
import { compileAzureCePlan } from '../../src/ce/planner';
import { createAzureCeFailoverTool } from '../../src/tools/azure-ce-failover';
import { intent, observation } from '../ce/fixtures';

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

function routeServerPlan(engine: 'native' | 'terraform') {
  return compileAzureCePlan(
    { ...intent, engine, routing: { mode: 'route-server', destinationCidrs: [], localAsn: 64512 } },
    observation,
  );
}

function context(id: string): AzureCeToolContext & { artifacts: string[] } {
  const artifacts: string[] = [];
  return {
    cwd: '/tmp',
    hasUI: true,
    ui: {
      async confirm() {
        throw new Error('Apply must fail before authorization');
      },
    },
    sessionManager: {
      getSessionId: () => id,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value: string) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
    artifacts,
  };
}

test.each(['native', 'terraform'] as const)(
  'Azure failover prepares an exact %s-owned VM and refuses apply without routing evidence',
  async (engine) => {
    const plan = routeServerPlan(engine);
    const vmResourceId = plan.actions.find((action) => action.kind === 'vm-create' && action.node === 1)?.resourceId;
    expect(vmResourceId).toBeString();
    const root = await mkdtemp(join(tmpdir(), 'azure-ce-failover-tool-'));
    directories.push(root);
    const storage = await CeDeploymentStore.open(root, azureFailoverOwner(plan));
    const platform = { storage: async () => storage } as unknown as CePlatformService;
    const commands: string[][] = [];
    const api = {
      async exec(_command: string, args: string[]) {
        commands.push(args);
        if (args[0] === 'account')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: plan.subscription.cloud,
              state: 'Enabled',
            }),
          };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: vmResourceId,
            vmId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            location: plan.region,
            provisioningState: 'Succeeded',
            powerState: 'VM running',
            tags: {
              'xcsh-managed-by': 'azure-ce',
              'xcsh-execution-engine': engine,
              'xcsh-deployment-id': plan.deploymentName,
              'xcsh-plan-sha256': plan.planSha256,
            },
          }),
        };
      },
    };
    const ctx = context(`azure-failover-${engine}`);
    await savePlanArtifact(ctx.sessionManager, plan, observation);
    const tool = createAzureCeFailoverTool({ typebox } as PluginInterface, {
      platform: async () => platform,
      makeApi: () => api,
    });
    const prepared = (await tool.execute(
      'prepare',
      { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256, nodeIndex: 1 },
      undefined,
      undefined,
      ctx,
    )) as { isError?: boolean; details: { planId: string; planSha256: string } };
    expect(prepared.isError).toBeUndefined();
    const saved = await storage.read(`${prepared.details.planId}.json`);
    verifyAzureCeFailoverPlan(plan, saved as never);
    expect(commands).toHaveLength(2);
    expect(ctx.artifacts.at(-1)).not.toContain('tags');

    const result = (await tool.execute(
      'apply',
      {
        operation: 'apply',
        basePlanId: plan.planId,
        basePlanSha256: plan.planSha256,
        failoverPlanId: prepared.details.planId,
        failoverPlanSha256: prepared.details.planSha256,
      },
      undefined,
      undefined,
      ctx,
    )) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('verified platform SLO BGP mapping');
    expect(commands).toHaveLength(2);
  },
);

test('Azure failover rejects stale or forged VM ownership evidence', async () => {
  const plan = routeServerPlan('terraform');
  const root = await mkdtemp(join(tmpdir(), 'azure-ce-failover-forged-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(plan));
  const ctx = context('azure-failover-forged');
  await savePlanArtifact(ctx.sessionManager, plan, observation);
  const tool = createAzureCeFailoverTool({ typebox } as PluginInterface, {
    platform: async () => ({ storage: async () => storage }) as unknown as CePlatformService,
    makeApi: () => ({
      async exec(_command: string, args: string[]) {
        if (args[0] === 'account')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: plan.subscription.cloud,
              state: 'Enabled',
            }),
          };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: args[args.indexOf('--ids') + 1],
            vmId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
            location: plan.region,
            provisioningState: 'Succeeded',
            powerState: 'VM running',
            tags: {
              'xcsh-managed-by': 'azure-ce',
              'xcsh-execution-engine': 'native',
              'xcsh-deployment-id': plan.deploymentName,
              'xcsh-plan-sha256': plan.planSha256,
            },
          }),
        };
      },
    }),
  });
  const result = (await tool.execute(
    'prepare',
    { operation: 'prepare', basePlanId: plan.planId, basePlanSha256: plan.planSha256, nodeIndex: 1 },
    undefined,
    undefined,
    ctx,
  )) as { isError?: boolean; content: Array<{ text: string }> };
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('ownership differs');
});
