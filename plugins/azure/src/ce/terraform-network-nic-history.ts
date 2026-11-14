import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import { validateAzureNetworkUpdateTerraformReceipt } from './network-update-terraform';
import {
  AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
  validateAzureTerraformNetworkNicProjection,
} from './terraform-network-nic-projection';
import { buildAzureTerraformNetworkPinnedNicStage } from './terraform-network-routing';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network NIC history: ${message}`);
}
function keys(value: unknown, expected: string[]): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), expected.toSorted()), 'saved schema differs');
  return row;
}

/** Private read-only interrupted NIC packet prefix. Original source, serial authorization,
 * power prerequisites and actual runner journals are separate caller contracts. A durable outcome
 * does not establish submitted application; collection timestamps never qualify CE freshness.
 */
export async function readAzureTerraformNetworkNicHistory(
  request: AzureCePlan,
  sourceRequest: string,
  original: AzureNetworkUpdateInventory,
  node: number,
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(request),
    before = structuredClone(original),
    source = sourceRequest,
    owner = structuredClone(store.owner),
    read = store.read,
    verify = store.verify;
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, before);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    same(owner, azureUpgradeBinding(plan).owner), 'exact owning serial NIC boundary required');
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node),
    previous = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
    reached = [...previous, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require(same(request, plan) &&
      same(original, before) &&
      same(store.owner, owner) &&
      store.read === read &&
      store.verify === verify, 'request or storage changed during NIC history read');
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const prefix = `${plan.planId}-terraform-network-node-${node}`;
  const suffixes = [
    'prepared',
    'mutation-plan',
    'nic-binding',
    'mutation-outcome',
    'mutation-complete',
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
    require(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later NIC packet');
  if (records.has('prepared')) {
    const prepared = keys(records.get('prepared'), [
      'schemaVersion',
      'planSha256',
      'inventorySha256',
      'appliedNics',
      'stage',
    ]);
    require(prepared.schemaVersion === 1 &&
      prepared.planSha256 === plan.planSha256 &&
      prepared.inventorySha256 === canonicalSha256(before) &&
      same(prepared.appliedNics, previous) &&
      same(prepared.stage, stage), 'prepared source or serial NIC boundary differs');
  }
  const receipts: Partial<Record<'mutation' | 'final' | 'current', PlanReceipt>> = {};
  if (records.has('mutation-plan')) {
    const receipt = records.get('mutation-plan') as PlanReceipt;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    receipts.mutation = structuredClone(receipt);
    if (records.has('nic-binding')) {
      const binding = keys(records.get('nic-binding'), [
        'schemaVersion',
        'planSha256',
        'stageSha256',
        'inventorySha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
      require(binding.schemaVersion === 1 &&
        binding.planSha256 === plan.planSha256 &&
        binding.stageSha256 === canonicalSha256(stage) &&
        binding.inventorySha256 === canonicalSha256(before) &&
        binding.receiptSha256 === canonicalSha256(receipt) &&
        binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'NIC projection binding differs');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        before,
        receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        binding.prior,
        binding.proposed,
      );
    }
  }
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
      'appliedNics',
      'baseline',
      'nicConverged',
    ]);
    const vm = before.nodes[String(node)];
    require(row.engine === 'terraform' &&
      row.planSha256 === plan.planSha256 &&
      row.node === node &&
      row.operation === 'deallocate' &&
      row.resourceId === vm.resourceId &&
      row.vmId === vm.vmId &&
      row.ownerPlanSha256 === vm.ownerPlanSha256 &&
      row.powerState === 'deallocated' &&
      row.converged === true &&
      row.nicConverged === true &&
      same(row.appliedNics, reached) &&
      typeof row.observedAt === 'string' &&
      Number.isFinite(Date.parse(row.observedAt)), 'saved NIC cloud identity or completion differs');
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, reached);
    for (const [ownerNode, instance] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(instance.nics))
        if (!reached.includes(`${ownerNode}:${index}`))
          require(inventory.nodes[ownerNode].nics[index].privateIp ===
            nic.privateIp, 'unsubmitted historical NIC address differs');
    const baseline = Object.entries(vm.nics).every(([index, nic]) => {
      const observed = inventory.nodes[String(node)].nics[index];
      return observed.subnetId.toLowerCase() === nic.subnetId.toLowerCase() && observed.privateIp === nic.privateIp;
    });
    require(row.baseline === baseline, 'saved NIC baseline differs');
    return inventory;
  };
  if (records.has('mutation-outcome')) cloud(records.get('mutation-outcome'));
  if (records.has('mutation-complete')) {
    const complete = keys(records.get('mutation-complete'), ['schemaVersion', 'receiptSha256', 'outcome']);
    require(complete.schemaVersion === 1 &&
      complete.receiptSha256 === canonicalSha256(receipts.mutation) &&
      same(complete.outcome, records.get('mutation-outcome')), 'completion differs from exact receipt/outcome');
  }
  for (const [suffix, phase] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ] as const)
    if (records.has(suffix)) {
      const packet = keys(records.get(suffix), ['schemaVersion', 'receipt', 'cloud', 'prior', 'proposed']);
      require(packet.schemaVersion === 1, 'final NIC packet version differs');
      const inventory = cloud(packet.cloud),
        receipt = packet.receipt as PlanReceipt;
      validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
      require(receipt.noChanges, 'historical final NIC plan changes resources');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        inventory,
        receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        packet.prior,
        packet.proposed,
      );
      receipts[phase] = structuredClone(receipt);
    }
  await bounded(() => verify.call(store));
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      require(records.has(suffix) && canonicalSha256(value) === packetSha256ByName[name], 'packet changed or appeared');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      require(!records.has(suffix), 'packet disappeared');
    }
  }
  return {
    schemaVersion: 1 as const,
    scope: 'network-nic-packet-history' as const,
    planSha256: plan.planSha256,
    sourceConfigurationSha256: stage.previousConfigurationSha256,
    node,
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}
