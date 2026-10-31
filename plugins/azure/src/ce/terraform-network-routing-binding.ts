import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import {
  type AzureTerraformNetworkRoutingStage,
  azureTerraformNetworkRoutingSelections,
  validateAzureTerraformNetworkRoutingProjection,
  validateAzureTerraformNetworkRoutingReceipt,
} from './terraform-network-routing';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network routing binding: ${message}`);
}
/** Persist actual private owning-runner projections before submission, or authenticate the immutable
 * existing binding after a journal has advanced. This never applies a plan and does not authenticate
 * current cloud/forwarding or full historical source provenance; those remain owning driver gates.
 */
export async function bindAzureTerraformNetworkRoutingPlan(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  stage: AzureTerraformNetworkRoutingStage,
  receipt: PlanReceipt,
  phase: 'mutation' | 'release',
  session: TerraformSession,
  store: CeDeploymentStore,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const data = structuredClone({ plan, before, current, stage, receipt, env });
  const inputSha256 = canonicalSha256(data);
  const selections = azureTerraformNetworkRoutingSelections(data.stage);
  const selectionsSha256 = canonicalSha256(selections);
  require(session.readPlannedResourcePaths &&
    session.readProposedResourcePaths, 'owning private paths capability required');
  const original = {
    state: session.readPlanApplicationState,
    prior: session.readPlannedResourcePaths,
    proposed: session.readProposedResourcePaths,
    read: store.read,
    write: store.write,
    verify: store.verify,
  };
  const directory = store.directory,
    ownerSha256 = canonicalSha256(store.owner);
  require(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const bounded = AbortSignal.any([AbortSignal.timeout(180_000), ...(signal ? [signal] : [])]);
  const seal = () => {
    bounded.throwIfAborted();
    require(canonicalSha256({ plan, before, current, stage, receipt, env }) === inputSha256 &&
      canonicalSha256(data) === inputSha256 &&
      canonicalSha256(selections) === selectionsSha256 &&
      canonicalSha256(store.owner) === ownerSha256 &&
      store.directory === directory &&
      session.readPlanApplicationState === original.state &&
      session.readPlannedResourcePaths === original.prior &&
      session.readProposedResourcePaths === original.proposed &&
      store.read === original.read &&
      store.write === original.write &&
      store.verify === original.verify, 'input, storage or owning runner changed during binding');
  };
  const step = async <T>(action: () => Promise<T>): Promise<T> => {
    seal();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(bounded.reason);
      bounded.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const value = await Promise.race([action(), aborted]);
      seal();
      return value;
    } finally {
      bounded.removeEventListener('abort', onAbort);
    }
  };
  validateAzureTerraformNetworkRoutingReceipt(
    data.plan,
    source,
    data.before,
    data.current,
    data.stage,
    data.receipt,
    phase,
  );
  seal();
  await step(() => original.verify.call(store));
  const unlock = await acquireProcessLock(`${directory}/.terraform-network-routing-binding-lock`);
  try {
    seal();
    await step(() => original.verify.call(store));
    const name = `${data.plan.planId}-terraform-network-node-${data.stage.node}-routing-${phase}-binding.json`;
    const identity = {
      schemaVersion: 1,
      kind: 'dependent-routing',
      phase,
      planSha256: data.plan.planSha256,
      stageSha256: canonicalSha256(data.stage),
      beforeSha256: canonicalSha256(data.before),
      currentSha256: canonicalSha256(data.current),
      receiptSha256: canonicalSha256(data.receipt),
      providerLockSha256: data.receipt.providerLockSha256,
    };
    const validate = (input: unknown) => {
      require(input && typeof input === 'object' && !Array.isArray(input), 'complete binding required');
      const value = input as Record<string, unknown>;
      require(canonicalSha256(Object.keys(value).sort()) ===
        canonicalSha256([...Object.keys(identity), 'prior', 'proposed'].sort()), 'saved binding schema differs');
      for (const [key, expected] of Object.entries(identity))
        require(value[key] === expected, 'saved binding identity differs');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        data.current,
        data.stage,
        data.receipt,
        phase,
        value.prior,
        value.proposed,
      );
      return value;
    };
    let saved: unknown;
    try {
      saved = await step(() => original.read.call(store, name));
    } catch (error) {
      seal();
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (saved !== undefined) {
      const value = validate(saved);
      seal();
      return value;
    }
    require((await step(() => original.state.call(session, data.receipt))) ===
      'planned', 'unsubmitted saved plan required for new binding');
    const prior = await step(() => original.prior.call(session, data.receipt, selections, data.env, bounded));
    const proposed = await step(() => original.proposed.call(session, data.receipt, selections, data.env, bounded));
    require((await step(() => original.state.call(session, data.receipt))) ===
      'planned', 'plan submitted during projection');
    const binding = validate({ ...identity, prior, proposed });
    await step(() => original.write.call(store, name, binding));
    seal();
    return binding;
  } finally {
    await unlock();
  }
}
