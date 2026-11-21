import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import {
  type AzureNetworkUpdateTerraformStage,
  validateAzureNetworkUpdateTerraformReceipt,
} from './network-update-terraform';
import {
  AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
  azureTerraformNetworkNicSelections,
  validateAzureTerraformNetworkNicProjection,
} from './terraform-network-nic-projection';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network NIC binding: ${message}`);
}

/** Persist private owning-runner evidence while its exact saved plan is still unsubmitted.
 * An existing binding may be validated after apply without re-reading a consumed journal.
 * The owning executor separately validates application state, cloud identity and recovery.
 */
export async function bindAzureTerraformNetworkNicPlan(
  plan: AzureCePlan,
  stage: AzureNetworkUpdateTerraformStage,
  inventory: AzureNetworkUpdateInventory,
  receipt: PlanReceipt,
  providerLockSha256: string,
  session: TerraformSession,
  store: CeDeploymentStore,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  require(canonicalSha256(store.owner) === canonicalSha256(azureUpgradeBinding(plan).owner), 'storage owner differs');
  require(session.readPlannedResourcePaths &&
    session.readProposedResourcePaths, 'owning private paths capability required');
  validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, providerLockSha256);
  require(providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'unqualified provider lock');
  const selections = azureTerraformNetworkNicSelections(plan, stage, inventory);
  signal?.throwIfAborted();
  await store.verify();
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-nic-binding-lock`);
  try {
    signal?.throwIfAborted();
    await store.verify();
    const name = `${plan.planId}-terraform-network-node-${stage.node}-nic-binding.json`;
    const identity = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      stageSha256: canonicalSha256(stage),
      inventorySha256: canonicalSha256(inventory),
      receiptSha256: canonicalSha256(receipt),
      providerLockSha256,
    };
    const validate = (input: unknown) => {
      const value = input as Record<string, unknown>;
      require(value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        canonicalSha256(Object.keys(value).sort()) ===
          canonicalSha256([...Object.keys(identity), 'prior', 'proposed'].sort()), 'saved binding schema differs');
      for (const [key, expected] of Object.entries(identity))
        require(value[key] === expected, 'saved binding identity differs');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        inventory,
        receipt,
        providerLockSha256,
        value.prior,
        value.proposed,
      );
      return value;
    };
    let saved: unknown;
    try {
      saved = await store.read(name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (saved !== undefined) return validate(saved);
    require((await session.readPlanApplicationState(receipt)) ===
      'planned', 'unsubmitted saved plan required for new binding');
    const prior = await session.readPlannedResourcePaths(receipt, selections.prior, env, signal);
    const proposed = await session.readProposedResourcePaths(receipt, selections.proposed, env, signal);
    signal?.throwIfAborted();
    require((await session.readPlanApplicationState(receipt)) === 'planned', 'plan submitted during projection');
    const binding = validate({ ...identity, prior, proposed });
    await store.write(name, binding);
    return binding;
  } finally {
    await unlock();
  }
}
