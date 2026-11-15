import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import {
  validateAzureTerraformNetworkRoutingPrepared,
  validateAzureTerraformNetworkRoutingProjection,
  validateAzureTerraformNetworkRoutingReceipt,
} from './terraform-network-routing';
import { validateAzureTerraformNetworkRoutingObservation } from './terraform-network-routing-observation-validation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network routing history: ${message}`);
}
function keys(value: unknown, names: string[]) {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}
/** Read the immutable routing chain without calling Terraform or Azure. The owning serial reader
 * must independently authenticate source, NIC/restart predecessors and operational acceptance.
 * Historical configuration observations never establish current forwarding or CE freshness.
 */
export async function readAzureTerraformNetworkRoutingHistory(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  node: number,
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  signal?: AbortSignal,
) {
  const data = structuredClone({ plan, before, current, node }),
    inputSha256 = canonicalSha256(data),
    original = { read: store.read, verify: store.verify },
    ownerSha256 = canonicalSha256(store.owner);
  require(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const deadline = AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(canonicalSha256({ plan, before, current, node }) === inputSha256 &&
      canonicalSha256(data) === inputSha256 &&
      canonicalSha256(store.owner) === ownerSha256 &&
      store.read === original.read &&
      store.verify === original.verify, 'input or owning reader changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`,
    packetSha256ByName: Record<string, string> = {};
  const read = async (name: string) => {
    const value = structuredClone(await step(() => original.read.call(store, name))),
      digest = canonicalSha256(value);
    require(packetSha256ByName[name] === undefined ||
      packetSha256ByName[name] === digest, 'packet changed during history read');
    packetSha256ByName[name] = digest;
    return value;
  };
  await step(() => original.verify.call(store));
  const prepared = await read(`${prefix}-prepared.json`);
  const { current: retainedCurrent, stage } = validateAzureTerraformNetworkRoutingPrepared(
    data.plan,
    source,
    data.before,
    data.current,
    node,
    prepared,
  );
  const observation = (value: unknown) =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, retainedCurrent, node, value);
  const receipt = (value: unknown, phase: 'mutation' | 'release') => {
    validateAzureTerraformNetworkRoutingReceipt(
      data.plan,
      source,
      data.before,
      retainedCurrent,
      stage,
      value as PlanReceipt,
      phase,
    );
    return value as PlanReceipt;
  };
  for (const phase of ['mutation', 'release'] as const) {
    const saved = receipt(await read(`${prefix}-${phase}-plan.json`), phase),
      binding = keys(await read(`${prefix}-${phase}-binding.json`), [
        'schemaVersion',
        'kind',
        'phase',
        'planSha256',
        'stageSha256',
        'beforeSha256',
        'currentSha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
    require(same(
      { ...binding, prior: undefined, proposed: undefined },
      {
        schemaVersion: 1,
        kind: 'dependent-routing',
        phase,
        planSha256: data.plan.planSha256,
        stageSha256: canonicalSha256(stage),
        beforeSha256: canonicalSha256(data.before),
        currentSha256: canonicalSha256(retainedCurrent),
        receiptSha256: canonicalSha256(saved),
        providerLockSha256: saved.providerLockSha256,
        prior: undefined,
        proposed: undefined,
      },
    ), 'saved binding identity differs');
    validateAzureTerraformNetworkRoutingProjection(
      data.plan,
      source,
      data.before,
      retainedCurrent,
      stage,
      saved,
      phase,
      binding.prior,
      binding.proposed,
    );
    const outcome = await read(`${prefix}-${phase}-outcome.json`),
      complete = keys(await read(`${prefix}-${phase}-complete.json`), ['schemaVersion', 'receiptSha256', 'outcome']);
    require(complete.schemaVersion === 1 &&
      complete.receiptSha256 === canonicalSha256(saved) &&
      same(complete.outcome, outcome), 'saved completion receipt and immutable outcome differ');
    observation(outcome);
  }
  const terminal = keys(await read(`${prefix}-final-plan.json`), [
    'schemaVersion',
    'receipt',
    'prior',
    'proposed',
    'cloud',
  ]);
  require(terminal.schemaVersion === 1, 'saved final schema differs');
  const final = receipt(terminal.receipt, 'release');
  require(final.noChanges, 'final refresh changes retained resources');
  validateAzureTerraformNetworkRoutingProjection(
    data.plan,
    source,
    data.before,
    retainedCurrent,
    stage,
    final,
    'release',
    terminal.prior,
    terminal.proposed,
  );
  const cloud = observation(terminal.cloud);
  for (const [name, digest] of Object.entries(packetSha256ByName))
    require(canonicalSha256(await step(() => original.read.call(store, name))) ===
      digest, 'packet changed during history read');
  await step(() => original.verify.call(store));
  seal();
  return {
    status: 'routing-stage-history-verified' as const,
    engine: 'terraform' as const,
    planSha256: data.plan.planSha256,
    node,
    configurationSha256: stage.releasedConfigurationSha256,
    inventory: structuredClone(cloud.power.inventory),
    packetSha256ByName,
    forwarding: 'unknown' as const,
    bgpExchange: 'unknown' as const,
    freshness: 'unqualified' as const,
  };
}
