import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import { validateAzureNetworkUpdateInventory } from './network-update';
import type { observeAzureTerraformNetworkPower } from './terraform-network-power';
import {
  buildAzureTerraformNetworkRoutingStage,
  prepareAzureTerraformNetworkRouting,
} from './terraform-network-routing';
import type { collectAzureTerraformNetworkRoutingConfiguration } from './terraform-network-routing-observation';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network routing observation validation: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, expected: string[]) {
  const row = object(value);
  require(same(Object.keys(row).sort(), expected.toSorted()), 'saved packet schema differs');
  return row;
}
export type AzureTerraformNetworkRoutingSavedObservation = {
  schemaVersion: number;
  stageSha256: string;
  routing: Exclude<Awaited<ReturnType<typeof collectAzureTerraformNetworkRoutingConfiguration>>, { status: 'unknown' }>;
  power: Awaited<ReturnType<typeof observeAzureTerraformNetworkPower>>;
};
/** Exact historical observation identity validation. Current execution separately collects new
 * independent observations; stored collection times never establish CE sample freshness.
 */
export function validateAzureTerraformNetworkRoutingObservation(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  node: number,
  input: unknown,
  target = true,
): AzureTerraformNetworkRoutingSavedObservation {
  const stage = buildAzureTerraformNetworkRoutingStage(plan, source, before, current, node),
    stageSha256 = canonicalSha256(stage),
    preparationSha256 = canonicalSha256(prepareAzureTerraformNetworkRouting(plan, source, before, node));
  const value = keys(input, ['schemaVersion', 'stageSha256', 'routing', 'power']);
  require(value.schemaVersion === 1 && value.stageSha256 === stageSha256, 'saved cloud stage identity differs');
  const routing = keys(value.routing, [
    'schemaVersion',
    'scope',
    'planSha256',
    'node',
    'beforeSha256',
    'expectedSha256',
    'preparationSha256',
    'collectedAt',
    'freshness',
    'forwarding',
    'bgpExchange',
    'interfaceState',
    'nodeHealth',
    'status',
    'configurationState',
    'rows',
    'reason',
  ]);
  const power = keys(value.power, [
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
  ]);
  require(routing.schemaVersion === 1 &&
    routing.scope === 'azure-dependent-routing-configuration' &&
    routing.planSha256 === plan.planSha256 &&
    routing.node === node &&
    routing.beforeSha256 === stage.beforeSha256 &&
    routing.expectedSha256 === stage.currentSha256 &&
    routing.preparationSha256 === preparationSha256 &&
    routing.status === (stage.dependencies.length ? 'observed' : 'not-required') &&
    Array.isArray(routing.rows) &&
    routing.rows.length === stage.dependencies.length &&
    typeof routing.collectedAt === 'string' &&
    Number.isFinite(Date.parse(routing.collectedAt)) &&
    ['forwarding', 'bgpExchange', 'interfaceState', 'nodeHealth'].every((key) => routing[key] === 'unknown') &&
    routing.freshness === 'unqualified', 'saved routing scope or evidence differs');
  require(routing.reason ===
    (stage.dependencies.length
      ? 'configuration-installation-only'
      : 'no-selected-dependent-routing'), 'saved evidence reason differs');
  const resources = object(object(JSON.parse(stage.configuration)).resource);
  for (const [index, dependency] of stage.dependencies.entries()) {
    const row = keys(routing.rows[index], [
        'kind',
        'resourceId',
        'parentId',
        'parentOwnerPlanSha256',
        'node',
        'nicIndex',
        'nic',
        'name',
        'previousIp',
        'currentIp',
        'installedIp',
        'state',
        'provisioningState',
        ...(dependency.kind === 'udr-next-hop' ? ['prefix', 'nextHopType'] : ['peerAsn']),
      ]),
      config = object(object(resources[dependency.address.split('.')[0]])[dependency.address.split('.')[1]]);
    const udr = dependency.kind === 'udr-next-hop',
      parentId = dependency.resourceId.slice(
        0,
        dependency.resourceId.lastIndexOf(udr ? '/routes/' : '/bgpConnections/'),
      );
    const owner = object(object(object(resources[udr ? 'azurerm_route_table' : 'azurerm_route_server']).ce).tags)[
      'xcsh-plan-sha256'
    ];
    require(row.kind === dependency.kind &&
      row.resourceId === dependency.resourceId &&
      row.parentId === parentId &&
      row.parentOwnerPlanSha256 === owner &&
      row.node === node &&
      row.nicIndex === dependency.nicIndex &&
      same(row.nic, current.nodes[String(node)].nics[String(dependency.nicIndex)]) &&
      row.name === config.name &&
      row.previousIp === dependency.previousIp &&
      row.currentIp === dependency.currentIp &&
      row.provisioningState === 'Succeeded' &&
      (row.installedIp === dependency.currentIp || (!target && row.installedIp === dependency.previousIp)) &&
      row.state === (row.installedIp === dependency.currentIp ? 'current' : 'prior') &&
      (udr
        ? row.prefix === config.address_prefix && row.nextHopType === 'VirtualAppliance'
        : row.peerAsn === config.peer_asn), 'saved routing resource, parent or installed identity differs');
  }
  const states = new Set((routing.rows as Record<string, unknown>[]).map((row) => row.state));
  require(routing.configurationState ===
    (stage.dependencies.length
      ? states.size === 1
        ? (routing.rows as Record<string, unknown>[])[0].state
        : 'mixed'
      : 'not-required'), 'saved configuration state differs');
  validateAzureNetworkUpdateInventory(plan, power.inventory);
  require(power.engine === 'terraform' &&
    power.planSha256 === plan.planSha256 &&
    power.node === node &&
    power.operation === 'start' &&
    power.converged === true &&
    power.powerState === 'running' &&
    power.resourceId === current.nodes[String(node)].resourceId &&
    power.vmId === current.nodes[String(node)].vmId &&
    power.ownerPlanSha256 === current.nodes[String(node)].ownerPlanSha256 &&
    same(object(power.inventory).nodes, current.nodes) &&
    typeof power.observedAt === 'string' &&
    Number.isFinite(Date.parse(power.observedAt)), 'saved current power/cloud identity differs');
  return input as AzureTerraformNetworkRoutingSavedObservation;
}
