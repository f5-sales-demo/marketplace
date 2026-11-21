import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
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
import {
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from './terraform-network-power';
import { buildAzureTerraformNetworkPinnedNicStage } from './terraform-network-routing';
import { readAzureTerraformNetworkRoutingHistory } from './terraform-network-routing-history';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export type AzureTerraformNetworkNodeHistoryPhase = 'deallocated' | 'nic-complete' | 'restarted' | 'routing-complete';
const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network stage history: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, names: string[]): Record<string, unknown> {
  const row = object(value);
  require(same(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}

/** Validate immutable stage packets after their runner journals have advanced, without replaying stages.
 * The driver separately qualifies original source and serial predecessor inputs, current identity and operational gates.
 * Returned inventory and collection timestamps are historical evidence, never current CE telemetry or heartbeat freshness.
 */
export async function readAzureTerraformNetworkNodeHistory(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  node: number,
  phase: AzureTerraformNetworkNodeHistoryPhase,
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  validateAzureNetworkUpdateInventory(plan, before);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount &&
    ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].includes(phase) &&
    same(store.owner, azureUpgradeBinding(plan).owner), 'exact owning node and phase required');
  await store.verify();
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node),
    prefix = `${plan.planId}-terraform-network-node-${node}`,
    priorNics = Array.from({ length: node - 1 }, (_, n) => plan.nics.map((nic) => `${n + 1}:${nic.index}`)).flat(),
    reachedNics = [...priorNics, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
  const packetSha256ByName: Record<string, string> = {};
  const read = async (name: string) => {
    signal?.throwIfAborted();
    const value = await store.read(name);
    const digest = canonicalSha256(value);
    require(packetSha256ByName[name] === undefined ||
      packetSha256ByName[name] === digest, 'packet changed during history read');
    packetSha256ByName[name] = digest;
    return value;
  };
  const cloud = (value: unknown, operation: 'deallocate' | 'start', applied: string[], nic = false) => {
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
      ...(nic ? ['appliedNics', 'baseline', 'nicConverged'] : []),
    ]);
    require(row.engine === 'terraform' &&
      row.planSha256 === plan.planSha256 &&
      row.node === node &&
      row.operation === operation &&
      row.resourceId === before.nodes[String(node)].resourceId &&
      row.vmId === before.nodes[String(node)].vmId &&
      row.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
      row.powerState === (operation === 'start' ? 'running' : 'deallocated') &&
      row.converged === true &&
      typeof row.observedAt === 'string' &&
      Number.isFinite(Date.parse(row.observedAt)), 'saved cloud completion identity differs');
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, applied);
    for (const [owner, vm] of Object.entries(before.nodes))
      for (const [index, identity] of Object.entries(vm.nics))
        if (!applied.includes(`${owner}:${index}`))
          require(inventory.nodes[owner].nics[index].privateIp ===
            identity.privateIp, 'unsubmitted historical private IP changed');
    if (nic) {
      const baseline = Object.entries(before.nodes[String(node)].nics).every(([index, identity]) => {
        const observed = inventory.nodes[String(node)].nics[index];
        return (
          observed.subnetId.toLowerCase() === identity.subnetId.toLowerCase() &&
          observed.privateIp === identity.privateIp
        );
      });
      require(same(row.appliedNics, reachedNics) &&
        row.nicConverged === true &&
        row.baseline === baseline, 'complete selected NIC boundary required');
    }
    return inventory;
  };
  const completed = async (name: string, receipt: PlanReceipt, expectedOutcomeName: string) => {
    const row = keys(await read(name), ['schemaVersion', 'receiptSha256', 'outcome']);
    require(row.schemaVersion === 1 &&
      row.receiptSha256 === canonicalSha256(receipt) &&
      same(row.outcome, await read(expectedOutcomeName)), 'saved completion differs from exact receipt/outcome');
    return row.outcome;
  };
  const power = async (operation: 'deallocate' | 'start', applied: string[]) => {
    const powerPrefix = `${prefix}-${operation}`;
    const mutation = await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-mutation-plan.json`),
      'mutation',
    );
    const projection = async (receipt: PlanReceipt, selected: 'mutation' | 'release') => {
      const row = keys(await read(`${powerPrefix}-${selected}-binding.json`), [
        'schemaVersion',
        'receiptSha256',
        'prior',
        'proposed',
      ]);
      require(row.schemaVersion === 1 &&
        row.receiptSha256 === canonicalSha256(receipt), 'power projection receipt differs');
      await validateAzureTerraformNetworkPowerProjection(
        plan,
        before,
        node,
        operation,
        receipt,
        selected,
        row.prior,
        row.proposed,
      );
    };
    await projection(mutation, 'mutation');
    cloud(
      await completed(`${powerPrefix}-mutation-complete.json`, mutation, `${powerPrefix}-mutation-outcome.json`),
      operation,
      applied,
    );
    const release = await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-release-plan.json`),
      'release',
    );
    await projection(release, 'release');
    const outcome = keys(
      await completed(`${powerPrefix}-release-complete.json`, release, `${powerPrefix}-release-outcome.json`),
      ['cloud', 'state'],
    );
    require(same(outcome.state, {
      'azapi_resource_action.ce_network': null,
    }), 'temporary control remains in completed release');
    const inventory = cloud(outcome.cloud, operation, applied);
    await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-final-plan.json`),
      'final',
    );
    return inventory;
  };
  let inventory = await power('deallocate', priorNics),
    configurationSha256 = hash(source);
  if (phase !== 'deallocated') {
    const prepared = keys(await read(`${prefix}-prepared.json`), [
      'schemaVersion',
      'planSha256',
      'inventorySha256',
      'appliedNics',
      'stage',
    ]);
    require(prepared.schemaVersion === 1 &&
      prepared.planSha256 === plan.planSha256 &&
      prepared.inventorySha256 === canonicalSha256(before) &&
      same(prepared.appliedNics, priorNics) &&
      same(prepared.stage, stage), 'original prepared source/inventory/stage differs');
    const receipt = (await read(`${prefix}-mutation-plan.json`)) as PlanReceipt;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    const binding = keys(await read(`${prefix}-nic-binding.json`), [
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
    cloud(
      await completed(`${prefix}-mutation-complete.json`, receipt, `${prefix}-mutation-outcome.json`),
      'deallocate',
      reachedNics,
      true,
    );
    const final = keys(await read(`${prefix}-final-plan.json`), [
      'schemaVersion',
      'receipt',
      'cloud',
      'prior',
      'proposed',
    ]);
    require(final.schemaVersion === 1, 'final NIC packet version differs');
    inventory = cloud(final.cloud, 'deallocate', reachedNics, true);
    const finalReceipt = final.receipt as PlanReceipt;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, finalReceipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require(finalReceipt.noChanges, 'historical final NIC plan changes resources');
    validateAzureTerraformNetworkNicProjection(
      plan,
      stage,
      inventory,
      finalReceipt,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      final.prior,
      final.proposed,
    );
    configurationSha256 = stage.configurationSha256;
  }
  if (phase === 'restarted' || phase === 'routing-complete') inventory = await power('start', reachedNics);
  if (phase === 'routing-complete') {
    const routing = await readAzureTerraformNetworkRoutingHistory(
      plan,
      source,
      before,
      inventory,
      node,
      { owner: store.owner, verify: () => store.verify(), read },
      signal,
    );
    inventory = routing.inventory;
    configurationSha256 = routing.configurationSha256;
    Object.assign(packetSha256ByName, routing.packetSha256ByName);
  }
  // A reader racing any publication or manual rewrite must reject instead of approving a mixed chain.
  for (const [name, digest] of Object.entries(packetSha256ByName)) {
    signal?.throwIfAborted();
    require(canonicalSha256(await store.read(name)) === digest, 'packet changed during history read');
  }
  signal?.throwIfAborted();
  await store.verify();
  return {
    status: 'node-stage-history-verified' as const,
    engine: 'terraform' as const,
    planSha256: plan.planSha256,
    node,
    phase,
    configurationSha256,
    inventory: structuredClone(inventory),
    packetSha256ByName,
  };
}
