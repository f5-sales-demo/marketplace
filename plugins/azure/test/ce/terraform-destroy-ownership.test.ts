import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { runAzureTerraformCloudTeardown } from '../../src/ce/terraform-cloud-teardown';
import { verifyAzureTerraformDestroyOwnership } from '../../src/ce/terraform-destroy-ownership';
import { azureTerraformCurrentDeployment } from '../../src/ce/terraform-foundation';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

function fixture() {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${plan.deploymentName}`,
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    operation: 'destroy',
    noChanges: false,
    changes: [
      { address: 'azurerm_linux_virtual_machine.node_1', type: 'azurerm_linux_virtual_machine', actions: ['delete'] },
      { address: 'azurerm_resource_group.ce', type: 'azurerm_resource_group', actions: ['delete'] },
      { address: 'tls_private_key.node_1', type: 'tls_private_key', actions: ['delete'] },
    ],
  };
  const fields: Record<string, Record<string, unknown> | null> = {
    'azurerm_linux_virtual_machine.node_1': { id: `${groupId}/providers/Microsoft.Compute/virtualMachines/ce-1` },
    'azurerm_resource_group.ce': { id: groupId },
    'tls_private_key.node_1': { id: 'local-key-id' },
  };
  const session = {
    async readPlannedResourceFields() {
      return structuredClone(fields);
    },
  } as Pick<TerraformSession, 'readPlannedResourceFields'>;
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
            : args[0] === 'group' && args[1] === 'exists'
              ? true
              : {
                  id: groupId,
                  location: plan.region,
                  tags: {
                    'xcsh-managed-by': 'azure-ce',
                    'xcsh-execution-engine': 'terraform',
                    'xcsh-deployment-id': plan.deploymentName,
                    'xcsh-plan-sha256': plan.planSha256,
                  },
                },
        ),
      };
    },
  };
  return { plan, receipt, fields, session, api, groupId };
}

test('opens the original Azure workspace without reconstructing bootstrap material', async () => {
  const { plan } = fixture();
  const deployment = await azureTerraformCurrentDeployment(plan);
  expect(deployment).toMatchObject({
    deploymentId: plan.deploymentName,
    backendIdentity: `local:${plan.deploymentName}`,
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
  });
  expect(deployment.configuration).not.toContain('custom_data');
  expect(JSON.parse(deployment.configuration).provider.azurerm.subscription_id).toBe(plan.subscription.id);
});

test('binds every Azure destroy target to the live owned greenfield resource group', async () => {
  const f = fixture();
  expect(await verifyAzureTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).toEqual({
    resourceGroupId: f.groupId,
    resourceCount: 3,
    ownerPlanSha256: f.plan.planSha256,
  });
});

test('permits only the exact apply-only Marketplace acceptance action during Terraform state teardown', async () => {
  const f = fixture();
  const address = 'azapi_resource_action.marketplace_terms';
  f.receipt.changes.unshift({ address, type: 'azapi_resource_action', actions: ['delete'] });
  f.fields[address] = {
    resource_id: `/subscriptions/${f.plan.subscription.id}/providers/Microsoft.MarketplaceOrdering/offerTypes/virtualmachine/publishers/${f.plan.image.publisher}/offers/${f.plan.image.offer}/plans/${f.plan.image.plan}/agreements/current`,
    type: 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01',
    method: 'PUT',
    when: 'apply',
  };
  await expect(verifyAzureTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).resolves.toMatchObject({
    resourceCount: 4,
  });
  for (const [field, value] of [
    ['resource_id', `${f.fields[address].resource_id}-foreign`],
    ['type', 'Microsoft.MarketplaceOrdering/agreements@2021-01-01'],
    ['method', 'DELETE'],
    ['when', 'destroy'],
  ] as const) {
    const original = f.fields[address][field];
    f.fields[address][field] = value;
    await expect(verifyAzureTerraformDestroyOwnership(f.plan, f.receipt, f.session, f.api, {})).rejects.toThrow(
      /Marketplace agreement action differs/,
    );
    f.fields[address][field] = original;
  }
});

test('rejects foreign groups, cross-scope resources, unsupported types and non-destroy plans', async () => {
  const foreign = fixture();
  const foreignApi: AzExecApi = {
    async exec(command, args, options) {
      const result = await foreign.api.exec(command, args, options);
      if (args[0] !== 'group' || args[1] !== 'show') return result;
      const value = JSON.parse(result.stdout);
      value.tags['xcsh-execution-engine'] = 'native';
      return { ...result, stdout: JSON.stringify(value) };
    },
  };
  await expect(
    verifyAzureTerraformDestroyOwnership(foreign.plan, foreign.receipt, foreign.session, foreignApi, {}),
  ).rejects.toThrow(/foreign or replaced/);

  const outside = fixture();
  outside.fields['azurerm_linux_virtual_machine.node_1'] = {
    id: `/subscriptions/${outside.plan.subscription.id}/resourceGroups/other/providers/Microsoft.Compute/virtualMachines/x`,
  };
  await expect(
    verifyAzureTerraformDestroyOwnership(outside.plan, outside.receipt, outside.session, outside.api, {}),
  ).rejects.toThrow(/outside/);

  const unsupported = fixture();
  unsupported.receipt.changes[0] = {
    address: 'azurerm_storage_account.x',
    type: 'azurerm_storage_account',
    actions: ['delete'],
  };
  await expect(
    verifyAzureTerraformDestroyOwnership(
      unsupported.plan,
      unsupported.receipt,
      unsupported.session,
      unsupported.api,
      {},
    ),
  ).rejects.toThrow(/supported resource types/);
  await expect(
    verifyAzureTerraformDestroyOwnership(
      outside.plan,
      { ...outside.receipt, operation: undefined },
      outside.session,
      outside.api,
      {},
    ),
  ).rejects.toThrow(/destroy plan/);
});

test('reconciles a lost destroy response from exact group absence and finishes no-change', async () => {
  const f = fixture();
  let groupExists = true;
  let applies = 0;
  let reconciliations = 0;
  let plans = 0;
  const final = { ...f.receipt, noChanges: true, changes: [] };
  const session: TerraformSession = {
    async planDestroy() {
      plans++;
      return plans === 1 ? f.receipt : final;
    },
    async apply() {
      applies++;
      groupExists = false;
      throw new Error('destroy response lost');
    },
    async reconcileApplyFromEvidence(receipt, evidenceSha256) {
      expect(receipt.planSha256).toBe(f.receipt.planSha256);
      expect(evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
      reconciliations++;
    },
    async readPlannedResourceFields() {
      return structuredClone(f.fields);
    },
  } as unknown as TerraformSession;
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (args[0] === 'group' && args[1] === 'exists')
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(groupExists) };
      return f.api.exec(command, args, options);
    },
  };
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-destroy-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  expect(await runAzureTerraformCloudTeardown(f.plan, session, storage, api, {})).toMatchObject({
    status: 'terraform-cloud-retired',
    sourcePlanSha256: f.plan.planSha256,
  });
  expect({ applies, reconciliations, plans }).toEqual({ applies: 1, reconciliations: 1, plans: 2 });
  expect(await storage.read('azure-terraform-cloud-destroy-reconciliation.json')).toMatchObject({ status: 'absent' });
});
