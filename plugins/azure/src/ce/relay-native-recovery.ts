import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { validateAzureNativePendingAction } from './native-action-recovery';
import { fingerprintCheckpointObservation, normalizeAzureDeploymentCapacity } from './recovery';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { inspectAzureRelayNativeResources } from './relay-native-execution';
import type { AzureCeCheckpoint, AzureCeObservation, AzureCePlan } from './types';

/** Permit only newly discovered resources proven by a submitted/completed exact owned relay journal. */
export async function reconcileAzureNativeRelayProvision(
  source: AzureCePlan,
  checkpoint: AzureCeCheckpoint,
  current: AzureCeObservation,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read'>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  validateAzureNativePendingAction(source, checkpoint.completedActionIds, checkpoint.pendingAction);
  const action = source.actions[checkpoint.completedActionIds.length];
  if (
    action?.kind !== 'relay-provision' ||
    !checkpoint.observationSnapshot ||
    checkpoint.engine !== 'native' ||
    source.engine !== 'native' ||
    checkpoint.planSha256 !== source.planSha256 ||
    checkpoint.planId !== source.planId ||
    checkpoint.state === 'complete' ||
    checkpoint.authorization?.apply !== true ||
    checkpoint.observationFingerprint !== fingerprintCheckpointObservation(checkpoint.observationSnapshot)
  )
    throw Error('Azure relay recovery requires the exact authorized partial native checkpoint');
  const previous = checkpoint.observationSnapshot;
  for (const observation of [previous, current]) {
    const ids = observation.resources.map((resource) => resource.id.toLowerCase());
    if (new Set(ids).size !== ids.length) throw Error('Azure relay recovery discovery contains duplicate resource IDs');
  }
  const relay = azureRelayPlanForDeployment(source);
  const inspected = await inspectAzureRelayNativeResources(source, relay, storage, api, signal);
  const authorized = new Map(inspected.resources.map((resource) => [String(resource.id).toLowerCase(), resource]));
  const newlyObserved = new Set<string>();
  for (const resource of current.resources) {
    const id = resource.id.toLowerCase();
    const prior = previous.resources.find((item) => item.id.toLowerCase() === id);
    if (prior?.exists || !resource.exists) continue;
    const raw = authorized.get(id);
    if (!raw) continue;
    const properties = raw.properties as Record<string, unknown>;
    const tags = (raw.tags ?? {}) as Record<string, string>;
    if (
      resource.location !== raw.location ||
      canonicalSha256(resource.tags) !== canonicalSha256(tags) ||
      resource.owned !==
        (tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === source.deploymentName) ||
      canonicalSha256(resource.state) !== canonicalSha256({ provisioningState: properties.provisioningState }) ||
      (resource.etag !== undefined && resource.etag !== raw.etag)
    )
      throw Error('Azure relay recovery discovery differs from current exact cloud readback');
    newlyObserved.add(id);
  }
  const stable = (observation: AzureCeObservation) => {
    const normalized = normalizeAzureDeploymentCapacity(source, observation);
    normalized.resources = normalized.resources.filter((resource) => !newlyObserved.has(resource.id.toLowerCase()));
    return fingerprintCheckpointObservation(normalized);
  };
  if (stable(previous) !== stable(current))
    throw Error('Stale Azure CE checkpoint: observations changed outside the submitted relay recovery boundary');
  signal?.throwIfAborted();
  return {
    ...checkpoint,
    completedActionIds: inspected.complete
      ? [...checkpoint.completedActionIds, action.id]
      : checkpoint.completedActionIds,
    pendingAction: inspected.complete ? undefined : checkpoint.pendingAction,
    failedActionId:
      inspected.complete && checkpoint.failedActionId === action.id ? undefined : checkpoint.failedActionId,
    observationFingerprint: fingerprintCheckpointObservation(current),
    observationSnapshot: structuredClone(current),
    state: inspected.complete
      ? checkpoint.completedActionIds.length + 1 === source.actions.length
        ? ('complete' as const)
        : ('running' as const)
      : checkpoint.state,
  } satisfies AzureCeCheckpoint;
}
