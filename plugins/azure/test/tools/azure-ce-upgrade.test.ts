import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { PluginInterface } from '../../src/az/types';
import { type AzureCeToolContext, savePlanArtifact } from '../../src/ce/artifacts';
import { sha256Hex } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCeUpgradeTool } from '../../src/tools/azure-ce-upgrade';
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
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;

test('public Azure upgrade tool prepares, authorizes and idempotently resumes an exact Terraform action', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const target = 'crt-20260201-0179';
  const path = await mkdtemp(join(tmpdir(), 'azure-ce-upgrade-tool-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let observations = 0;
  let applies = 0;
  let confirms = 0;
  const runtime = {
    engine: 'terraform' as const,
    async observeUpgrade() {
      observations++;
      const installed = observations >= 4 ? target : 'crt-20260201-0178';
      return {
        owner: binding.owner,
        nodes: binding.nodes,
        siteName: binding.siteName,
        source: `/api/config/namespaces/system/sites/${binding.siteName}`,
        siteUid: 'logical-azure',
        physicalSiteUid: 'physical-azure',
        contractFingerprint: contract.fingerprint,
        siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
        status: 'observed' as const,
        startedAt: new Date(Date.now() - 100).toISOString(),
        observedAt: new Date().toISOString(),
        targetSoftware: target,
        online: true,
        siteState: 'ONLINE',
        software: { installed, available: target, phase: 'UPGRADE_COMPLETED', result: 'Completed' },
        os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
        targets: [target],
        targetSoftwareListed: true,
        prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
        progress: { status: 'COMPLETED', version: installed },
        sources: { site: '', targets: '', precheck: '', progress: '' },
        nodeHealth: 'unknown' as const,
        routing: 'unknown' as const,
        traffic: 'unknown' as const,
      };
    },
  } as Pick<CeRuntime, 'engine' | 'observeUpgrade'>;
  let upgrade: Record<string, unknown> | undefined;
  const session = {
    async planAction(action: unknown) {
      if (!upgrade) throw new Error('Upgrade was not prepared');
      const deployment = upgrade.deployment as Record<string, string>;
      return {
        schemaVersion: 1 as const,
        deploymentId: deployment.deploymentId,
        engine: 'terraform' as const,
        backendIdentity: deployment.backendIdentity,
        configurationSha256: sha256Hex(deployment.configuration),
        providerLockSha256: sha256Hex(deployment.providerLock),
        planSha256: 'c'.repeat(64),
        changes: [],
        noChanges: false,
        actionInvocations: [action],
      };
    },
    async apply() {
      applies++;
    },
  } as unknown as TerraformSession;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const platform = {
    storage: async () => storage,
    runtime: async () => runtime,
  } as unknown as CePlatformService;
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
      getSessionId: () => 'azure-upgrade-tool-test',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      async saveArtifact(value: string) {
        artifacts.push(value);
        return String(artifacts.length);
      },
    },
  } satisfies AzureCeToolContext;
  await savePlanArtifact(ctx.sessionManager, plan, observation);
  const tool = createAzureCeUpgradeTool({ typebox } as PluginInterface, {
    platform: async () => platform,
    terraform: async () => terraform,
    contract: async () => contract,
  });
  const prepared = (await tool.execute(
    '1',
    {
      operation: 'prepare',
      basePlanId: plan.planId,
      basePlanSha256: plan.planSha256,
      kind: 'software',
      version: target,
    },
    undefined,
    undefined,
    ctx,
  )) as { details: { planId: string; planSha256: string } };
  upgrade = (await storage.read(`${prepared.details.planId}.json`)) as Record<string, unknown>;
  const input = {
    operation: 'apply' as const,
    basePlanId: plan.planId,
    basePlanSha256: plan.planSha256,
    upgradePlanId: prepared.details.planId,
    upgradePlanSha256: prepared.details.planSha256,
  };
  expect(
    ((await tool.execute('2', input, undefined, undefined, ctx)) as { details: { status: string } }).details.status,
  ).toBe('upgrade-complete');
  expect(
    ((await tool.execute('3', input, undefined, undefined, ctx)) as { details: { status: string } }).details.status,
  ).toBe('upgrade-complete');
  expect({ applies, confirms }).toEqual({ applies: 1, confirms: 1 });
  expect(artifacts.some((value) => value.includes('providerLock'))).toBe(false);
});
