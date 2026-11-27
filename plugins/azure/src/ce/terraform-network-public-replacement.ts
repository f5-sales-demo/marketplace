import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { type AzureCeToolContext, readAzureCePlanInventory, verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import { AzureNetworkOperationalAcceptanceUnavailable } from './network-operational-acceptance';
import { AzureReplacementReadingsAcceptanceUnavailable } from './network-replacement-readings-acceptance';
import { bindAzureTerraformNetworkReplacementExecutionJournal } from './terraform-network-replacement-execution-journal';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { bindAzureTerraformNetworkReplacementSource } from './terraform-network-replacement-source-binding';
import { createAzureTerraformPublicHistoryLoaders } from './terraform-public-history-loaders';
import { createAzureTerraformPublicOperationalVerifiers } from './terraform-public-operational-verifiers';
import { runAzureTerraformReplacement } from './terraform-replacement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Current owned replacement site unavailable');
  return value as Record<string, unknown>;
}

/** Public execution derives source/journal/observer authority from genuine owning artifacts.
 * Historical unknown facts cannot enroll a source; current unknown facts cannot interrupt a
 * node. The actual existing executor owns mutation/recovery and its fixed generation guards.
 */
export async function runAzureTerraformNetworkPublicReplacement(
  request: AzureCePlan,
  ctx: AzureCeToolContext,
  terraform: CeTerraformService,
  runtime: CeRuntime,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
  acceptIngress?: Parameters<typeof runAzureTerraformReplacement>[7],
) {
  signal?.throwIfAborted();
  verifyAzureCePlan(request);
  const plan = structuredClone(request),
    matches = canonicalSnapshot(request),
    binding = azureUpgradeBinding(plan),
    profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    siteReader = runtime.observeOwnedSite,
    configurationReader = runtime.ownedSiteConfiguration;
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !matches(request) ||
      !matches(plan) ||
      plan.engine !== 'terraform' ||
      runtime.engine !== 'terraform' ||
      !canonicalEqual(store.owner, binding.owner) ||
      runtime.observeOwnedSite !== siteReader ||
      runtime.ownedSiteConfiguration !== configurationReader
    )
      throw Error('Owning Terraform public replacement required');
  };
  seal();
  const inventory = await readAzureCePlanInventory(ctx.sessionManager, signal);
  seal();
  const originals = inventory.plans
    .map((row) => row.plan)
    .filter((source) => source.planSha256 === profile.originalPlanSha256);
  if (
    originals.length !== 1 ||
    originals[0].intent.operation !== 'deploy' ||
    !canonicalEqual(azureUpgradeBinding(originals[0]), binding)
  )
    throw Error('Original public replacement source unresolved');
  const loaders = await createAzureTerraformPublicHistoryLoaders(originals[0], ctx.sessionManager, store, signal);
  const retained = await loaders.loadSource(profile.retainedPlanSha256);
  if (
    !canonicalEqual(azureUpgradeBinding(retained), binding) ||
    (!retained.terraformNetworkProfile && !retained.terraformNetworkReplacementProfile)
  )
    throw Error('Immediate public replacement predecessor unresolved');
  const observeSite = async () => {
    seal();
    const current = await runtime.observeOwnedSite(binding, signal),
      metadata = object(current.metadata),
      system = object(current.system_metadata);
    seal();
    if (
      metadata?.name !== binding.siteName ||
      metadata.namespace !== 'system' ||
      typeof system?.uid !== 'string' ||
      !system.uid
    )
      throw Error('Current owned replacement site unavailable');
    return {
      siteUid: system.uid,
      siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, current)),
    };
  };
  const site = await observeSite(),
    verifiers = createAzureTerraformPublicOperationalVerifiers(
      originals[0],
      ctx.sessionManager,
      terraform,
      runtime,
      api,
      store,
      loaders,
      signal,
    );
  let prepared: Awaited<ReturnType<typeof bindAzureTerraformNetworkReplacementSource>>;
  try {
    prepared = await bindAzureTerraformNetworkReplacementSource(
      plan,
      terraform,
      store,
      api,
      process.env,
      loaders,
      site,
      verifiers.qualifyNetwork,
      signal,
      verifiers.qualifyReplacement,
    );
  } catch (error) {
    seal();
    if (
      !(error instanceof AzureNetworkOperationalAcceptanceUnavailable) &&
      !(error instanceof AzureReplacementReadingsAcceptanceUnavailable)
    )
      throw error;
    return {
      engine: 'terraform' as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      status: 'operational-acceptance-pending' as const,
      purpose: 'historical' as const,
      reason: 'authenticated-predecessor-operational-evidence-unqualified',
      evidence: structuredClone(error.evidence),
    };
  }
  seal();
  if (!canonicalEqual(await observeSite(), site))
    throw Error('Current replacement site changed before journal binding');
  const sourceBindingSha256 = canonicalSha256(prepared.binding),
    journal = await bindAzureTerraformNetworkReplacementExecutionJournal(
      plan,
      store,
      loaders,
      site,
      sourceBindingSha256,
      verifiers.qualifyNetwork,
      signal,
      verifiers.qualifyReplacement,
    ),
    acquisition = await verifiers.replacement(plan.planSha256, prepared.session, signal);
  seal();
  if (!canonicalEqual(await observeSite(), site))
    throw Error('Current replacement site changed before owning execution');
  const result = await runAzureTerraformReplacement(
    plan,
    terraform,
    runtime,
    store,
    api,
    process.env,
    signal,
    acceptIngress,
    undefined,
    {
      loaders,
      site,
      journalSha256: journal.journalSha256,
      sourceBindingSha256,
      qualifyHistorical: verifiers.qualifyNetwork,
      collectOperational: acquisition.collectOperational,
      qualifyOperational: acquisition.qualifyOperational,
      qualifyCompletedOperational: verifiers.qualifyReplacement,
    },
  );
  seal();
  return result;
}
