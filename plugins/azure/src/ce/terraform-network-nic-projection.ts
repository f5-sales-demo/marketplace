import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalEqual } from './canonical';
import { type AzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import {
  type AzureNetworkUpdateTerraformStage,
  validateAzureNetworkUpdateTerraformReceipt,
} from './network-update-terraform';
import type { AzureCePlan } from './types';

// Qualified against the installed Terraform 1.17.1 / AzureRM 5.4.0 schema.
// A lock/schema change needs fresh qualification before this mapping may execute.
export const AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 =
  '901676ec098461ba0766d62124a4b011ae29e8554dda8c5be71371b1a0684b1b';
const roots = [
  'accelerated_networking_enabled',
  'auxiliary_mode',
  'auxiliary_sku',
  'dns_servers',
  'edge_zone',
  'id',
  'internal_dns_name_label',
  'ip_forwarding_enabled',
  'location',
  'name',
  'resource_group_name',
  'tags',
  'timeouts',
];
const ipFields = [
  'gateway_load_balancer_frontend_ip_configuration_id',
  'name',
  'primary',
  'private_ip_address',
  'private_ip_address_allocation',
  'private_ip_address_version',
  'public_ip_address_id',
  'subnet_id',
];
const ip = (field: string) => `ip_configuration.0.${field}`;
const same = canonicalEqual;
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network NIC projection: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value as Record<string, unknown>;
}
function resolved(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value === 'string') return !value.includes('${') && !/^__/.test(value);
  if (value && typeof value === 'object') return Object.values(value).every(resolved);
  return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
const resourceId = (value: unknown) =>
  typeof value === 'string' &&
  /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+\/.+/i.test(value) &&
  resolved(value);

/** Private paths only; the owning runner binds these reads to its unsubmitted saved journal. */
export function azureTerraformNetworkNicSelections(
  plan: AzureCePlan,
  stage: AzureNetworkUpdateTerraformStage,
  inventory: AzureNetworkUpdateInventory,
) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require(plan.engine === 'terraform' &&
    Number.isInteger(stage.node) &&
    inventory.nodes[String(stage.node)], 'exact Terraform node required');
  const prior: Record<string, string[]> = {},
    proposed: Record<string, string[]> = {};
  for (const nic of plan.nics) {
    const address = `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`;
    const identity = inventory.nodes[String(stage.node)].nics[String(nic.index)];
    const fields = [...roots, 'mac_address', 'virtual_machine_id', 'ip_configuration.length', ...ipFields.map(ip)];
    prior[address] = fields;
    proposed[address] =
      identity.allocation === 'Dynamic' && lower(identity.subnetId) !== lower(identity.targetSubnetId)
        ? fields.filter((path) => path !== ip('private_ip_address'))
        : [...fields];
  }
  return { prior, proposed };
}

/** Validate durable saved projections before apply; no cloud observation or source-history qualification is implied. */
export function validateAzureTerraformNetworkNicProjection(
  plan: AzureCePlan,
  stage: AzureNetworkUpdateTerraformStage,
  inventory: AzureNetworkUpdateInventory,
  receipt: PlanReceipt,
  providerLockSha256: string,
  priorInput: unknown,
  proposedInput: unknown,
): void {
  validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, providerLockSha256);
  require(providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'unqualified provider lock');
  const selections = azureTerraformNetworkNicSelections(plan, stage, inventory);
  const prior = object(priorInput),
    proposed = object(proposedInput);
  require(same(Object.keys(prior).sort(), Object.keys(selections.prior).sort()) &&
    same(
      Object.keys(proposed).sort(),
      Object.keys(selections.proposed).sort(),
    ), 'complete selected resource set required');
  const configuration = object(JSON.parse(stage.configuration));
  const resources = object(configuration.resource);
  const interfaces = object(resources.azurerm_network_interface);
  const name = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.includes('${')) return value;
    const match = /^\$\{azurerm_resource_group\.([a-z0-9_]+)\.name\}$/.exec(value);
    require(match, 'unqualified resource group expression');
    const group = object(object(resources.azurerm_resource_group)[match[1]]);
    require(group.name === plan.intent.resourceGroup, 'referenced group differs');
    return group.name;
  };
  const reference = (value: unknown): unknown => {
    if (typeof value !== 'string' || !value.includes('${')) return value;
    const match = /^\$\{azurerm_public_ip\.([a-z0-9_]+)\.id\}$/.exec(value);
    require(match, 'unqualified requested resource expression');
    const target = object(object(resources.azurerm_public_ip)[match[1]]);
    require(typeof target.name === 'string' &&
      resolved(target.name) &&
      name(target.resource_group_name) === plan.intent.resourceGroup &&
      lower(target.location) === lower(plan.region), 'referenced public IP identity differs');
    return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${target.name}`;
  };
  const vm = inventory.nodes[String(stage.node)];
  for (const nic of plan.nics) {
    const address = `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`;
    const identity = vm.nics[String(nic.index)],
      before = object(prior[address]),
      after = object(proposed[address]);
    for (const [value, fields] of [
      [before, selections.prior[address]],
      [after, selections.proposed[address]],
    ] as const)
      require(same(Object.keys(value).sort(), fields.toSorted()) &&
        Object.values(value).every(resolved), 'missing, extra or unresolved selected field');
    const configured = object(interfaces[address.split('.')[1]]);
    require(Object.keys(configured).every((key) =>
      [...roots, 'ip_configuration'].includes(key),
    ), 'unqualified NIC configuration field');
    const ipConfig = object((configured.ip_configuration as unknown[])[0]);
    const effects = receipt.changes.filter((change) => change.address === address);
    require(effects.length === 1 &&
      effects[0].actions[0] ===
        (lower(identity.subnetId) === lower(identity.targetSubnetId)
          ? 'no-op'
          : 'update'), 'saved effect differs from observed subnet boundary');
    require(identity.allocation !== 'Dynamic' ||
      ipConfig.private_ip_address === undefined ||
      ipConfig.private_ip_address === null ||
      ipConfig.private_ip_address === '', 'dynamic private IP cannot be an execution input');
    require(configured.name === `${plan.deploymentName}-${stage.node}-nic${nic.index}` &&
      name(configured.resource_group_name) === plan.intent.resourceGroup &&
      lower(configured.location) === lower(plan.region) &&
      (configured.id === undefined ||
        configured.id === null ||
        lower(configured.id) === lower(identity.resourceId)), 'configured NIC identity differs');
    require(Object.keys(ipConfig).every((key) => ipFields.includes(key)), 'unqualified IP configuration field');
    for (const side of [before, after]) {
      require(lower(side.id) === lower(identity.resourceId) &&
        side.name === `${plan.deploymentName}-${stage.node}-nic${nic.index}` &&
        side.resource_group_name === plan.intent.resourceGroup &&
        lower(side.location) === lower(plan.region) &&
        lower(side.mac_address).replaceAll('-', ':') === identity.mac &&
        lower(side.virtual_machine_id) === lower(vm.resourceId), 'NIC, MAC or attachment identity differs');
      const tags = object(side.tags);
      require(tags['xcsh-managed-by'] === 'azure-ce' &&
        tags['xcsh-execution-engine'] === 'terraform' &&
        tags['xcsh-deployment-id'] === plan.deploymentName &&
        tags['xcsh-plan-sha256'] === identity.ownerPlanSha256 &&
        same(tags, configured.tags), 'NIC owner differs');
      require(side['ip_configuration.length'] === 1 &&
        side[ip('name')] === identity.ipConfigurationName &&
        side[ip('primary')] === true &&
        side[ip('private_ip_address_allocation')] === identity.allocation &&
        side[ip('private_ip_address_version')] === 'IPv4', 'single IPv4 IP configuration identity differs');
      require(typeof side.accelerated_networking_enabled === 'boolean' &&
        typeof side.ip_forwarding_enabled === 'boolean' &&
        Array.isArray(side.dns_servers) &&
        (side.dns_servers as unknown[]).every((value) => typeof value === 'string') &&
        ['auxiliary_mode', 'auxiliary_sku', 'edge_zone', 'internal_dns_name_label'].every(
          (key) => side[key] === null || typeof side[key] === 'string',
        ), 'malformed configurable NIC fields');
      const timeouts = side.timeouts;
      require(timeouts === null ||
        Object.keys(object(timeouts)).every(
          (key) =>
            ['create', 'delete', 'read', 'update'].includes(key) &&
            (object(timeouts)[key] === null || typeof object(timeouts)[key] === 'string'),
        ), 'unqualified timeouts');
      for (const key of ['gateway_load_balancer_frontend_ip_configuration_id', 'public_ip_address_id'])
        require(side[ip(key)] === null ||
          side[ip(key)] === '' ||
          resourceId(side[ip(key)]), 'unresolved configured resource reference');
    }
    require(lower(before[ip('subnet_id')]) === lower(identity.subnetId) &&
      lower(after[ip('subnet_id')]) === lower(identity.targetSubnetId), 'approved subnet transition differs');
    require(before[ip('private_ip_address')] === identity.privateIp, 'prior private IP differs');
    if (Object.hasOwn(after, ip('private_ip_address')))
      require(after[ip('private_ip_address')] === identity.privateIp, 'retained private IP differs');
    else
      require(identity.allocation === 'Dynamic' &&
        (ipConfig.private_ip_address === undefined ||
          ipConfig.private_ip_address === null ||
          ipConfig.private_ip_address === ''), 'moving dynamic IP cannot be an execution input');
    for (const path of selections.proposed[address])
      if (path !== ip('subnet_id'))
        require(same(before[path], after[path]), 'unauthorized configurable or identity delta');
    // Explicit configurable values are execution inputs; provider defaults remain
    // bound by equality rather than guessed from documentation.
    for (const key of roots.filter((key) => !['id', 'name', 'resource_group_name', 'location'].includes(key)))
      if (configured[key] !== undefined && configured[key] !== null)
        require(resolved(configured[key]) &&
          same(after[key], configured[key]), 'configured root value differs or is unresolved');
    for (const key of ipFields)
      if (
        ipConfig[key] !== undefined &&
        ipConfig[key] !== null &&
        !(key === 'private_ip_address' && identity.allocation === 'Dynamic')
      )
        require(resolved(reference(ipConfig[key])) &&
          same(after[ip(key)], reference(ipConfig[key])), 'configured IP value differs or is unresolved');
  }
}
