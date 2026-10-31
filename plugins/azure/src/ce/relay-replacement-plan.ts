import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { compileAzureCePlan } from './planner';
import type { AzureRelayDeploymentProfile } from './relay-deployment-plan';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import { type AzureRouteServerOwnership, captureAzureRouteServerOwnership } from './route-server-health';
import type { AzureCeObservation, AzureCePlan } from './types';

export interface AzureRelayReplacementProfile extends Omit<AzureRelayDeploymentProfile, 'schemaVersion'> {
  schemaVersion: 2;
  retainedDeploymentPlan: AzureCePlan;
  observation: AzureCeObservation;
  retainedResourceOwners: Array<{ resourceId: string; ownerPlanSha256: string }>;
}
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure relay replacement plan: ${message}`);
};
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const lower = (value: string) => value.toLowerCase();

/** Relay resources keep their original creation owner, even after a CE VM replacement. */
export function azureRelayResourceSource(plan: AzureCePlan): AzureCePlan {
  let current = plan;
  const seen = new Set<AzureCePlan>();
  while (current.relayProfile?.schemaVersion === 2) {
    require(!seen.has(current), 'recursive retained source is forbidden');
    seen.add(current);
    current = current.relayProfile.retainedDeploymentPlan;
  }
  return current;
}

/** Compile a selected-VM lifecycle against exact retained creation identities; never regenerate the relay graph. */
export function compileAzureRelayReplacementPlan(
  foundation: AzureCePlan,
  retained: AzureCePlan,
  observation: AzureCeObservation,
): AzureCePlan {
  require(!foundation.relayProfile && !foundation.workloadProfile, 'unprofiled replacement foundation required');
  verifyAzureCePlan(foundation);
  verifyAzureCePlan(retained);
  const retainedProfile = retained.relayProfile;
  if (
    !retainedProfile ||
    ![1, 2].includes(retainedProfile.schemaVersion) ||
    (retainedProfile.schemaVersion === 1
      ? retained.intent.operation !== 'deploy'
      : retained.intent.operation !== 'replace-node')
  )
    throw Error('Azure relay replacement plan: exact owning relay creation or replacement plan required');
  const resourceSource = azureRelayResourceSource(retained);
  require(foundation.intent.operation === 'replace-node' &&
    foundation.routing.mode === 'route-server', 'selected Route Server replacement required');
  require(same(foundation, compileAzureCePlan(foundation.intent, observation)), 'foundation differs from discovery');
  const { operation: _oldOperation, replacementNode: _oldNode, ...oldIntent } = retained.intent;
  const { operation: _operation, replacementNode: _node, ...newIntent } = foundation.intent;
  require(same(oldIntent, newIntent) &&
    same(foundation.subscription, retained.subscription) &&
    same(foundation.topology, retained.topology) &&
    same(foundation.nics, retained.nics) &&
    same(foundation.routing, retained.routing), 'retained scope, engine, topology or configuration differs');
  const { termsAccepted: _oldTerms, ...oldImage } = retained.image;
  const { termsAccepted: _terms, ...newImage } = foundation.image;
  require(same(oldImage, newImage), 'pinned CE image differs');
  const selected = foundation.intent.replacementNode;
  require(Number.isInteger(selected) &&
    Number(selected) >= 1 &&
    Number(selected) <= retained.topology.nodeCount, 'one exact selected CE node required');
  const mutations = foundation.actions.filter((action) => action.mutates);
  const precedingVm =
    retainedProfile.schemaVersion === 2
      ? retained.actions.find(
          (action) => action.kind === 'vm-create' && action.node === retained.intent.replacementNode,
        )?.resourceId
      : undefined;
  const retainedResourceOwners =
    retainedProfile.schemaVersion === 2
      ? retainedProfile.retainedResourceOwners.map((row) => ({
          ...row,
          ownerPlanSha256: row.resourceId === precedingVm ? retained.planSha256 : row.ownerPlanSha256,
        }))
      : resourceSource.ownershipInventory
          .filter((item) => item.owned)
          .map((item) => ({
            resourceId: item.resourceId,
            ownerPlanSha256: resourceSource.planSha256,
          }));
  const owners = new Map(retainedResourceOwners.map((row) => [lower(row.resourceId), row.ownerPlanSha256]));
  require(mutations.length === 2 &&
    mutations[0].kind === 'vm-delete' &&
    mutations[1].kind === 'vm-create' &&
    mutations.every((action) => action.node === selected && action.resourceId === mutations[0].resourceId) &&
    typeof mutations[0].resourceId === 'string' &&
    mutations[0].expectedOwnerPlanSha256 ===
      owners.get(lower(mutations[0].resourceId)), 'only the selected retained CE VM may be deleted and created');
  require(new Set(retainedResourceOwners.map((row) => lower(row.resourceId))).size ===
    retainedResourceOwners.length, 'retained resource inventory is duplicated');
  const ceResources = resourceSource.actions.filter((action) => ['vm-create', 'nic-create'].includes(action.kind));
  require(ceResources.length ===
    retained.topology.nodeCount * (retained.nics.length + 1), 'complete retained CE VM and NIC graph required');
  for (const action of ceResources) {
    require(action.resourceId, 'retained CE resource identifier is unresolved');
    const rows = observation.resources.filter((row) => lower(row.id) === lower(action.resourceId as string));
    const row = rows.length === 1 ? rows[0] : undefined;
    require(row?.exists &&
      row.owned &&
      row.tags['xcsh-managed-by'] === 'azure-ce' &&
      row.tags['xcsh-execution-engine'] === retained.engine &&
      row.tags['xcsh-deployment-id'] === retained.deploymentName &&
      row.tags['xcsh-plan-sha256'] ===
        owners.get(lower(action.resourceId as string)), 'retained CE resource is missing, duplicated or foreign');
  }
  const originalIds = new Set(retained.ownershipInventory.map((row) => lower(row.resourceId)));
  require(foundation.ownershipInventory.every((row) =>
    originalIds.has(lower(row.resourceId)),
  ), 'replacement discovery contains an orphan or unrelated resource');
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(foundation);
  const relayProfile: AzureRelayReplacementProfile = {
    schemaVersion: 2,
    foundationPlan: structuredClone(foundation),
    retainedDeploymentPlan: structuredClone(retained),
    observation: structuredClone(observation),
    selection: structuredClone(retainedProfile.selection),
    catalog: structuredClone(retainedProfile.catalog),
    retainedResourceOwners,
  };
  const draft = {
    ...base,
    billableResources: structuredClone(retained.billableResources),
    ownershipInventory: retained.ownershipInventory.map((row) => ({ ...row, action: 'reference' as const })),
    relayProfile,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}

export function verifyAzureRelayReplacementProfile(plan: AzureCePlan): void {
  const profile = plan.relayProfile;
  require(profile?.schemaVersion === 2 &&
    Object.keys(profile).sort().join(',') ===
      'catalog,foundationPlan,observation,retainedDeploymentPlan,retainedResourceOwners,schemaVersion,selection', 'replacement profile shape differs');
  if (profile?.schemaVersion !== 2) throw Error('Azure relay replacement plan: profile missing');
  const expected = compileAzureRelayReplacementPlan(
    profile.foundationPlan,
    profile.retainedDeploymentPlan,
    profile.observation,
  );
  require(same(plan, expected), 'replacement graph differs from exact retained source and discovery');
}

/** Capture cloud identity through the selected topology, without claiming sessions or freshness. */
export async function captureAzureReplacementRouteServerOwnership(
  plan: AzureCePlan,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureRouteServerOwnership> {
  if (!plan.relayProfile) return captureAzureRouteServerOwnership(plan, api, signal);
  const relay = azureRelayPlanForDeployment(plan);
  const current = await observeAzureRelayRouteServerIdentity(plan, relay, api, signal);
  return {
    routeServerId: current.routeServerId,
    ownerPlanSha256: azureRelayResourceSource(plan).planSha256,
    peerIds: Object.fromEntries(current.peers.map((peer, index) => [String(index + 1), peer.id])),
  };
}

export function validAzureReplacementRouteServerOwnership(
  plan: AzureCePlan,
  value: AzureRouteServerOwnership,
): boolean {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'ownerPlanSha256,peerIds,routeServerId' ||
    typeof value.routeServerId !== 'string' ||
    typeof value.ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.ownerPlanSha256) ||
    !value.peerIds ||
    typeof value.peerIds !== 'object' ||
    Array.isArray(value.peerIds)
  )
    return false;
  const server = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`;
  const names = plan.relayProfile
    ? azureRelayPlanForDeployment(plan).relays.map((relay) => relay.name)
    : Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  return (
    lower(value.routeServerId) === lower(server) &&
    (!plan.relayProfile || value.ownerPlanSha256 === azureRelayResourceSource(plan).planSha256) &&
    Object.keys(value.peerIds).sort().join(',') === names.map((_name, index) => String(index + 1)).join(',') &&
    names.every(
      (name, index) =>
        typeof value.peerIds[String(index + 1)] === 'string' &&
        lower(value.peerIds[String(index + 1)]) === lower(`${server}/bgpConnections/${name}`),
    )
  );
}

/** Expected owner before this replacement; VM generations and retained NIC/relay owners remain distinct. */
export function azureRelayReplacementRetainedOwner(plan: AzureCePlan, resourceId: string): string {
  const profile = plan.relayProfile;
  require(profile?.schemaVersion === 2, 'exact replacement owner inventory required');
  if (profile?.schemaVersion !== 2) throw Error('Azure relay replacement plan: owner inventory missing');
  const rows = profile.retainedResourceOwners.filter((row) => lower(row.resourceId) === lower(resourceId));
  require(rows.length === 1 &&
    /^[a-f0-9]{64}$/.test(rows[0].ownerPlanSha256), 'resource owner is missing or ambiguous');
  return rows[0].ownerPlanSha256;
}
