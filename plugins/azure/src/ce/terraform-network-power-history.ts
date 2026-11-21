import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import {
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from './terraform-network-power';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power history: ${message}`);
}
function keys(value: unknown, expected: string[]): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), expected.toSorted()), 'saved schema differs');
  return row;
}

/** Read only the exact power packet prefix. The caller separately authenticates original source,
 * serial authorization and runner journals before retirement. A missing completion is retained as
 * interruption, never application success. Historical collection times are not CE heartbeats.
 */
export async function readAzureTerraformNetworkPowerHistory(
  request: AzureCePlan,
  original: AzureNetworkUpdateInventory,
  node: number,
  operation: 'deallocate' | 'start',
  appliedNicsRequest: string[],
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    before = structuredClone(original),
    appliedNics = [...appliedNicsRequest],
    owner = structuredClone(store.owner),
    read = store.read,
    verify = store.verify;
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, before);
  const expected = Array.from({ length: operation === 'start' ? node : node - 1 }, (_, i) =>
    plan.nics.map((nic) => `${i + 1}:${nic.index}`),
  ).flat();
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    ['deallocate', 'start'].includes(operation) &&
    same(owner, azureUpgradeBinding(plan).owner) &&
    same(appliedNics, expected), 'exact owning serial power boundary required');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require(same(request, plan) &&
      same(original, before) &&
      same(appliedNicsRequest, appliedNics) &&
      same(store.owner, owner) &&
      store.read === read &&
      store.verify === verify, 'request or storage changed during history read');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const prefix = `${plan.planId}-terraform-network-node-${node}-${operation}`;
  const suffixes = [
    'mutation-plan',
    'mutation-binding',
    'mutation-outcome',
    'mutation-complete',
    'release-plan',
    'release-binding',
    'release-outcome',
    'release-complete',
    'final-plan',
    'current-no-change-plan',
  ];
  const records = new Map<string, unknown>(),
    packetSha256ByName: Record<string, string> = {};
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      records.set(suffix, structuredClone(value));
      packetSha256ByName[name] = canonicalSha256(value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  for (let i = 1; i < suffixes.length; i++)
    require(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later packet');
  const cloud = (value: unknown) => {
    const row = keys(value, [
      'engine',
      'planSha256',
      'node',
      'operation',
      'resourceId',
      'vmId',
      'ownerPlanSha256',
      'powerState',
      'converged',
      'inventory',
      'observedAt',
    ]);
    const vm = before.nodes[String(node)];
    require(row.engine === 'terraform' &&
      row.planSha256 === plan.planSha256 &&
      row.node === node &&
      row.operation === operation &&
      row.resourceId === vm.resourceId &&
      row.vmId === vm.vmId &&
      row.ownerPlanSha256 === vm.ownerPlanSha256 &&
      row.converged === true &&
      row.powerState === (operation === 'start' ? 'running' : 'deallocated') &&
      typeof row.observedAt === 'string' &&
      Number.isFinite(Date.parse(row.observedAt)), 'historical cloud identity or outcome differs');
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, appliedNics);
    for (const [key, instance] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(instance.nics))
        if (!appliedNics.includes(`${key}:${index}`))
          require(inventory.nodes[key].nics[index].privateIp ===
            nic.privateIp, 'unsubmitted historical NIC address differs');
  };
  const receipts: Partial<Record<'mutation' | 'release' | 'final' | 'current', PlanReceipt>> = {};
  for (const phase of ['mutation', 'release'] as const) {
    if (!records.has(`${phase}-plan`)) continue;
    const receipt = await bounded(() =>
      validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, records.get(`${phase}-plan`), phase),
    );
    receipts[phase] = receipt;
    if (records.has(`${phase}-binding`)) {
      const binding = keys(records.get(`${phase}-binding`), ['schemaVersion', 'receiptSha256', 'prior', 'proposed']);
      require(binding.schemaVersion === 1 &&
        binding.receiptSha256 === canonicalSha256(receipt), 'projection receipt differs');
      await bounded(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          receipt,
          phase,
          binding.prior,
          binding.proposed,
        ),
      );
    }
    if (records.has(`${phase}-outcome`)) {
      const outcome = records.get(`${phase}-outcome`);
      if (phase === 'mutation') cloud(outcome);
      else {
        const released = keys(outcome, ['cloud', 'state']);
        require(same(released.state, { 'azapi_resource_action.ce_network': null }), 'released control remains');
        cloud(released.cloud);
      }
    }
    if (records.has(`${phase}-complete`)) {
      const complete = keys(records.get(`${phase}-complete`), ['schemaVersion', 'receiptSha256', 'outcome']);
      require(complete.schemaVersion === 1 &&
        complete.receiptSha256 === canonicalSha256(receipt) &&
        same(complete.outcome, records.get(`${phase}-outcome`)), 'completion differs from exact receipt/outcome');
    }
  }
  for (const [suffix, key] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ] as const)
    if (records.has(suffix))
      receipts[key] = await bounded(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, records.get(suffix), 'final'),
      );
  // Recheck missing records as well as present bytes: lost publication or manual edits cannot mix prefixes.
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      require(records.has(suffix) &&
        canonicalSha256(value) === packetSha256ByName[name], 'packet changed or appeared during history read');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      require(!records.has(suffix), 'packet disappeared during history read');
    }
  }
  await bounded(() => verify.call(store));
  return {
    schemaVersion: 1 as const,
    scope: 'network-power-packet-history' as const,
    planSha256: plan.planSha256,
    node,
    operation,
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}
