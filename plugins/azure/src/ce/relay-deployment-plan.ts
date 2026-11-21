import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureRelayResolvedCatalog } from './relay-catalog';
import { type AzureRelayCatalog, type AzureRelaySelection, compileAzureRelayPlan } from './relay-plan';
import { azureRelayResourceSource } from './relay-replacement-plan';
import type { AzureCeAction, AzureCePlan } from './types';

export interface AzureRelayDeploymentProfile {
  schemaVersion: 1;
  foundationPlan: AzureCePlan;
  selection: AzureRelaySelection;
  catalog: AzureRelayResolvedCatalog;
}
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay deployment: ${message}`);
};
const core = (catalog: AzureRelayResolvedCatalog): AzureRelayCatalog => ({
  region: catalog.region,
  image: structuredClone(catalog.image),
  vmSizes: structuredClone(catalog.vmSizes),
});
function verifyCatalog(source: AzureCePlan, selection: AzureRelaySelection, catalog: AzureRelayResolvedCatalog) {
  const provenance = catalog.provenance;
  require(provenance?.method === 'azure-cli-live' &&
    provenance.sourcePlanSha256 === source.planSha256 &&
    Number.isFinite(Date.parse(provenance.observedAt)), 'catalog source provenance differs');
  const urn = [
    selection.hostImage.publisher,
    selection.hostImage.offer,
    selection.hostImage.sku,
    selection.hostImage.version,
  ].join(':');
  const queries = [
    ['account', 'show'],
    ['vm', 'image', 'show', '--urn', urn, '--location', source.region],
    ['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all'],
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  require(Array.isArray(provenance.reads) &&
    provenance.reads.length === 3 &&
    provenance.reads.every(
      (read, index) =>
        read.command === 'az' &&
        JSON.stringify(read.args) === JSON.stringify(queries[index]) &&
        /^[a-f0-9]{64}$/.test(read.responseSha256) &&
        Number.isFinite(Date.parse(read.observedAt)) &&
        Date.parse(read.observedAt) <= Date.parse(provenance.observedAt),
    ), 'catalog query receipts differ or are incomplete');
  require(catalog.vmSizes.length === 1 && catalog.vmSizes[0].name === selection.vmSize, 'catalog VM selection differs');
  compileAzureRelayPlan(source, selection, core(catalog));
}

/** Final plan contains a verified acyclic foundation/catalog input. Relay runtime identities are derived only after the final owner hash exists. */
export function compileAzureRelayDeploymentPlan(
  source: AzureCePlan,
  selection: AzureRelaySelection,
  catalog: AzureRelayResolvedCatalog,
) {
  require(!source.relayProfile, 'foundation cannot already contain a relay profile');
  verifyAzureCePlan(source);
  verifyCatalog(source, selection, catalog);
  const relay = compileAzureRelayPlan(source, selection, core(catalog));
  const capacity = source.computeCapacity;
  require(capacity &&
    Number.isSafeInteger(capacity.ceVcpus) &&
    capacity.ceVcpus > 0 &&
    Number.isSafeInteger(capacity.workloadVcpus) &&
    capacity.workloadVcpus >= 0 &&
    Number.isSafeInteger(capacity.quotaAvailable) &&
    capacity.quotaAvailable >= 0, 'source compute capacity is unresolved');
  const requiredVcpus =
    source.topology.nodeCount * capacity.ceVcpus +
    capacity.workloadVcpus +
    relay.relays.length * catalog.vmSizes[0].vCpus;
  require(capacity.quotaAvailable >=
    requiredVcpus, `relay quota is insufficient: ${requiredVcpus} total vCPUs required`);
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(source);
  const actions: AzureCeAction[] = [];
  const removedIds = new Set<string>();
  for (const action of base.actions) {
    if (action.kind === 'route-server-peer-create') {
      if (action.resourceId) removedIds.add(action.resourceId.toLowerCase());
      continue;
    }
    actions.push(action);
    if (action.kind === 'route-server-create')
      actions.push({
        id: '',
        phase: 'routing',
        kind: 'relay-provision',
        description: 'Provision both exact owned relay VMs and Route Server peers; guest routing remains gated',
        resourceId: relay.routeServerId,
        mutates: true,
        destructive: false,
      });
  }
  require(actions.filter((action) => action.kind === 'relay-provision').length ===
    1, 'exact relay provisioning boundary required');
  actions.forEach((action, index) => {
    action.id = String(index + 1).padStart(3, '0');
  });
  const ownershipInventory = base.ownershipInventory.filter((item) => !removedIds.has(item.resourceId.toLowerCase()));
  for (const item of relay.relays)
    for (const resourceId of [
      item.vmId,
      item.osDiskId,
      item.nicId,
      ...(item.publicIpId ? [item.publicIpId] : []),
      `${relay.routeServerId}/bgpConnections/${item.name}`,
    ]) {
      require(!ownershipInventory.some(
        (current) => current.resourceId.toLowerCase() === resourceId.toLowerCase(),
      ), 'relay resource graph collides with foundation');
      ownershipInventory.push({ resourceId, owned: true, action: 'create' });
    }
  const costs = new Map<string, number>();
  for (const item of base.billableResources) costs.set(item.type, (costs.get(item.type) ?? 0) + item.count);
  for (const item of [
    { type: 'virtual-machine', count: 2 },
    { type: 'managed-disk', count: 2 },
    ...(source.egress.mode === 'public-ip' ? [{ type: 'standard-public-ip', count: 2 }] : []),
  ])
    costs.set(item.type, (costs.get(item.type) ?? 0) + item.count);
  const relayProfile: AzureRelayDeploymentProfile = {
    schemaVersion: 1,
    foundationPlan: structuredClone(source),
    selection: structuredClone(selection),
    catalog: structuredClone(catalog),
  };
  const draft = {
    ...base,
    actions,
    ownershipInventory,
    billableResources: [...costs].map(([type, count]) => ({ type, count })),
    relayProfile,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}

/** Called after the outer hash check; reconstruction rejects internally rehashed foreign execution graphs. */
export function verifyAzureRelayDeploymentProfile(plan: AzureCePlan): void {
  const profile = plan.relayProfile;
  require(profile?.schemaVersion === 1 &&
    Object.keys(profile).sort().join(',') ===
      'catalog,foundationPlan,schemaVersion,selection', 'relay profile is malformed');
  if (profile?.schemaVersion !== 1) throw Error('Azure relay deployment: creation profile missing');
  require(!profile.foundationPlan.relayProfile, 'recursive foundation profile is forbidden');
  const expected = compileAzureRelayDeploymentPlan(profile.foundationPlan, profile.selection, profile.catalog);
  require(canonicalSha256(plan) ===
    canonicalSha256(expected), 'final execution graph differs from verified foundation/catalog inputs');
}
export function azureRelayPlanForDeployment(plan: AzureCePlan) {
  verifyAzureCePlan(plan);
  if (!plan.relayProfile) throw Error('Azure relay deployment: relay profile is not selected');
  const owner = azureRelayResourceSource(plan);
  const profile = owner.relayProfile;
  if (profile?.schemaVersion !== 1) throw Error('Azure relay deployment: exact creation source required');
  return compileAzureRelayPlan(owner, profile.selection, core(profile.catalog));
}
