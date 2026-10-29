import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import type { AzureCePlan } from './types';

export interface AzureNetworkUpdateTerraformStage {
  node: number;
  previousConfigurationSha256: string;
  configurationSha256: string;
  configuration: string;
  addresses: string[];
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const require = (condition: unknown, message: string) => {
  if (!condition) throw Error(`Azure Terraform network update: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed retained configuration');
  return value as Record<string, unknown>;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);

/** Transform only one node's NIC subnet references and corresponding identity outputs.
 * The executor must separately qualify the complete original/network/replacement source history before using it.
 */
export function buildAzureNetworkUpdateTerraformStage(
  plan: AzureCePlan,
  source: string,
  inventory: AzureNetworkUpdateInventory,
  node: number,
): AzureNetworkUpdateTerraformStage {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require(plan.engine === 'terraform' &&
    Number.isInteger(node) &&
    node >= 1 &&
    node <= plan.topology.nodeCount, 'exact Terraform node required');
  let original: Record<string, unknown>;
  try {
    original = object(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform network update: malformed retained source JSON');
  }
  const next = structuredClone(original),
    resources = object(next.resource),
    providers = object(next.provider),
    provider = object(providers.azurerm);
  require(lower(provider.subscription_id) === lower(plan.subscription.id) &&
    lower(provider.tenant_id) === lower(plan.subscription.tenantId), 'retained provider account differs');
  const named = (value: unknown, type: string): string => {
    require(typeof value === 'string', 'resource name is unresolved');
    const match = /^\$\{([a-z0-9_]+)\.([a-z0-9_]+)\.name\}$/.exec(value as string);
    if (!match) {
      require(!(value as string).includes('${'), 'resource name expression is unresolved');
      return value as string;
    }
    require(match[1] === type, 'resource name references another type');
    const name = object(object(resources[type])[match[2]]).name;
    require(typeof name === 'string' && !name.includes('${'), 'resource name reference is unresolved');
    return name as string;
  };
  const subnet = (value: unknown): { id: string; cidr?: string } => {
    require(typeof value === 'string', 'NIC subnet reference is unavailable');
    const match = /^\$\{azurerm_subnet\.([a-z0-9_]+)\.id\}$/.exec(value as string);
    if (!match) {
      require(!(value as string).includes('${'), 'NIC subnet expression is unresolved');
      return { id: value as string };
    }
    const row = object(object(resources.azurerm_subnet)[match[1]]);
    require(Array.isArray(row.address_prefixes) &&
      row.address_prefixes.length === 1 &&
      typeof row.address_prefixes[0] === 'string', 'retained subnet address is unresolved');
    const group = named(row.resource_group_name, 'azurerm_resource_group'),
      vnet = named(row.virtual_network_name, 'azurerm_virtual_network');
    require(typeof row.name === 'string' && !row.name.includes('${'), 'retained subnet name is unresolved');
    return {
      id: `/subscriptions/${plan.subscription.id}/resourceGroups/${group}/providers/Microsoft.Network/virtualNetworks/${vnet}/subnets/${row.name}`,
      cidr: (row.address_prefixes as string[])[0],
    };
  };
  const tags = (value: unknown, owner: string) => {
    const row = object(value);
    require(row['xcsh-managed-by'] === 'azure-ce' &&
      row['xcsh-execution-engine'] === 'terraform' &&
      row['xcsh-deployment-id'] === plan.deploymentName &&
      row['xcsh-plan-sha256'] === owner, 'retained resource owner differs');
  };
  const interfaces = object(resources.azurerm_network_interface),
    vms = object(resources.azurerm_linux_virtual_machine);
  const output = object(object(object(next.output).ce_interfaces).value),
    addresses: string[] = [];
  for (const [key, owner] of Object.entries(inventory.nodes)) {
    const vm = object(vms[`node_${key}`]);
    require(named(vm.name, 'azurerm_linux_virtual_machine') === `${plan.deploymentName}-${key}` &&
      named(vm.resource_group_name, 'azurerm_resource_group') === plan.intent.resourceGroup &&
      lower(vm.location) === lower(plan.region), 'retained VM scope differs');
    tags(vm.tags, owner.ownerPlanSha256);
    const attached = plan.nics.map((nic) => `\${azurerm_network_interface.node_${key}_nic_${nic.index}.id}`);
    require(same(vm.network_interface_ids, attached), 'retained VM NIC graph differs');
    for (const [index, identity] of Object.entries(owner.nics)) {
      const address = `node_${key}_nic_${index}`,
        nic = object(interfaces[address]);
      require(named(nic.name, 'azurerm_network_interface') === `${plan.deploymentName}-${key}-nic${index}` &&
        named(nic.resource_group_name, 'azurerm_resource_group') === plan.intent.resourceGroup &&
        lower(nic.location) === lower(plan.region), 'retained NIC resource differs');
      tags(nic.tags, identity.ownerPlanSha256);
      require(Array.isArray(nic.ip_configuration) &&
        nic.ip_configuration.length === 1, 'retained single IP configuration required');
      const config = object((nic.ip_configuration as unknown[])[0]),
        beforeSubnet = subnet(config.subnet_id);
      require(config.name === identity.ipConfigurationName &&
        config.primary === true &&
        config.private_ip_address_allocation === identity.allocation &&
        lower(beforeSubnet.id) === lower(identity.subnetId) &&
        (!beforeSubnet.cidr || beforeSubnet.cidr === identity.subnetCidr) &&
        (identity.allocation !== 'Static' ||
          config.private_ip_address === identity.privateIp), 'retained IP configuration differs');
      const exported = object(output[`${key}:${index}`]);
      require(exported.node === Number(key) &&
        exported.index === Number(index) &&
        exported.role === plan.nics.find((nic) => nic.index === Number(index))?.role &&
        exported.site_name === plan.siteName &&
        exported.id === `\${azurerm_network_interface.${address}.id}` &&
        same(exported.subnet_id, config.subnet_id), 'retained interface output identity differs');
      if (Number(key) === node) {
        config.subnet_id = identity.targetSubnetId;
        exported.subnet_id = identity.targetSubnetId;
        addresses.push(`azurerm_network_interface.${address}`);
      }
    }
  }
  const configuration = JSON.stringify(next);
  return {
    node,
    previousConfigurationSha256: hash(source),
    configurationSha256: hash(configuration),
    configuration,
    addresses,
  };
}

/** An exact saved plan may update the selected node's NICs; VM interruption is handled by separate owning power stages. */
export function validateAzureNetworkUpdateTerraformReceipt(
  plan: AzureCePlan,
  stage: AzureNetworkUpdateTerraformStage,
  receipt: PlanReceipt,
  providerLockSha256: string,
): void {
  verifyAzureCePlan(plan);
  require(stage &&
    typeof stage === 'object' &&
    !Array.isArray(stage) &&
    same(Object.keys(stage).sort(), [
      'addresses',
      'configuration',
      'configurationSha256',
      'node',
      'previousConfigurationSha256',
    ]) &&
    typeof stage.configuration === 'string' &&
    Array.isArray(stage.addresses), 'malformed stage schema');
  require(receipt &&
    typeof receipt === 'object' &&
    !Array.isArray(receipt) &&
    Object.keys(receipt).every((key) =>
      [
        'schemaVersion',
        'deploymentId',
        'engine',
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
    ), 'malformed receipt schema');
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    stage.configurationSha256 === hash(stage.configuration) &&
    /^[a-f0-9]{64}$/.test(stage.previousConfigurationSha256) &&
    Number.isInteger(stage.node) &&
    stage.node >= 1 &&
    stage.node <= plan.topology.nodeCount &&
    same(
      stage.addresses.toSorted(),
      plan.nics.map((nic) => `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`).toSorted(),
    ), 'immutable stage identity differs');
  require(receipt.schemaVersion === 1 &&
    receipt.deploymentId === plan.deploymentName &&
    receipt.engine === 'terraform' &&
    receipt.backendIdentity === `local:${plan.deploymentName}` &&
    receipt.configurationSha256 === stage.configurationSha256 &&
    /^[a-f0-9]{64}$/.test(providerLockSha256) &&
    receipt.providerLockSha256 === providerLockSha256 &&
    /^[a-f0-9]{64}$/.test(receipt.planSha256) &&
    receipt.operation === undefined &&
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].every(
      (value) => value === undefined || (Array.isArray(value) && value.length === 0),
    ) &&
    Array.isArray(receipt.changes) &&
    typeof receipt.noChanges === 'boolean', 'saved Terraform scope or provider lock differs');
  let configuration: Record<string, unknown>;
  try {
    configuration = object(JSON.parse(stage.configuration));
  } catch {
    throw Error('Azure Terraform network update: malformed stage JSON');
  }
  const resources = object(configuration.resource);
  const interfaces = object(resources.azurerm_network_interface);
  const output = object(object(object(configuration.output).ce_interfaces).value);
  // Resolve selected subnet/output joins even when receipt hashes match.
  // Complete source provenance remains a separate owning-executor requirement.
  for (const nic of plan.nics) {
    const key = `node_${stage.node}_nic_${nic.index}`;
    const selected = object(interfaces[key]);
    const changes = plan.actions.filter(
      (action) =>
        action.kind === 'nic-update' &&
        action.node === stage.node &&
        lower(action.resourceId).endsWith(
          `/networkinterfaces/${plan.deploymentName}-${stage.node}-nic${nic.index}`.toLowerCase(),
        ),
    );
    require(changes.length === 1, 'selected public NIC identity differs');
    const args = changes[0].args ?? [];
    const target = args[args.indexOf('--subnet') + 1];
    require(typeof target === 'string' &&
      /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^/]+\/subnets\/[^/]+$/i.test(
        target,
      ), 'resolved selected subnet required');
    require(Array.isArray(selected.ip_configuration) &&
      selected.ip_configuration.length === 1, 'single selected NIC IP configuration required');
    const ip = object((selected.ip_configuration as unknown[])[0]);
    const row = object(output[`${stage.node}:${nic.index}`]);
    require(lower(ip.subnet_id) === lower(target) &&
      row.node === stage.node &&
      row.index === nic.index &&
      row.role === nic.role &&
      row.site_name === plan.siteName &&
      row.id === `\${azurerm_network_interface.${key}.id}` &&
      same(row.subnet_id, ip.subnet_id), 'selected subnet or output identity differs');
  }
  const seen = new Set<string>();
  for (const change of receipt.changes) {
    require(change && typeof change === 'object' && !Array.isArray(change), 'malformed planned resource change');
    const match =
      typeof change.address === 'string' ? /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(change.address) : null;
    require(match &&
      change.type === match[1] &&
      object(resources[match[1]])[match[2]] !== undefined, 'planned resource is outside retained configuration');
    require(typeof change.address === 'string' &&
      !seen.has(change.address) &&
      typeof change.type === 'string' &&
      Array.isArray(change.actions) &&
      change.actions.length === 1 &&
      (change.actions[0] === 'no-op' ||
        (stage.addresses.includes(change.address) &&
          change.type === 'azurerm_network_interface' &&
          change.actions[0] === 'update')), 'saved plan changes an unauthorized resource');
    const row = change as unknown as Record<string, unknown>;
    require(same(Object.keys(row).sort(), [
      'actions',
      'address',
      'type',
    ]), 'saved plan contains unresolved import/replacement metadata');
    seen.add(change.address);
  }
  require(receipt.noChanges ===
    receipt.changes.every((change) => change.actions[0] === 'no-op'), 'no-change claim differs from planned effects');
}
