import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { renderTerraformConfigurationJson } from '../../../terraform/src/configuration-json';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  captureAzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import { AZURE_CE_TERRAFORM_VERSION } from './terraform-foundation';
import { AZURE_CE_AZAPI_PROVIDER_VERSION } from './terraform-lifecycle';
import type { AzureCePlan } from './types';

type Operation = 'deallocate' | 'start';
type Phase = 'mutation' | 'release' | 'final';
const address = 'azapi_resource_action.ce_network';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power: ${message}`);
}
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Record<string, unknown>;
};
function action(plan: AzureCePlan, inventory: AzureNetworkUpdateInventory, node: number, operation: Operation) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    ['deallocate', 'start'].includes(operation) &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount, 'exact owning network node and operation required');
  const vm = inventory.nodes[String(node)];
  const matches = plan.actions.filter(
    (a) => a.node === node && a.kind === (operation === 'start' ? 'vm-start' : 'vm-deallocate'),
  );
  require(matches.length === 1 &&
    matches[0].resourceId === vm.resourceId &&
    matches[0].expectedOwnerPlanSha256 === vm.ownerPlanSha256, 'saved selected VM action differs');
  return {
    type: 'Microsoft.Compute/virtualMachines@2024-07-01',
    resource_id: vm.resourceId,
    action: operation,
    method: 'POST',
    when: 'apply',
    locks: [vm.resourceId],
  };
}

/** Separate isolated control for the owning network executor. Inventory UUIDs require fresh cloud rechecks before execution. */
export async function azureTerraformNetworkPowerDeployment(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  node: number,
  operation: Operation,
  release = false,
): Promise<Deployment> {
  const selected = action(plan, inventory, node, operation);
  require(typeof release === 'boolean', 'exact release selection required');
  return powerDeployment(plan, node, operation, release ? undefined : selected);
}

/** Read-only reconstruction of an already retired power runner's release identity.
 * The current-resume service retains its persisted configuration digest; the caller
 * must separately authenticate the exact frozen native manifest and final receipt.
 * No VM inventory, private source configuration or execution identifier is invented.
 */
export async function azureTerraformNetworkRetiredPowerDeployment(
  plan: AzureCePlan,
  node: number,
  operation: Operation,
): Promise<Deployment> {
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    /^[a-f0-9]{64}$/.test(plan.planSha256) &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    ['deallocate', 'start'].includes(operation), 'exact retired network node and operation required');
  return powerDeployment(plan, node, operation);
}

async function powerDeployment(
  plan: AzureCePlan,
  node: number,
  operation: Operation,
  selected?: ReturnType<typeof action>,
): Promise<Deployment> {
  const stage = `network-${plan.planSha256.slice(0, 24)}-node-${node}-${operation}`;
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    providerLock: await readFile(new URL('../../terraform/azapi-provider-lock.hcl', import.meta.url), 'utf8'),
    backendIdentity: `local:${plan.deploymentName}:stage:${stage}`,
    configuration: renderTerraformConfigurationJson({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: { azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` } },
      },
      provider: { azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId } },
      resource: selected ? { azapi_resource_action: { ce_network: selected } } : {},
    }),
  };
}

/** Recompile immutable scope and effects. Receipt acceptance proves neither application nor current VM/CE state. */
export async function validateAzureTerraformNetworkPowerPlan(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  node: number,
  operation: Operation,
  input: unknown,
  phase: Phase,
): Promise<PlanReceipt> {
  require(['mutation', 'release', 'final'].includes(phase), 'exact plan phase required');
  const deployment = await azureTerraformNetworkPowerDeployment(plan, inventory, node, operation, phase !== 'mutation');
  const row = object(input);
  const required = [
    'schemaVersion',
    'deploymentId',
    'engine',
    'backendIdentity',
    'configurationSha256',
    'providerLockSha256',
    'planSha256',
    'changes',
    'noChanges',
  ];
  const optional = ['actionInvocations', 'imports', 'relinquishments'];
  require(required.every((key) => key in row) &&
    Object.keys(row).every((key) => [...required, ...optional].includes(key)) &&
    row.schemaVersion === 1 &&
    row.deploymentId === deployment.deploymentId &&
    row.engine === 'terraform' &&
    row.backendIdentity === deployment.backendIdentity &&
    row.configurationSha256 === hash(deployment.configuration) &&
    row.providerLockSha256 === hash(deployment.providerLock) &&
    typeof row.planSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(row.planSha256) &&
    typeof row.noChanges === 'boolean' &&
    Array.isArray(row.changes) &&
    optional.every(
      (key) => row[key] === undefined || (Array.isArray(row[key]) && row[key].length === 0),
    ), 'saved plan identity or metadata differs');
  const changes = row.changes.map(object);
  const allowed = phase === 'mutation' ? ['create', 'update', 'no-op'] : ['delete', 'no-op'];
  require(changes.every(
    (change) =>
      same(Object.keys(change).sort(), ['actions', 'address', 'type']) &&
      change.address === address &&
      change.type === 'azapi_resource_action' &&
      Array.isArray(change.actions) &&
      change.actions.length === 1 &&
      allowed.includes(String(change.actions[0])),
  ) &&
    row.noChanges === changes.every((change) => (change.actions as string[])[0] === 'no-op') &&
    (phase === 'final'
      ? changes.length === 0 && row.noChanges === true
      : changes.length === 1 ||
        (phase === 'release' &&
          changes.length === 0 &&
          row.noChanges === true)), 'saved plan effects differ from isolated control');
  return structuredClone(input) as PlanReceipt;
}

export const azureTerraformNetworkPowerSelections = {
  [address]: ['type', 'resource_id', 'action', 'method', 'when', 'locks'],
};

/** Independently bind resolved nonsensitive prior/proposed fields before applying a saved power/release plan. */
export async function validateAzureTerraformNetworkPowerProjection(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  node: number,
  operation: Operation,
  input: unknown,
  phase: Phase,
  priorInput: unknown,
  proposedInput: unknown,
): Promise<void> {
  const receipt = await validateAzureTerraformNetworkPowerPlan(plan, inventory, node, operation, input, phase);
  const expected = action(plan, inventory, node, operation);
  const prior = object(priorInput),
    proposed = object(proposedInput);
  require(same(Object.keys(prior), [address]) &&
    same(Object.keys(proposed), [address]), 'complete exact state projection required');
  const effects = receipt.changes[0]?.actions[0];
  if (phase === 'final') {
    require(prior[address] === null && proposed[address] === null, 'final stage retains an isolated control');
  } else if (phase === 'mutation') {
    require(same(proposed[address], expected) &&
      (effects === 'create'
        ? prior[address] === null
        : same(prior[address], expected)), 'selected action prior/proposed fields differ');
  } else {
    require(proposed[address] === null &&
      (effects === 'delete'
        ? same(prior[address], expected)
        : prior[address] === null), 'release removes another control or retains state');
  }
}

/** Current cloud power evidence only; this does not establish CE health, SLI state or CE heartbeat freshness. */
export async function observeAzureTerraformNetworkPower(
  plan: AzureCePlan,
  before: AzureNetworkUpdateInventory,
  node: number,
  operation: Operation,
  appliedNics: string[],
  api: AzExecApi,
  signal?: AbortSignal,
) {
  action(plan, before, node, operation);
  const deadline = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
  const bounded: AzExecApi = {
    async exec(command, args) {
      deadline.throwIfAborted();
      let rejectAbort: ((reason: unknown) => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort?.(deadline.reason);
      deadline.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await Promise.race([api.exec(command, args, { signal: deadline }), aborted]);
        deadline.throwIfAborted();
        return result;
      } finally {
        deadline.removeEventListener('abort', onAbort);
      }
    },
  };
  const inventory = await captureAzureNetworkUpdateInventory(plan, bounded, deadline);
  verifyAzureNetworkUpdateProgress(plan, before, inventory, appliedNics);
  const selected = inventory.nodes[String(node)];
  const response = await bounded.exec('az', [
    'vm',
    'show',
    '--ids',
    selected.resourceId,
    '--subscription',
    plan.subscription.id,
    '--show-details',
    '--output',
    'json',
  ]);
  require(response.exitCode === 0, 'selected VM power observation unavailable');
  let vm: Record<string, unknown>;
  try {
    vm = object(JSON.parse(response.stdout));
  } catch {
    throw Error('Azure Terraform network power: malformed VM observation');
  }
  require(!['nextLink', 'error', 'errors'].some((key) => vm[key]), 'partial or failed selected VM observation');
  const tags = object(vm.tags);
  require(vm.id === selected.resourceId &&
    typeof vm.vmId === 'string' &&
    vm.vmId.toLowerCase() === selected.vmId.toLowerCase() &&
    vm.name === `${plan.deploymentName}-${node}` &&
    typeof vm.location === 'string' &&
    vm.location.toLowerCase() === plan.region.toLowerCase() &&
    vm.provisioningState === 'Succeeded' &&
    tags['xcsh-managed-by'] === 'azure-ce' &&
    tags['xcsh-execution-engine'] === 'terraform' &&
    tags['xcsh-deployment-id'] === plan.deploymentName &&
    tags['xcsh-plan-sha256'] === selected.ownerPlanSha256 &&
    object(vm.hardwareProfile).vmSize ===
      plan.vm.size, 'selected VM identity changed between inventory and power reads');
  const attachments = object(vm.networkProfile).networkInterfaces;
  require(Array.isArray(attachments) &&
    same(
      attachments.map((value) => object(value).id).sort(),
      Object.values(selected.nics)
        .map((nic) => nic.resourceId)
        .sort(),
    ), 'selected VM NIC attachment changed');
  require(['VM running', 'VM deallocated', 'VM stopped', 'VM starting', 'VM stopping', 'VM deallocating'].includes(
    String(vm.powerState),
  ), 'actual selected VM power state unavailable');
  const powerState = String(vm.powerState).slice(3);
  return {
    engine: 'terraform' as const,
    planSha256: plan.planSha256,
    node,
    operation,
    resourceId: selected.resourceId,
    vmId: selected.vmId,
    ownerPlanSha256: selected.ownerPlanSha256,
    powerState,
    converged: powerState === (operation === 'start' ? 'running' : 'deallocated'),
    inventory,
    observedAt: new Date().toISOString(),
  };
}
