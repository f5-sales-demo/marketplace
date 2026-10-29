import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from './canonical';
import {
  type AzureTerraformNetworkReplacementCompletion,
  type AzureTerraformNetworkReplacementCompletionDependencies,
  azureTerraformNetworkReplacementCompletionName,
  openAzureTerraformNetworkReplacementCompletionArtifacts,
  validateAzureTerraformNetworkReplacementCompletion,
} from './terraform-network-replacement-completion';
import type { AzureCePlan } from './types';

/** Explicit historical schema breaks recursive inferred types between generation,
 * joint binding readers and completion contexts; runtime evidence is unchanged. */
export interface AzureTerraformNetworkReplacementCompletionHistory {
  schemaVersion: 1;
  kind: 'azure-terraform-network-replacement-completion-history';
  engine: 'terraform';
  owner: CeDeploymentStore['owner'];
  sourcePlanSha256: string;
  originalPlanSha256: string;
  retainedPlanSha256: string;
  sourceBindingSha256: string;
  journalSha256: string;
  completionSha256: string;
  checkpointSha256: string;
  finalConfigurationSha256: string;
  providerLockSha256: string;
  site: { siteUid: string; siteConfigurationSha256: string };
  nodes: AzureTerraformNetworkReplacementCompletion['operational']['identity']['nodes'];
  finalSource: string;
  currentOperationalAcceptanceQualified: false;
}

/** Original immutable replacement provenance only. No Terraform/cloud session, fresh enrollment,
 * current health, publisher freshness or mutation is requested. Final source contains private
 * bootstrap and must stay in the owning historical coordinator, never a public tool result. */
export async function readAzureTerraformNetworkReplacementCompletionHistory(
  request: AzureCePlan,
  store: CeDeploymentStore,
  dependencies: AzureTerraformNetworkReplacementCompletionDependencies,
  expectedCompletionSha256: string,
  signal?: AbortSignal,
): Promise<AzureTerraformNetworkReplacementCompletionHistory> {
  if (!/^[a-f0-9]{64}$/.test(expectedCompletionSha256))
    throw Error('Resolved immutable replacement completion digest required');
  const c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal);
  if (c.checkpoint.phase !== 'complete') throw Error('Replacement predecessor has no completed owning checkpoint');
  const raw = await c.read(azureTerraformNetworkReplacementCompletionName(c.plan));
  if (canonicalSha256(raw) !== expectedCompletionSha256)
    throw Error('Immutable replacement completion differs from expected digest');
  const packet = validateAzureTerraformNetworkReplacementCompletion(c, raw);
  await c.qualify(packet.operational, 'historical');
  await c.finish();
  if (
    canonicalSha256(await c.read(azureTerraformNetworkReplacementCompletionName(c.plan))) !== expectedCompletionSha256
  )
    throw Error('Immutable replacement completion changed at final boundary');
  c.unchanged();
  c.deadline.throwIfAborted();
  return {
    schemaVersion: 1 as const,
    kind: 'azure-terraform-network-replacement-completion-history' as const,
    engine: 'terraform' as const,
    owner: structuredClone(c.owner),
    sourcePlanSha256: c.plan.planSha256,
    originalPlanSha256: packet.originalPlanSha256,
    retainedPlanSha256: packet.retainedPlanSha256,
    sourceBindingSha256: c.sourceBindingSha256,
    journalSha256: c.journalSha256,
    completionSha256: expectedCompletionSha256,
    checkpointSha256: packet.checkpointSha256,
    finalConfigurationSha256: packet.finalConfigurationSha256,
    providerLockSha256: packet.providerLockSha256,
    site: structuredClone(c.site),
    nodes: structuredClone(packet.operational.identity.nodes),
    finalSource: c.material.stages.launch.configuration,
    currentOperationalAcceptanceQualified: false as const,
  };
}
