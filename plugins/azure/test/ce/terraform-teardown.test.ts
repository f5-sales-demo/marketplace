import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { prepareAzureTerraformTeardown, runAzureTerraformTeardown } from '../../src/ce/terraform-teardown';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

test('prepares and runs ordered Azure Terraform platform, cloud, token and site retirement', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const site = { siteName: plan.siteName, siteUid: 'site-uid', physicalSiteUid: 'physical-uid' };
  const token = {
    kind: 'tokens',
    name: 'ce-token',
    namespace: 'system',
    uid: 'token-uid',
    siteName: plan.siteName,
    node: binding.nodes[0],
  };
  const siteFingerprint = `sha256:${'a'.repeat(64)}`;
  const ingressFingerprint = `sha256:${'b'.repeat(64)}`;
  const contract = { fingerprint: ingressFingerprint } as VerifiedIngressContract;
  const order: string[] = [];
  let siteObservation = 0;
  const runtime = {
    engine: 'terraform',
    contract: { fingerprint: siteFingerprint },
    async teardownInventory() {
      return {
        status: 'observed',
        owner: binding.owner,
        siteContractFingerprint: siteFingerprint,
        ingressContractFingerprint: ingressFingerprint,
        sites: [site],
        resources: [token],
        observedAt: new Date().toISOString(),
      };
    },
    ingress: () => ({
      teardownReference: async () => {
        throw new Error('unexpected listener');
      },
    }),
    originTeardown: () => ({
      observe: async () => {
        throw new Error('unexpected origin');
      },
    }),
    async drainPlatform() {
      order.push('platform');
      return { status: 'platform-drained' };
    },
    async observeSiteDeletion() {
      siteObservation++;
      return { status: siteObservation === 1 ? 'pending' : 'deleted' };
    },
    async deleteBootstrapToken() {
      order.push('token');
    },
    async deleteSiteExact() {
      order.push('site');
    },
  } as unknown as CeRuntime;
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-teardown-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner);
  const teardown = await prepareAzureTerraformTeardown(plan, runtime, contract, storage);
  expect(teardown).toMatchObject({ engine: 'terraform', sourcePlanSha256: plan.planSha256 });
  let groupExists = true;
  let plans = 0;
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const changed: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${plan.deploymentName}`,
    configurationSha256: 'c'.repeat(64),
    providerLockSha256: 'd'.repeat(64),
    planSha256: 'e'.repeat(64),
    operation: 'destroy',
    changes: [{ address: 'azurerm_resource_group.ce', type: 'azurerm_resource_group', actions: ['delete'] }],
    noChanges: false,
  };
  const session = {
    async planDestroy() {
      plans++;
      return plans === 1 ? changed : { ...changed, planSha256: 'f'.repeat(64), changes: [], noChanges: true };
    },
    async readPlannedResourceFields() {
      return { 'azurerm_resource_group.ce': { id: groupId } };
    },
    async apply() {
      order.push('cloud');
      groupExists = false;
    },
  } as unknown as TerraformSession;
  const api: AzExecApi = {
    async exec(_command, args) {
      const value =
        args[0] === 'account'
          ? {
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: 'AzureCloud',
              state: 'Enabled',
            }
          : args[1] === 'exists'
            ? groupExists
            : {
                id: groupId,
                location: plan.region,
                tags: {
                  'xcsh-managed-by': 'azure-ce',
                  'xcsh-execution-engine': 'terraform',
                  'xcsh-deployment-id': plan.deploymentName,
                  'xcsh-plan-sha256': plan.planSha256,
                },
              };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  expect(
    await runAzureTerraformTeardown(plan, teardown, teardown.planSha256, runtime, contract, session, storage, api, {}),
  ).toMatchObject({ status: 'retired', cloud: 'absent', sites: 'deleted' });
  expect(order).toEqual(['platform', 'cloud', 'token', 'site']);
});
