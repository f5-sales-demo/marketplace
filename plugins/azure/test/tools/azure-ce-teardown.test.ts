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
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCeTeardownTool } from '../../src/tools/azure-ce-teardown';
import { intent, observation } from '../ce/fixtures';

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
