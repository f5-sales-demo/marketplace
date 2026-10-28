import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import { buildAzureNetworkUpdateTerraformStage } from './network-update-terraform';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import type { AzureCePlan } from './types';

export interface AzureTerraformNetworkRoutingDependency {
  kind: 'udr-next-hop' | 'route-server-peer';
  address: string;
  field: 'next_hop_in_ip_address' | 'peer_ip';
  nicIndex: number;
  resourceId: string;
  expression: string;
  previousIp: string;
  currentIp: string;
}
export interface AzureTerraformNetworkRoutingStage {
  schemaVersion: 1;
  kind: 'dependent-routing';
  node: number;
  planSha256: string;
  beforeSha256: string;
  currentSha256: string;
  sourceSha256: string;
  nicConfiguration: string;
  nicConfigurationSha256: string;
  configuration: string;
  configurationSha256: string;
  releasedConfiguration: string;
  releasedConfigurationSha256: string;
  dependencies: AzureTerraformNetworkRoutingDependency[];
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network dependent routing: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value as Record<string, unknown>;
}
function parse(value: string): Record<string, unknown> {
  try {
    return object(JSON.parse(value));
  } catch {
    throw Error('Azure Terraform network dependent routing: malformed configuration');
  }
}
const expression = (node: number, index: number) =>
  `\${azurerm_network_interface.node_${node}_nic_${index}.private_ip_address}`;

/** Source-only graph preparation. Owning history and current parent/cloud ownership are separate gates.
 * Pin only selected dependent addresses while NICs change; never widen the NIC saved-plan whitelist.
 */
export function prepareAzureTerraformNetworkRouting(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  node: number,
) {
  const nicStage = buildAzureNetworkUpdateTerraformStage(plan, source, before, node);
  const graph = parse(nicStage.configuration),
    resources = object(graph.resource);
  const dependencies: AzureTerraformNetworkRoutingDependency[] = [];
  const base = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network`;
  const parent = (type: string, name: string, expectedName: string, owner: string) => {
    const row = object(object(resources[type])[name]),
      tags = object(row.tags);
    require(row.name === expectedName &&
      lower(row.location) === lower(plan.region) &&
      (row.resource_group_name === plan.intent.resourceGroup ||
        (row.resource_group_name === `\${azurerm_resource_group.ce.name}` &&
          object(object(resources.azurerm_resource_group).ce).name === plan.intent.resourceGroup)) &&
      tags['xcsh-managed-by'] === 'azure-ce' &&
      tags['xcsh-execution-engine'] === 'terraform' &&
      tags['xcsh-deployment-id'] === plan.deploymentName &&
      tags['xcsh-plan-sha256'] === owner, 'retained routing parent identity differs');
  };
  const add = (
    kind: AzureTerraformNetworkRoutingDependency['kind'],
    address: string,
    field: AzureTerraformNetworkRoutingDependency['field'],
    index: number,
    resourceId: string,
  ) => {
    const row = object(object(resources[address.split('.')[0]])[address.split('.')[1]]);
    const ref = expression(node, index),
      identity = before.nodes[String(node)].nics[String(index)];
    require(identity && row[field] === ref, 'exact retained dependent NIC expression required');
    dependencies.push({
      kind,
      address,
      field,
      nicIndex: index,
      resourceId,
      expression: ref,
      previousIp: identity.privateIp,
      currentIp: identity.privateIp,
    });
    row[field] = identity.privateIp;
  };
  const routes = resources.azurerm_route === undefined ? {} : object(resources.azurerm_route);
  if (plan.routing.udr) {
    require(plan.routing.mode === 'udr' &&
      plan.routing.destinationCidrs.length > 0, 'explicit UDR destinations required');
    const selected = plan.routing.udr.nextHop;
    require(same(
      Object.keys(routes).sort(),
      plan.routing.destinationCidrs.map((_, i) => `route_${i}`).sort(),
    ), 'complete retained UDR route set required');
    const owner = before.nodes[String(selected.node)].nics[String(selected.nicIndex)].ownerPlanSha256;
    parent('azurerm_route_table', 'ce', `${plan.deploymentName}-rt`, owner);
    for (const [index, prefix] of plan.routing.destinationCidrs.entries()) {
      const row = object(routes[`route_${index}`]);
      require(same(
        Object.keys(row).sort(),
        [
          'address_prefix',
          'name',
          'next_hop_in_ip_address',
          'next_hop_type',
          'resource_group_name',
          'route_table_name',
        ].sort(),
      ) &&
        row.name === `ce-route-${index + 1}` &&
        row.address_prefix === prefix &&
        row.next_hop_type === 'VirtualAppliance' &&
        row.route_table_name === `\${azurerm_route_table.ce.name}` &&
        row.resource_group_name === `\${azurerm_resource_group.ce.name}` &&
        row.next_hop_in_ip_address === expression(selected.node, selected.nicIndex), 'retained UDR intent differs');
      if (selected.node === node)
        add(
          'udr-next-hop',
          `azurerm_route.route_${index}`,
          'next_hop_in_ip_address',
          selected.nicIndex,
          `${base}/routeTables/${plan.deploymentName}-rt/routes/ce-route-${index + 1}`,
        );
    }
  } else require(Object.keys(routes).length === 0, 'UDR resources lack explicit owning profile');
  const peers =
    resources.azurerm_route_server_bgp_connection === undefined
      ? {}
      : object(resources.azurerm_route_server_bgp_connection);
  if (plan.routing.mode === 'route-server' && !plan.relayProfile)
    require(Object.keys(peers).length > 0, 'complete retained CE peer set required');
  require(!plan.relayProfile || Object.keys(peers).length === 0, 'relay and direct CE peer contracts cannot be mixed');
  if (Object.keys(peers).length) {
    require(plan.routing.mode === 'route-server' && !plan.routing.udr, 'peer resources lack Route Server intent');
    const slo = plan.nics.find((nic) => nic.role === 'slo');
    require(slo, 'explicit SLO required');
    require(same(
      Object.keys(peers).sort(),
      Object.keys(before.nodes)
        .map((key) => `node_${key}`)
        .sort(),
    ), 'complete independent CE peer set required');
    parent(
      'azurerm_route_server',
      'ce',
      `${plan.deploymentName}-rs`,
      before.nodes[String(node)].nics[String(slo.index)].ownerPlanSha256,
    );
    const output = object(object(object(graph.output).ce_route_server_peers).value);
    require(same(Object.keys(output).sort(), Object.keys(before.nodes).sort()), 'complete peer output set required');
    for (const key of Object.keys(before.nodes)) {
      const row = object(peers[`node_${key}`]),
        exported = object(output[key]);
      require(same(Object.keys(row).sort(), ['name', 'peer_asn', 'peer_ip', 'route_server_id'].sort()) &&
        row.name === `${plan.deploymentName}-${key}` &&
        row.peer_asn === plan.routing.localAsn &&
        row.route_server_id === `\${azurerm_route_server.ce.id}` &&
        row.peer_ip === expression(Number(key), slo.index) &&
        same(exported, {
          id: `\${azurerm_route_server_bgp_connection.node_${key}.id}`,
          peer_ip: row.peer_ip,
          peer_asn: row.peer_asn,
        }), 'retained peer intent/output differs');
    }
    add(
      'route-server-peer',
      `azurerm_route_server_bgp_connection.node_${node}`,
      'peer_ip',
      slo.index,
      `${base}/virtualHubs/${plan.deploymentName}-rs/bgpConnections/${plan.deploymentName}-${node}`,
    );
    object(output[String(node)]).peer_ip = before.nodes[String(node)].nics[String(slo.index)].privateIp;
  }
  // An unqualified consumer of the moving address could escape the intended graph split.
  // Reject it before the owning driver is allowed to interrupt the node.
  const mentionsSelectedIp = (value: unknown): boolean => {
    if (typeof value === 'string')
      return plan.nics.some((nic) =>
        value.includes(`azurerm_network_interface.node_${node}_nic_${nic.index}.private_ip_address`),
      );
    return !!value && typeof value === 'object' && Object.values(value).some(mentionsSelectedIp);
  };
  for (const group of Object.values(resources))
    for (const row of Object.values(object(group)))
      require(!mentionsSelectedIp(row), 'unqualified resource depends on selected NIC address');
  const configuration = JSON.stringify(graph);
  return { ...nicStage, configuration, configurationSha256: hash(configuration), dependencies };
}

/** Exact narrow NIC stage with selected dependent addresses pinned to their prior installed IPs.
 * Dependencies stay in the separate routing contract; no routing mutation enters the NIC whitelist.
 */
export function buildAzureTerraformNetworkPinnedNicStage(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  node: number,
) {
  const prepared = prepareAzureTerraformNetworkRouting(plan, source, before, node);
  return {
    node: prepared.node,
    previousConfigurationSha256: prepared.previousConfigurationSha256,
    configurationSha256: prepared.configurationSha256,
    configuration: prepared.configuration,
    addresses: prepared.addresses,
  };
}

/** Build a distinct routing-only plan after independently verified NIC convergence.
 * Release restores the original computed graph; its own saved plan must prove no resource changes.
 * This contract does not qualify forwarding, BGP exchange, node health or sample freshness.
 */
export function buildAzureTerraformNetworkRoutingStage(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  node: number,
): AzureTerraformNetworkRoutingStage {
  const prepared = prepareAzureTerraformNetworkRouting(plan, source, before, node);
  validateAzureNetworkUpdateInventory(plan, current);
  const reached = Array.from({ length: node }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  verifyAzureNetworkUpdateProgress(plan, before, current, reached);
  for (const [key, vm] of Object.entries(before.nodes))
    for (const [index, identity] of Object.entries(vm.nics))
      require(Number(key) === node ||
        current.nodes[key].nics[index].privateIp === identity.privateIp, 'unselected NIC address changed');
  const graph = parse(prepared.configuration),
    released = parse(prepared.configuration);
  const dependencies = prepared.dependencies.map((dependency) => {
    const currentIp = current.nodes[String(node)].nics[String(dependency.nicIndex)].privateIp;
    const [type, name] = dependency.address.split('.');
    object(object(object(graph.resource)[type])[name])[dependency.field] = currentIp;
    object(object(object(released.resource)[type])[name])[dependency.field] = dependency.expression;
    if (dependency.kind === 'route-server-peer') {
      object(object(object(object(graph.output).ce_route_server_peers).value)[String(node)]).peer_ip = currentIp;
      object(object(object(object(released.output).ce_route_server_peers).value)[String(node)]).peer_ip =
        dependency.expression;
    }
    return { ...dependency, currentIp };
  });
  const configuration = JSON.stringify(graph),
    releasedConfiguration = JSON.stringify(released);
  return {
    schemaVersion: 1,
    kind: 'dependent-routing',
    node,
    planSha256: plan.planSha256,
    beforeSha256: canonicalSha256(before),
    currentSha256: canonicalSha256(current),
    sourceSha256: hash(source),
    nicConfiguration: prepared.configuration,
    nicConfigurationSha256: prepared.configurationSha256,
    configuration,
    configurationSha256: hash(configuration),
    releasedConfiguration,
    releasedConfigurationSha256: hash(releasedConfiguration),
    dependencies,
  };
}

/** Authenticate retained routing input against independently observed node/NIC identities.
 * Collection timestamps are preserved as original local input provenance, never CE heartbeats.
 */
export function validateAzureTerraformNetworkRoutingPrepared(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  expected: AzureNetworkUpdateInventory,
  node: number,
  input: unknown,
) {
  const saved = object(input);
  require(same(
    Object.keys(saved).sort(),
    ['schemaVersion', 'kind', 'stage', 'before', 'current', 'appliedNics'].sort(),
  ) &&
    saved.schemaVersion === 2 &&
    saved.kind === 'dependent-routing' &&
    same(saved.before, before), 'complete original routing input required');
  const current = validateAzureNetworkUpdateInventory(plan, saved.current);
  validateAzureNetworkUpdateInventory(plan, expected);
  require(same(current.nodes, expected.nodes), 'retained routing input differs from independently observed identities');
  const stage = buildAzureTerraformNetworkRoutingStage(plan, source, before, current, node);
  require(same(saved.stage, stage) &&
    same(
      saved.appliedNics,
      Array.from({ length: node }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
    ), 'prepared source and full serial NIC boundary differ');
  return { current: structuredClone(current), stage };
}

/** Recompute all inputs rather than trusting caller-created stages or hashes. */
export function validateAzureTerraformNetworkRoutingReceipt(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  stage: AzureTerraformNetworkRoutingStage,
  receipt: PlanReceipt,
  phase: 'mutation' | 'release',
) {
  require(phase === 'mutation' || phase === 'release', 'known routing phase required');
  require(same(
    stage,
    buildAzureTerraformNetworkRoutingStage(plan, source, before, current, stage.node),
  ), 'immutable routing stage differs');
  const configuration = phase === 'mutation' ? stage.configuration : stage.releasedConfiguration;
  require(receipt &&
    receipt.schemaVersion === 1 &&
    receipt.engine === 'terraform' &&
    receipt.deploymentId === plan.deploymentName &&
    receipt.backendIdentity === `local:${plan.deploymentName}` &&
    receipt.configurationSha256 === hash(configuration) &&
    receipt.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
    /^[a-f0-9]{64}$/.test(receipt.planSha256) &&
    Object.keys(receipt).every((key) =>
      [
        'schemaVersion',
        'engine',
        'deploymentId',
        'backendIdentity',
        'configurationSha256',
        'providerLockSha256',
        'planSha256',
        'changes',
        'noChanges',
        'actionInvocations',
        'imports',
        'relinquishments',
      ].includes(key),
    ) &&
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].every(
      (value) => value === undefined || (Array.isArray(value) && value.length === 0),
    ) &&
    Array.isArray(receipt.changes), 'exact saved scope and qualified lock required');
  const resources = object(parse(configuration).resource),
    seen = new Set<string>();
  for (const change of receipt.changes) {
    require(change &&
      same(Object.keys(change).sort(), ['address', 'type', 'actions'].sort()), 'unqualified saved change metadata');
    const match = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(change.address);
    require(match &&
      change.type === match[1] &&
      object(resources[match[1]])[match[2]] &&
      !seen.has(change.address), 'unknown or duplicate saved resource');
    seen.add(change.address);
    const dependency = stage.dependencies.find((row) => row.address === change.address);
    const action =
      phase === 'mutation' && dependency && dependency.previousIp !== dependency.currentIp ? 'update' : 'no-op';
    require(same(change.actions, [action]), 'saved plan changes an unauthorized resource or effect');
  }
  require(stage.dependencies.every((row) => seen.has(row.address)), 'complete dependent effects required');
  require(typeof receipt.noChanges === 'boolean' &&
    receipt.noChanges === receipt.changes.every((row) => row.actions[0] === 'no-op'), 'no-change claim differs');
}

const fields = {
  'udr-next-hop': [
    'id',
    'name',
    'resource_group_name',
    'route_table_name',
    'address_prefix',
    'next_hop_type',
    'next_hop_in_ip_address',
    'timeouts',
  ],
  'route-server-peer': ['id', 'name', 'route_server_id', 'peer_asn', 'peer_ip', 'timeouts'],
};
export function azureTerraformNetworkRoutingSelections(stage: AzureTerraformNetworkRoutingStage) {
  return Object.fromEntries(stage.dependencies.map((row) => [row.address, [...fields[row.kind]]]));
}
function resolved(value: unknown): boolean {
  if (typeof value === 'string') return !value.includes('${') && !value.includes('__');
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return !!value && typeof value === 'object' && Object.values(value).every(resolved);
}
/** Exact installed-schema projections authorize only the dependent IP field; identity and all other fields remain fixed. */
export function validateAzureTerraformNetworkRoutingProjection(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  stage: AzureTerraformNetworkRoutingStage,
  receipt: PlanReceipt,
  phase: 'mutation' | 'release',
  priorInput: unknown,
  proposedInput: unknown,
) {
  validateAzureTerraformNetworkRoutingReceipt(plan, source, before, current, stage, receipt, phase);
  const prior = object(priorInput),
    proposed = object(proposedInput),
    selections = azureTerraformNetworkRoutingSelections(stage);
  require(same(Object.keys(prior).sort(), Object.keys(selections).sort()) &&
    same(Object.keys(proposed).sort(), Object.keys(selections).sort()), 'complete projection resource set required');
  for (const dependency of stage.dependencies) {
    const beforeRow = object(prior[dependency.address]),
      afterRow = object(proposed[dependency.address]);
    for (const row of [beforeRow, afterRow]) {
      require(same(Object.keys(row).sort(), selections[dependency.address].toSorted()) &&
        Object.values(row).every(resolved) &&
        lower(row.id) === lower(dependency.resourceId), 'missing, extra, unresolved or foreign projected identity');
      const allowed =
        dependency.kind === 'udr-next-hop' ? ['create', 'delete', 'read', 'update'] : ['create', 'delete', 'read'];
      require(row.timeouts === null ||
        Object.entries(object(row.timeouts)).every(
          ([key, value]) => allowed.includes(key) && (value === null || typeof value === 'string'),
        ), 'unqualified timeout fields');
      if (dependency.kind === 'udr-next-hop') {
        const index = Number(dependency.address.split('_').at(-1));
        require(row.name === `ce-route-${index + 1}` &&
          row.resource_group_name === plan.intent.resourceGroup &&
          row.route_table_name === `${plan.deploymentName}-rt` &&
          row.address_prefix === plan.routing.destinationCidrs[index] &&
          row.next_hop_type === 'VirtualAppliance', 'route identity/prefix/type differs');
      } else
        require(row.name === `${plan.deploymentName}-${stage.node}` &&
          row.peer_asn === plan.routing.localAsn &&
          lower(row.route_server_id) ===
            lower(
              dependency.resourceId.slice(0, dependency.resourceId.lastIndexOf('/bgpConnections/')),
            ), 'Route Server peer identity/ASN differs');
    }
    require(beforeRow[dependency.field] === (phase === 'mutation' ? dependency.previousIp : dependency.currentIp) &&
      afterRow[dependency.field] === dependency.currentIp, 'dependent address transition differs');
    for (const field of selections[dependency.address])
      if (field !== dependency.field) require(same(beforeRow[field], afterRow[field]), 'unauthorized projected delta');
  }
}
