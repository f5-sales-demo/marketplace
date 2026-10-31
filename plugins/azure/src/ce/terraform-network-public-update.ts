import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { type AzureCeToolContext, readAzureCePlanInventory, verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { createAzureNetworkOperationalAcceptance } from './network-operational-acceptance';
import { createAzureOperationalAcquisitionSession } from './network-operational-session';
import { runAzureTerraformNetworkUpdate } from './terraform-network-driver';
import { createAzureTerraformPublicHistoryLoaders } from './terraform-public-history-loaders';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function siteObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Current owned network site identity is unavailable');
  return value as Record<string, unknown>;
}

/** Public apply derives the current site and original history from owning service/session reads.
 * Callers supply only the saved plan identity. Unknown operational evidence remains pending
 * in the serial driver, before interruption, rather than falling through to initial admission.
 */
export async function runAzureTerraformNetworkPublicUpdate(
  plan: AzureCePlan,
  ctx: AzureCeToolContext,
  terraform: CeTerraformService,
  runtime: CeRuntime,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const binding = azureUpgradeBinding(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'update-network' ||
    !canonicalEqual(store.owner, binding.owner) ||
    runtime.engine !== 'terraform'
  )
    throw Error('Owning Terraform network update required');
  const inventory = await readAzureCePlanInventory(ctx.sessionManager, signal);
  const originals = inventory.plans
    .map((row) => row.plan)
    .filter(
      (source) =>
        source.engine === 'terraform' &&
        source.intent.operation === 'deploy' &&
        canonicalEqual(azureUpgradeBinding(source), binding),
    );
  if (originals.length !== 1) throw Error('Original public network deployment is missing or ambiguous');
  const loaders = await createAzureTerraformPublicHistoryLoaders(originals[0], ctx.sessionManager, store, signal);
  const current = await runtime.observeOwnedSite(binding, signal);
  const metadata = siteObject(current.metadata),
    system = siteObject(current.system_metadata);
  if (
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    typeof system.uid !== 'string' ||
    !system.uid
  )
    throw Error('Current owned network site identity is unavailable');
  const site = {
    siteUid: system.uid,
    siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, current)),
  };
  const acquisition = await createAzureOperationalAcquisitionSession(
    plan,
    runtime,
    api,
    store,
    ctx.sessionManager,
    undefined,
    signal,
  );
  const acceptance = createAzureNetworkOperationalAcceptance(acquisition);
  return runAzureTerraformNetworkUpdate(plan, terraform, store, api, process.env, loaders, site, acceptance, signal);
}
