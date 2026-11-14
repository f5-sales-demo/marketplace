import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { type AzureNetworkUpdateNic, usableAzureNetworkAddress } from './network-update';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import {
  type AzureTerraformNetworkReplacementSourceBinding,
  validateAzureTerraformNetworkReplacementBindingIdentity,
} from './terraform-network-replacement-source-binding';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Phase = 'intact' | 'quiesced' | 'launched';
type Json = Record<string, unknown>;
export interface AzureTerraformNetworkReplacementCurrentRequest {
  plan: AzureCePlan;
  retainedPlan: AzureCePlan;
  binding: AzureTerraformNetworkReplacementSourceBinding;
  sourceBindingSha256: string;
  phase: Phase;
  newVmId?: string;
}
export interface AzureTerraformNetworkReplacementCurrentNode {
  resourceId: string;
  vmId: string | null;
  vmState: 'present' | 'absent';
  ownerPlanSha256: string | null;
  nics: Record<string, AzureNetworkUpdateNic & { attachment: string | null }>;
}
const same = canonicalEqual;
const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network replacement current identity: ${message}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete cloud object required');
  return value as Json;
}

/** Current cloud identity only. The binding/digest must first be authenticated by the fixed owning
 * journal/source readers. Collection time is not a CE heartbeat and this does not qualify link,
 * publication freshness, routing, traffic or operational acceptance. All requests are read-only.
 */
export async function observeAzureTerraformNetworkReplacementCurrent(
  request: AzureTerraformNetworkReplacementCurrentRequest,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const input = structuredClone(request),
    { plan, retainedPlan, binding, phase } = input;
  verifyAzureCePlan(plan);
  verifyAzureCePlan(retainedPlan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    selected = plan.intent.replacementNode;
  require(typeof selected === 'number' &&
    ['intact', 'quiesced', 'launched'].includes(phase) &&
    /^[a-f0-9]{64}$/.test(input.sourceBindingSha256) &&
    canonicalSha256(binding) === input.sourceBindingSha256 &&
    retainedPlan.planSha256 === profile.retainedPlanSha256 &&
    Object.keys(input).sort().join(',') ===
      [
        'binding',
        'phase',
        'plan',
        'retainedPlan',
        'sourceBindingSha256',
        ...(input.newVmId !== undefined ? ['newVmId'] : []),
      ]
        .sort()
        .join(','), 'resolved exact owning phase and source binding required');
  validateAzureTerraformNetworkReplacementBindingIdentity(
    plan,
    azureUpgradeBinding(plan).owner,
    retainedPlan,
    binding.providerLockSha256,
    binding.site,
    binding,
  );
  require(phase === 'launched'
    ? uuid(input.newVmId) && !Object.values(binding.before.nodes).some((vm) => lower(vm.vmId) === lower(input.newVmId))
    : input.newVmId === undefined, 'exact distinct launched UUID required only after launch');
  const resources = object(object(JSON.parse(binding.source)).resource),
    sourceVms = object(resources.azurerm_linux_virtual_machine),
    sourceNics = object(resources.azurerm_network_interface);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () => require(same(input, request), 'requested binding or phase changed during observation');
  const read = async (args: string[]): Promise<unknown> => {
    unchanged();
    const result = await bounded(() => api.exec('az', [...args, '--output', 'json'], { signal: deadline }));
    require(result.exitCode === 0, 'cloud observation unavailable');
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw Error('Azure Terraform network replacement current identity: malformed cloud JSON');
    }
  };
  const collect = async () => {
    const account = object(await read(['account', 'show', '--subscription', plan.subscription.id]));
    require(lower(account.id) === lower(plan.subscription.id) &&
      lower(account.tenantId) === lower(plan.subscription.tenantId) &&
      account.environmentName === plan.subscription.cloud &&
      account.state === 'Enabled', 'current account identity differs');
    const rows = await read([
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--show-details',
    ]);
    require(Array.isArray(rows), 'complete VM discovery required');
    const vms = rows.map(object);
    const nodes: Record<string, AzureTerraformNetworkReplacementCurrentNode> = {},
      seenVm = new Set<string>(),
      seenMac = new Set<string>();
    const subnets = new Map<string, string>();
    const subnet = async (id: string, expected: string) => {
      if (subnets.has(lower(id))) {
        require(subnets.get(lower(id)) === expected, 'conflicting frozen subnet CIDR');
        return;
      }
      const value = object(
        await read(['network', 'vnet', 'subnet', 'show', '--ids', id, '--subscription', plan.subscription.id]),
      );
      require(value.nextLink === undefined &&
        lower(value.id) === lower(id) &&
        value.provisioningState === 'Succeeded' &&
        (value.addressPrefixes === undefined ||
          Array.isArray(value.addressPrefixes)), 'authoritative subnet identity/state unavailable');
      const prefixes = [
        ...(value.addressPrefix !== undefined ? [value.addressPrefix] : []),
        ...(Array.isArray(value.addressPrefixes) ? value.addressPrefixes : []),
      ];
      require(prefixes.length > 0 &&
        prefixes.every((v) => typeof v === 'string' && v === expected), 'subnet CIDR missing, changed or ambiguous');
      subnets.set(lower(id), expected);
    };
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const key = String(node),
        old = binding.before.nodes[key],
        absent = node === selected && phase === 'quiesced';
      const owner = node === selected && phase === 'launched' ? plan.planSha256 : old.ownerPlanSha256;
      const matches = vms.filter((vm) => lower(vm.id) === lower(old.resourceId));
      let vmId: string | null = null;
      if (absent) require(matches.length === 0, 'selected VM must be independently absent after quiesce');
      else {
        require(matches.length === 1, 'VM discovery missing or duplicate');
        const vm = matches[0];
        const tags = structuredClone(object(object(sourceVms[`node_${node}`]).tags));
        tags['xcsh-plan-sha256'] = owner;
        const attached = object(vm.networkProfile).networkInterfaces;
        const expectedVmId = node === selected && phase === 'launched' ? input.newVmId : old.vmId;
        require(vm.nextLink === undefined &&
          vm.name === `${plan.deploymentName}-${node}` &&
          lower(vm.location) === lower(plan.region) &&
          vm.provisioningState === 'Succeeded' &&
          lower(object(vm.hardwareProfile).vmSize) === lower(plan.vm.size) &&
          uuid(vm.vmId) &&
          lower(vm.vmId) === lower(expectedVmId) &&
          same(vm.tags, tags) &&
          Array.isArray(attached) &&
          same(
            attached.map((v) => lower(object(v).id)).sort(),
            Object.values(old.nics)
              .map((n) => lower(n.resourceId))
              .sort(),
          ), 'VM generation, tags or attachment differs');
        require(!seenVm.has(lower(vm.vmId)), 'duplicate VM UUID');
        seenVm.add(lower(vm.vmId));
        vmId = vm.vmId;
      }
      const nics: AzureTerraformNetworkReplacementCurrentNode['nics'] = {};
      for (const [index, nic] of Object.entries(old.nics)) {
        const value = object(
          await read(['network', 'nic', 'show', '--ids', nic.resourceId, '--subscription', plan.subscription.id]),
        );
        const tags = object(object(sourceNics[`node_${node}_nic_${index}`]).tags);
        require(value.nextLink === undefined &&
          lower(value.id) === lower(nic.resourceId) &&
          lower(value.location) === lower(plan.region) &&
          value.provisioningState === 'Succeeded' &&
          same(value.tags, tags) &&
          Array.isArray(value.ipConfigurations) &&
          value.ipConfigurations.length === 1, 'full current NIC identity or IP configuration missing');
        const attachment =
          value.virtualMachine === undefined || value.virtualMachine === null ? null : object(value.virtualMachine).id;
        require(absent
          ? attachment === null
          : typeof attachment === 'string' &&
              lower(attachment) === lower(old.resourceId), 'phase NIC attachment differs');
        const config = object(value.ipConfigurations[0]),
          mac = lower(value.macAddress).replaceAll('-', ':');
        require(mac === nic.mac &&
          !seenMac.has(mac) &&
          config.name === nic.ipConfigurationName &&
          lower(config.id) === lower(nic.ipConfigurationId) &&
          config.primary === true &&
          config.provisioningState === 'Succeeded' &&
          config.privateIPAddressVersion === 'IPv4' &&
          config.privateIPAllocationMethod === nic.allocation &&
          config.privateIPAddress === nic.privateIp &&
          lower(object(config.subnet).id) === lower(nic.subnetId) &&
          usableAzureNetworkAddress(
            config.privateIPAddress,
            nic.subnetCidr,
          ), 'full retained NIC/IP-configuration identity or state differs');
        seenMac.add(mac);
        await subnet(nic.subnetId, nic.subnetCidr);
        nics[index] = { ...structuredClone(nic), attachment: absent ? null : old.resourceId };
      }
      nodes[key] = {
        resourceId: old.resourceId,
        vmId,
        vmState: absent ? 'absent' : 'present',
        ownerPlanSha256: absent ? null : owner,
        nics,
      };
    }
    unchanged();
    return nodes;
  };
  const first = await collect(),
    nodes = await collect();
  require(same(first, nodes), 'cloud phase identity changed across collection');
  unchanged();
  deadline.throwIfAborted();
  return {
    schemaVersion: 1 as const,
    kind: 'azure-terraform-network-replacement-current-identity' as const,
    planSha256: plan.planSha256,
    sourceBindingSha256: input.sourceBindingSha256,
    phase,
    collectedAt: new Date().toISOString(),
    nodes,
    currentOperationalAcceptanceQualified: false as const,
  };
}
