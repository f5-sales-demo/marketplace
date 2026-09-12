import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import type { AzureCePlan } from './types';

const cloudTypes = new Set([
  'azurerm_linux_virtual_machine',
  'azurerm_network_interface',
  'azurerm_network_interface_security_group_association',
  'azurerm_network_security_group',
  'azurerm_network_security_rule',
  'azurerm_public_ip',
  'azurerm_resource_group',
  'azurerm_route_server',
  'azurerm_route_server_bgp_connection',
  'azurerm_subnet',
  'azurerm_virtual_network',
]);
const localTypes = new Set(['tls_private_key']);
const marketplaceTermsAddress = 'azapi_resource_action.marketplace_terms';
const marketplaceTermsType = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01';
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed Azure Terraform teardown identity');
  return value as Record<string, unknown>;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

async function read(api: AzExecApi, plan: AzureCePlan, args: string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Terraform teardown ownership observation unavailable');
  try {
    return object(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform teardown ownership observation');
  }
}

export async function observeAzureTerraformDestroyBoundary(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(plan);
  const account = await read(api, plan, ['account', 'show'], signal);
  if (
    lower(account.id) !== lower(plan.subscription.id) ||
    lower(account.tenantId) !== lower(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform teardown account differs from deployment');
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  signal?.throwIfAborted();
  const existsResult = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (existsResult.exitCode !== 0) throw new Error('Azure Terraform teardown boundary observation unavailable');
  let exists: unknown;
  try {
    exists = JSON.parse(existsResult.stdout);
  } catch {
    throw new Error('Malformed Azure Terraform teardown boundary observation');
  }
  if (exists === false)
    return { status: 'absent' as const, resourceGroupId: groupId, observedAt: new Date().toISOString() };
  if (exists !== true) throw new Error('Malformed Azure Terraform teardown boundary observation');
  const group = await read(api, plan, ['group', 'show', '--name', plan.intent.resourceGroup], signal);
  const tags = object(group.tags);
  if (
    lower(group.id) !== lower(groupId) ||
    lower(group.location) !== lower(plan.region) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure Terraform teardown resource group is foreign or replaced');
  return {
    status: 'owned' as const,
    resourceGroupId: groupId,
    ownerPlanSha256: plan.planSha256,
    observedAt: new Date().toISOString(),
  };
}

/** Verify that an exact destroy plan can affect only the original owned greenfield resource group. */
export async function verifyAzureTerraformDestroyOwnership(
  plan: AzureCePlan,
  receipt: PlanReceipt,
  session: Pick<TerraformSession, 'readPlannedResourceFields'>,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.intent.brownfield.resourceIds.length ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.actionInvocations?.length ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!cloudTypes.has(change.type) &&
          !localTypes.has(change.type) &&
          !(change.type === 'azapi_resource_action' && change.address === marketplaceTermsAddress)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning Azure Terraform destroy plan with supported resource types required');
  const boundary = await observeAzureTerraformDestroyBoundary(plan, api, signal);
  if (boundary.status !== 'owned') throw new Error('Azure Terraform teardown resource group is absent');
  const groupId = boundary.resourceGroupId;
  const selections = receipt.changes.length
    ? Object.fromEntries(
        receipt.changes.map((change) => [
          change.address,
          change.type === 'azapi_resource_action' ? ['resource_id', 'type', 'method', 'when'] : ['id'],
        ]),
      )
    : { 'azurerm_resource_group.ce': ['id'] };
  const fields = await session.readPlannedResourceFields(receipt, selections, env, signal);
  if (!receipt.changes.length) {
    if (fields['azurerm_resource_group.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Azure Terraform destroy plan identity differs');
    return { resourceGroupId: groupId, resourceCount: 0, ownerPlanSha256: plan.planSha256 };
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Azure Terraform teardown identity projection');
  for (const change of receipt.changes) {
    if (change.type === 'azapi_resource_action') {
      const terms = object(fields[change.address]);
      const expectedResourceId = [
        `/subscriptions/${plan.subscription.id}`,
        'providers/Microsoft.MarketplaceOrdering',
        'offerTypes/virtualmachine',
        `publishers/${plan.image.publisher}`,
        `offers/${plan.image.offer}`,
        `plans/${plan.image.plan}`,
        'agreements/current',
      ].join('/');
      if (
        lower(terms.resource_id) !== lower(expectedResourceId) ||
        terms.type !== marketplaceTermsType ||
        terms.method !== 'PUT' ||
        terms.when !== 'apply'
      )
        throw new Error(
          'Azure Terraform destroy Marketplace agreement action differs from the exact apply-only contract',
        );
      continue;
    }
    const id = object(fields[change.address]).id;
    if (typeof id !== 'string' || !id) throw new Error('Azure Terraform teardown resource ID is unavailable');
    if (localTypes.has(change.type)) continue;
    if (
      change.type === 'azurerm_resource_group'
        ? lower(id) !== lower(groupId)
        : !lower(id).includes(`${lower(groupId)}/`)
    )
      throw new Error('Azure Terraform destroy target is outside the owned resource group');
  }
  return { resourceGroupId: groupId, resourceCount: receipt.changes.length, ownerPlanSha256: plan.planSha256 };
}
