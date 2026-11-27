import { isIP } from 'node:net';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual } from './canonical';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCeAction, AzureCePlan } from './types';

export interface AzureNetworkUpdateNic {
  resourceId: string;
  ownerPlanSha256: string;
  mac: string;
  ipConfigurationId: string;
  ipConfigurationName: string;
  allocation: 'Dynamic' | 'Static';
  privateIp: string;
  subnetId: string;
  subnetCidr: string;
  targetSubnetId: string;
  targetSubnetCidr: string;
}
export interface AzureNetworkUpdateNode {
  resourceId: string;
  vmId: string;
  ownerPlanSha256: string;
  nics: Record<string, AzureNetworkUpdateNic>;
}
export interface AzureNetworkUpdateInventory {
  schemaVersion: 1;
  engine: 'native' | 'terraform';
  planSha256: string;
  collectedAt: string;
  nodes: Record<string, AzureNetworkUpdateNode>;
}
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure network update identity: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed cloud record');
  return value as Record<string, unknown>;
};
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const same = canonicalEqual;
const mac = (value: unknown) =>
  typeof value === 'string' &&
  /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(value) &&
  (Number.parseInt(value.slice(0, 2), 16) & 1) === 0 &&
  value !== '00:00:00:00:00:00';
// These operands are freshly generated string arrays, so key equality needs no
// serializer or generic exotic-value inspection. Object shape checks stay exact.
const exactKeys = (value: unknown, names: string[]) => {
  const keys = Object.keys(object(value)).sort(),
    expected = names.toSorted();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
};
const number = (value: string) => value.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
export function usableAzureNetworkAddress(address: unknown, cidr: unknown): boolean {
  if (typeof address !== 'string' || isIP(address) !== 4 || typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const size = 2 ** (32 - Number(prefix));
  return (
    size >= 8 &&
    number(network) % size === 0 &&
    number(address) > number(network) + 3 &&
    number(address) < number(network) + size - 1
  );
}
function usableSubnet(cidr: unknown): boolean {
  if (typeof cidr !== 'string') return false;
  const [network, prefix, extra] = cidr.split('/');
  if (extra !== undefined || isIP(network) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix)) return false;
  const size = 2 ** (32 - Number(prefix));
  return size >= 8 && number(network) % size === 0;
}
export const azureNetworkIpConfigurationReference = (node: number, index: number) =>
  `__NODE_${node}_NIC_${index}_IPCONFIG_NAME__`;
function subnetVnet(id: unknown, plan: AzureCePlan): string {
  require(typeof id === 'string' &&
    /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^/]+\/subnets\/[^/]+$/i.test(
      id,
    ) &&
    lower(id).startsWith(
      `/subscriptions/${plan.subscription.id}/`.toLowerCase(),
    ), 'concrete same-subscription subnet identity required');
  return (id as string).slice(0, (id as string).toLowerCase().lastIndexOf('/subnets/'));
}
function argument(action: AzureCeAction, flag: string): string {
  const args = action.args ?? [],
    index = args.indexOf(flag);
  require(index >= 0 &&
    args.lastIndexOf(flag) === index &&
    typeof args[index + 1] === 'string' &&
    !args[index + 1].startsWith('--'), `exact ${flag} argument required`);
  return args[index + 1];
}
function actions(plan: AzureCePlan, node: number, verifiedSnapshot = false) {
  if (!verifiedSnapshot) verifyAzureCePlan(plan);
  // Only the private digest-verified plain snapshot uses the flat string-vector
  // comparison. Callback-facing collection retains the generic equality contract.
  const matchArgs = (actual: unknown, expected: string[]) =>
    verifiedSnapshot && Array.isArray(actual)
      ? actual.length === expected.length && expected.every((value, index) => actual[index] === value)
      : same(actual, expected);
  require(plan.intent.operation === 'update-network', 'network-update plan required');
  const vm = plan.actions.filter((a) => a.kind === 'vm-deallocate' && a.node === node);
  const nics = plan.actions.filter((a) => a.kind === 'nic-update' && a.node === node);
  const expectedVm = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`;
  require(vm.length === 1 &&
    lower(vm[0].resourceId) === lower(expectedVm) &&
    sha(vm[0].expectedOwnerPlanSha256) &&
    nics.length === plan.nics.length, 'complete planned VM/NIC owner scope required');
  const starts = plan.actions.filter((action) => action.kind === 'vm-start' && action.node === node);
  require(starts.length === 1 &&
    lower(starts[0].resourceId) === lower(expectedVm) &&
    starts[0].expectedOwnerPlanSha256 === vm[0].expectedOwnerPlanSha256, 'complete retained VM restart scope required');
  for (const action of [vm[0], starts[0]])
    require(action.command === 'az' &&
      action.mutates === true &&
      matchArgs(action.args, [
        'vm',
        action.kind === 'vm-start' ? 'start' : 'deallocate',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        `${plan.deploymentName}-${node}`,
        '--subscription',
        plan.subscription.id,
      ]), 'VM command differs from its owned identity');
  for (const nic of plan.nics) {
    const id = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-${node}-nic${nic.index}`;
    const matches = nics.filter((a) => lower(a.resourceId) === lower(id));
    require(matches.length === 1 && sha(matches[0].expectedOwnerPlanSha256), 'unique planned NIC owner required');
    const target = argument(matches[0], '--subnet');
    subnetVnet(target, plan);
    const expectedTarget =
      nic.subnet.resourceId ??
      `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet/subnets/${nic.subnet.name}`;
    require(lower(target) === lower(expectedTarget), 'target subnet differs from saved intent');
    require(matches[0].command === 'az' &&
      matches[0].mutates === true &&
      matchArgs(matches[0].args, [
        'network',
        'nic',
        'ip-config',
        'update',
        '--resource-group',
        plan.intent.resourceGroup,
        '--nic-name',
        `${plan.deploymentName}-${node}-nic${nic.index}`,
        '--name',
        argument(matches[0], '--name'),
        '--subnet',
        target,
        '--subscription',
        plan.subscription.id,
      ]), 'NIC command differs from its owned identity');
  }
  return { vm: vm[0], nics };
}
function owned(plan: AzureCePlan, row: Record<string, unknown>, owner: string) {
  const tags = object(row.tags);
  require(tags['xcsh-managed-by'] === 'azure-ce' &&
    tags['xcsh-execution-engine'] === plan.engine &&
    tags['xcsh-deployment-id'] === plan.deploymentName &&
    tags['xcsh-plan-sha256'] === owner, 'foreign cloud owner or engine');
}
async function azJson(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const response = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  require(response.exitCode === 0, 'cloud observation unavailable');
  let value: unknown;
  try {
    value = JSON.parse(response.stdout);
  } catch {
    throw Error('Azure network update identity: malformed cloud JSON');
  }
  if (value && typeof value === 'object' && !Array.isArray(value))
    require(!['nextLink', 'error', 'errors'].some((key) => object(value)[key]), 'partial or failed cloud observation');
  return value;
}

/** Cloud collection time is receipt metadata, never a CE heartbeat or publication timestamp. */
export async function captureAzureNetworkUpdateInventory(
  plan: AzureCePlan,
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<AzureNetworkUpdateInventory> {
  verifyAzureCePlan(plan);
  const binding = azureUpgradeBinding(plan);
  for (let node = 1; node <= plan.topology.nodeCount; node++) actions(plan, node);
  const account = object(await azJson(api, ['account', 'show', '--subscription', plan.subscription.id], signal));
  require(lower(account.id) === lower(plan.subscription.id) &&
    lower(account.tenantId) === lower(plan.subscription.tenantId) &&
    account.environmentName === plan.subscription.cloud &&
    account.state === 'Enabled', 'active account identity differs');
  const rawVms = await azJson(
    api,
    [
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--show-details',
    ],
    signal,
  );
  require(Array.isArray(rawVms), 'complete VM inventory required');
  const vms = (rawVms as unknown[]).map(object);
  const subnets = new Map<string, string>(),
    vnets = new Map<string, Record<string, unknown>>();
  const subnet = async (id: string): Promise<string> => {
    const key = lower(id);
    if (subnets.has(key)) return subnets.get(key) as string;
    const value = object(
      await azJson(
        api,
        ['network', 'vnet', 'subnet', 'show', '--ids', id, '--subscription', plan.subscription.id],
        signal,
      ),
    );
    const prefixes = [
      value.addressPrefix,
      ...(Array.isArray(value.addressPrefixes) ? value.addressPrefixes : []),
    ].filter((prefix): prefix is string => typeof prefix === 'string' && isIP(prefix.split('/')[0]) === 4);
    require(lower(value.id) === key &&
      value.provisioningState === 'Succeeded' &&
      new Set(prefixes).size === 1, 'target or source subnet unavailable/ambiguous');
    const prefix = prefixes[0];
    require(usableSubnet(prefix), 'usable IPv4 subnet required');
    subnets.set(key, prefix);
    return prefix;
  };
  const nodes: Record<string, AzureNetworkUpdateNode> = {};
  for (const [index, name] of binding.nodes.entries()) {
    const node = index + 1,
      planned = actions(plan, node),
      matches = vms.filter((vm) => lower(vm.id) === lower(planned.vm.resourceId));
    require(matches.length === 1, 'VM identity missing or duplicate');
    const vm = matches[0];
    owned(plan, vm, planned.vm.expectedOwnerPlanSha256 as string);
    require(vm.name === name &&
      lower(vm.location) === lower(plan.region) &&
      vm.provisioningState === 'Succeeded' &&
      uuid(vm.vmId) &&
      lower(object(vm.hardwareProfile).vmSize) === lower(plan.vm.size), 'VM generation or configuration differs');
    const attached = object(vm.networkProfile).networkInterfaces;
    require(Array.isArray(attached) &&
      same(
        (attached as unknown[]).map((item) => lower(object(item).id)).sort(),
        planned.nics.map((nic) => lower(nic.resourceId)).sort(),
      ), 'complete exact VM/NIC attachment required');
    const nics: Record<string, AzureNetworkUpdateNic> = {};
    for (const nic of plan.nics) {
      const action = planned.nics.find((a) => lower(a.resourceId).endsWith(`-nic${nic.index}`)) as AzureCeAction;
      const id = action.resourceId as string;
      const value = object(
        await azJson(api, ['network', 'nic', 'show', '--ids', id, '--subscription', plan.subscription.id], signal),
      );
      owned(plan, value, action.expectedOwnerPlanSha256 as string);
      require(lower(value.id) === lower(id) &&
        lower(value.location) === lower(plan.region) &&
        value.provisioningState === 'Succeeded' &&
        lower(object(value.virtualMachine).id) === lower(vm.id), 'NIC identity or VM attachment differs');
      require(Array.isArray(value.ipConfigurations) &&
        value.ipConfigurations.length === 1, 'one authoritative IP configuration required');
      const config = object((value.ipConfigurations as unknown[])[0]);
      const configName = config.name;
      require(typeof configName === 'string' &&
        /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(configName) &&
        lower(config.id) === lower(`${id}/ipConfigurations/${configName}`) &&
        config.primary === true &&
        config.provisioningState === 'Succeeded' &&
        config.privateIPAddressVersion === 'IPv4' &&
        ['Dynamic', 'Static'].includes(
          String(config.privateIPAllocationMethod),
        ), 'complete IP configuration identity/state required');
      const sourceId = object(config.subnet).id,
        targetId = argument(action, '--subnet');
      const vnetId = subnetVnet(sourceId, plan);
      require(lower(vnetId) === lower(subnetVnet(targetId, plan)), 'retained NIC subnet update requires the same VNet');
      if (!vnets.has(lower(vnetId)))
        vnets.set(
          lower(vnetId),
          object(
            await azJson(
              api,
              ['network', 'vnet', 'show', '--ids', vnetId, '--subscription', plan.subscription.id],
              signal,
            ),
          ),
        );
      const vnet = vnets.get(lower(vnetId)) as Record<string, unknown>;
      require(lower(vnet.id) === lower(vnetId) &&
        lower(vnet.location) === lower(plan.region) &&
        vnet.provisioningState === 'Succeeded', 'VNet identity or readiness differs');
      const approved = plan.intent.brownfield.resourceIds.some((id) =>
        [vnetId, String(sourceId), targetId].some((candidate) => lower(candidate) === lower(id)),
      );
      if (!approved) owned(plan, vnet, action.expectedOwnerPlanSha256 as string);
      const sourceCidr = await subnet(String(sourceId)),
        targetCidr = await subnet(targetId);
      require(usableAzureNetworkAddress(
        config.privateIPAddress,
        sourceCidr,
      ), 'source private address is outside usable subnet');
      require(!nic.subnet.cidr || nic.subnet.cidr === targetCidr, 'target subnet CIDR differs from saved intent');
      require(config.privateIPAllocationMethod !== 'Static' ||
        usableAzureNetworkAddress(
          config.privateIPAddress,
          targetCidr,
        ), 'static address cannot be retained in the target subnet');
      nics[String(nic.index)] = {
        resourceId: id,
        ownerPlanSha256: action.expectedOwnerPlanSha256 as string,
        mac: lower(value.macAddress).replaceAll('-', ':'),
        ipConfigurationId: String(config.id),
        ipConfigurationName: String(configName),
        allocation: config.privateIPAllocationMethod as 'Dynamic' | 'Static',
        privateIp: String(config.privateIPAddress),
        subnetId: String(sourceId),
        subnetCidr: sourceCidr,
        targetSubnetId: targetId,
        targetSubnetCidr: targetCidr,
      };
    }
    nodes[String(node)] = {
      resourceId: planned.vm.resourceId as string,
      vmId: String(vm.vmId),
      ownerPlanSha256: planned.vm.expectedOwnerPlanSha256 as string,
      nics,
    };
  }
  const inventory: AzureNetworkUpdateInventory = {
    schemaVersion: 1,
    engine: plan.engine,
    planSha256: plan.planSha256,
    collectedAt: new Date().toISOString(),
    nodes,
  };
  validateAzureNetworkUpdateInventory(plan, inventory);
  return inventory;
}

/** Validate historical identity metadata without claiming it is a current cloud or CE observation. */
export function validateAzureNetworkUpdateInventory(plan: AzureCePlan, value: unknown): AzureNetworkUpdateInventory {
  const snapshot = structuredClone(plan);
  verifyAzureCePlan(snapshot);
  const result = validateInventorySnapshot(snapshot, value, new Map());
  require(same(plan, snapshot), 'plan changed during inventory validation');
  return result;
}

// The snapshot and its derived action scopes are private to one synchronous call.
// No qualification is reused across callbacks, public calls or cloud observations.
function validateInventorySnapshot(
  plan: AzureCePlan,
  value: unknown,
  scopes: Map<string, ReturnType<typeof actions>>,
): AzureNetworkUpdateInventory {
  const row = object(value);
  require(exactKeys(row, ['schemaVersion', 'engine', 'planSha256', 'collectedAt', 'nodes']) &&
    row.schemaVersion === 1 &&
    row.engine === plan.engine &&
    row.planSha256 === plan.planSha256 &&
    typeof row.collectedAt === 'string' &&
    Number.isFinite(Date.parse(row.collectedAt)) &&
    Date.parse(row.collectedAt) <= Date.now() + 60_000, 'inventory plan or schema differs');
  const nodes = object(row.nodes),
    expectedNodes = Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1));
  require(exactKeys(nodes, expectedNodes), 'complete node inventory required');
  const usedIds = new Set<string>(),
    usedMacs = new Set<string>(),
    usedIps = new Set<string>();
  for (const key of expectedNodes) {
    const node = object(nodes[key]);
    let planned = scopes.get(key);
    if (!planned) {
      planned = actions(plan, Number(key), true);
      scopes.set(key, planned);
    }
    require(exactKeys(node, ['resourceId', 'vmId', 'ownerPlanSha256', 'nics']) &&
      lower(node.resourceId) === lower(planned.vm.resourceId) &&
      node.ownerPlanSha256 === planned.vm.expectedOwnerPlanSha256 &&
      uuid(node.vmId) &&
      !usedIds.has(lower(node.vmId)), 'VM owner/UUID scope differs or duplicates');
    usedIds.add(lower(node.vmId));
    const nics = object(node.nics);
    require(exactKeys(
      nics,
      plan.nics.map((nic) => String(nic.index)),
    ), 'complete ordered NIC inventory required');
    for (const nic of plan.nics) {
      const state = object(nics[String(nic.index)]),
        action = planned.nics.find((a) => lower(a.resourceId).endsWith(`-nic${nic.index}`)) as AzureCeAction;
      const ipKey = `${lower(state.subnetId)}:${state.privateIp}`;
      require(exactKeys(state, [
        'resourceId',
        'ownerPlanSha256',
        'mac',
        'ipConfigurationId',
        'ipConfigurationName',
        'allocation',
        'privateIp',
        'subnetId',
        'subnetCidr',
        'targetSubnetId',
        'targetSubnetCidr',
      ]) &&
        lower(state.resourceId) === lower(action.resourceId) &&
        state.ownerPlanSha256 === action.expectedOwnerPlanSha256 &&
        mac(state.mac) &&
        !usedMacs.has(String(state.mac)) &&
        !usedIps.has(ipKey) &&
        typeof state.ipConfigurationName === 'string' &&
        /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(state.ipConfigurationName) &&
        lower(state.ipConfigurationId) ===
          lower(`${action.resourceId}/ipConfigurations/${state.ipConfigurationName}`) &&
        ['Dynamic', 'Static'].includes(String(state.allocation)) &&
        usableAzureNetworkAddress(state.privateIp, state.subnetCidr) &&
        lower(state.targetSubnetId) ===
          lower(argument(action, '--subnet')), 'NIC/IP configuration identity differs or duplicates');
      require(lower(subnetVnet(state.subnetId, plan)) === lower(subnetVnet(state.targetSubnetId, plan)) &&
        typeof state.targetSubnetCidr === 'string' &&
        (!nic.subnet.cidr || nic.subnet.cidr === state.targetSubnetCidr), 'subnet/VNet target differs');
      require(usableSubnet(state.targetSubnetCidr) &&
        (state.allocation !== 'Static' ||
          usableAzureNetworkAddress(state.privateIp, state.targetSubnetCidr)), 'target address scope differs');
      usedMacs.add(String(state.mac));
      usedIps.add(ipKey);
    }
  }
  return value as AzureNetworkUpdateInventory;
}

/** Resolve the real configuration name from a validated owner inventory, without changing the saved plan. */
export function azureNetworkUpdateResolvedArguments(
  plan: AzureCePlan,
  action: AzureCeAction,
  value: AzureNetworkUpdateInventory,
): string[] {
  const inventory = validateAzureNetworkUpdateInventory(plan, value);
  const candidates = plan.actions.filter((row) => row.id === action.id);
  require(candidates.length === 1 &&
    same(candidates[0], action) &&
    action.kind === 'nic-update' &&
    Number.isInteger(action.node), 'exact saved NIC update action required');
  const node = inventory.nodes[String(action.node)];
  const state = Object.values(node.nics).find((nic) => lower(nic.resourceId) === lower(action.resourceId));
  require(state, 'saved NIC action is unresolved');
  const args = [...(action.args ?? [])],
    nameIndex = args.indexOf('--name');
  require(nameIndex >= 0 && args.lastIndexOf('--name') === nameIndex, 'one IP configuration name argument required');
  const index = Object.entries(node.nics).find(([, nic]) => nic === state)?.[0];
  require(index !== undefined &&
    (args[nameIndex + 1] === (state as AzureNetworkUpdateNic).ipConfigurationName ||
      args[nameIndex + 1] ===
        azureNetworkIpConfigurationReference(
          action.node as number,
          Number(index),
        )), 'saved configuration name is not the observed identity or exact deferred reference');
  args[nameIndex + 1] = (state as AzureNetworkUpdateNic).ipConfigurationName;
  require(args.every((arg) => !/^__.*__$/.test(arg)), 'execution identifiers remain unresolved');
  return args;
}

/** Match each stage to the original identity; only explicitly selected NICs may reach their target subnet. */
export function verifyAzureNetworkUpdateProgress(
  plan: AzureCePlan,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  applied: string[],
): void {
  const request = plan;
  plan = structuredClone(plan);
  verifyAzureCePlan(plan);
  const scopes = new Map<string, ReturnType<typeof actions>>();
  validateInventorySnapshot(plan, before, scopes);
  validateInventorySnapshot(plan, current, scopes);
  require(new Set(applied).size === applied.length &&
    applied.every(
      (key) => /^\d+:\d+$/.test(key) && before.nodes[key.split(':')[0]]?.nics[key.split(':')[1]],
    ), 'applied NIC stage scope differs');
  for (const [key, node] of Object.entries(before.nodes)) {
    const observed = current.nodes[key];
    require(same(
      { resourceId: node.resourceId, vmId: node.vmId, ownerPlanSha256: node.ownerPlanSha256 },
      { resourceId: observed.resourceId, vmId: observed.vmId, ownerPlanSha256: observed.ownerPlanSha256 },
    ), 'VM identity changed during subnet update');
    for (const [index, nic] of Object.entries(node.nics)) {
      const now = observed.nics[index];
      require([
        'resourceId',
        'ownerPlanSha256',
        'mac',
        'ipConfigurationId',
        'ipConfigurationName',
        'allocation',
        'targetSubnetId',
        'targetSubnetCidr',
      ].every(
        (field) =>
          lower(nic[field as keyof AzureNetworkUpdateNic]) === lower(now[field as keyof AzureNetworkUpdateNic]),
      ), 'retained NIC/configuration identity changed');
      const changed = applied.includes(`${key}:${index}`);
      require(lower(now.subnetId) === lower(changed ? nic.targetSubnetId : nic.subnetId) &&
        now.subnetCidr === (changed ? nic.targetSubnetCidr : nic.subnetCidr) &&
        (nic.allocation !== 'Static' ||
          now.privateIp === nic.privateIp), 'NIC reached an unauthorized subnet/address stage');
    }
  }
  require(same(request, plan), 'plan changed during progress validation');
}

/** Reconstruct the authorized subnet boundary from the durable public action prefix.
 * A pending NIC request permits only that NIC's before/after subnet, never a different identity.
 */
export function azureNetworkUpdateAppliedNics(
  plan: AzureCePlan,
  completed: string[],
  current: AzureNetworkUpdateInventory,
  pendingActionId?: string,
): string[] {
  validateAzureNetworkUpdateInventory(plan, current);
  require(same(
    completed,
    plan.actions.slice(0, completed.length).map((action) => action.id),
  ), 'complete ordered public action prefix required');
  const pending = pendingActionId === undefined ? undefined : plan.actions[completed.length];
  require(pendingActionId === undefined ||
    pending?.id === pendingActionId, 'pending public action is outside the next boundary');
  const selected = plan.actions.filter(
    (action) => action.kind === 'nic-update' && (completed.includes(action.id) || action.id === pendingActionId),
  );
  const applied: string[] = [];
  for (const action of selected) {
    const entries = Object.entries(current.nodes[String(action.node)].nics).filter(
      ([, nic]) => lower(nic.resourceId) === lower(action.resourceId),
    );
    require(entries.length === 1, 'public action NIC is unresolved');
    const [index, nic] = entries[0];
    if (completed.includes(action.id) || lower(nic.subnetId) === lower(nic.targetSubnetId))
      applied.push(`${action.node}:${index}`);
  }
  return applied;
}

export interface AzureNativeNetworkUpdateSource {
  originalPlanSha256: string;
  siteUid: string;
  siteConfigurationSha256: string;
  generationPlanSha256s: string[];
  networkHistoryPlanSha256s: string[];
}
export interface AzureNativeNetworkUpdateCheckpoint {
  source?: AzureNativeNetworkUpdateSource;
  before: AzureNetworkUpdateInventory;
  current: AzureNetworkUpdateInventory;
}

/** Validate a frozen source and current receipt without treating either as live telemetry. */
export function validateAzureNativeNetworkUpdateCheckpoint(
  plan: AzureCePlan,
  value: unknown,
  completed: string[],
  pendingActionId?: string,
): AzureNativeNetworkUpdateCheckpoint {
  const row = object(value);
  require(plan.engine === 'native' &&
    exactKeys(row, [
      'before',
      'current',
      ...(row.source !== undefined ? ['source'] : []),
    ]), 'native network checkpoint schema differs');
  if (row.source !== undefined) {
    const source = object(row.source);
    require(exactKeys(source, [
      'originalPlanSha256',
      'siteUid',
      'siteConfigurationSha256',
      'generationPlanSha256s',
      'networkHistoryPlanSha256s',
    ]) &&
      sha(source.originalPlanSha256) &&
      sha(source.siteConfigurationSha256) &&
      typeof source.siteUid === 'string' &&
      Boolean(source.siteUid.trim()) &&
      Array.isArray(source.generationPlanSha256s) &&
      source.generationPlanSha256s.every(sha) &&
      same(source.generationPlanSha256s, [...new Set(source.generationPlanSha256s)].sort()) &&
      source.generationPlanSha256s.includes(source.originalPlanSha256) &&
      Array.isArray(source.networkHistoryPlanSha256s) &&
      source.networkHistoryPlanSha256s.every(sha) &&
      new Set(source.networkHistoryPlanSha256s).size === source.networkHistoryPlanSha256s.length &&
      !source.networkHistoryPlanSha256s.includes(plan.planSha256), 'network source binding differs');
  }
  const before = validateAzureNetworkUpdateInventory(plan, row.before),
    current = validateAzureNetworkUpdateInventory(plan, row.current);
  verifyAzureNetworkUpdateProgress(
    plan,
    before,
    current,
    azureNetworkUpdateAppliedNics(plan, completed, current, pendingActionId),
  );
  for (const action of plan.actions.filter((action) => action.kind === 'nic-update'))
    azureNetworkUpdateResolvedArguments(plan, action, before);
  return {
    before,
    current,
    ...(row.source !== undefined ? { source: row.source as unknown as AzureNativeNetworkUpdateSource } : {}),
  };
}
