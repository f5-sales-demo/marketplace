import { expect } from 'bun:test';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { projectTerraformFieldPath } from '../../../terraform/src/field-paths';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { type AzureNetworkUpdateInventory, captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { runAzureTerraformNetworkNicStage } from '../../src/ce/terraform-network-nic-execution';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from '../../src/ce/terraform-network-nic-projection';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCeIntent, AzureCePlan } from '../../src/ce/types';
import { networkUpdateFixture } from './network-update-fixture';
import { createOwnedFixtureRoot } from './root-scope';

type FixtureConfiguration = {
  resource: {
    azurerm_network_interface: Record<
      string,
      { ip_configuration: Array<{ subnet_id: string; public_ip_address_id?: string }> }
    >;
    azurerm_subnet: Record<string, { name: string }>;
    azurerm_public_ip: Record<string, { name: string }>;
  };
};
export interface TerraformNetworkFixtureSeed {
  plan: AzureCePlan;
  inventory: AzureNetworkUpdateInventory;
  source: string;
  store?: CeDeploymentStore;
}
export async function nicExecutionFixture(
  node = 1,
  move = true,
  ha = true,
  bothMove = false,
  literalSource = false,
  seed?: TerraformNetworkFixtureSeed,
  routing?: AzureCeIntent['routing'],
) {
  const f = networkUpdateFixture(ha, 'terraform', move, false, routing);
  if (bothMove) {
    const target = `${f.vnet.id}/subnets/updated-slo`;
    f.subnets.set(target, { id: target, provisioningState: 'Succeeded', addressPrefix: '10.20.3.0/24' });
    const intent = structuredClone(f.plan.intent);
    intent.nics[0].subnet = { mode: 'greenfield', name: 'updated-slo', cidr: '10.20.3.0/24' };
    f.plan = compileAzureCePlan(intent, f.current);
  }
  const sourceObject = JSON.parse(f.source());
  for (const [name, configured] of Object.entries(sourceObject.resource.azurerm_network_interface)) {
    const raw = [...f.nics.values()].find((row) =>
      String(row.id).endsWith(`/${(configured as Record<string, unknown>).name}`),
    );
    if (!raw) throw Error(`missing configured ${name}`);
    raw.tags = structuredClone((configured as Record<string, unknown>).tags);
  }
  const appliedNics: string[] = [];
  for (let prior = 1; prior < node; prior++)
    for (const nic of f.plan.nics) {
      appliedNics.push(`${prior}:${nic.index}`);
      const row = [...f.nics.values()].find((row) => String(row.id).endsWith(`-${prior}-nic${nic.index}`));
      if (!row) throw Error('missing fixture NIC');
      if (nic.index === 1 && move) {
        f.config(row).subnet = { id: f.target };
        f.config(row).privateIPAddress = `10.20.2.${prior + 4}`;
        sourceObject.resource.azurerm_network_interface[
          `node_${prior}_nic_${nic.index}`
        ].ip_configuration[0].subnet_id = f.target;
        sourceObject.output.ce_interfaces.value[`${prior}:${nic.index}`].subnet_id = f.target;
      }
    }
  if (literalSource)
    for (let owner = 1; owner <= f.plan.topology.nodeCount; owner++)
      for (const nic of f.plan.nics) {
        const id = [...f.nics.values()].find((row) => String(row.id).endsWith(`-${owner}-nic${nic.index}`));
        if (!id) throw Error('missing literal NIC');
        const subnet = (f.config(id).subnet as Record<string, unknown>).id;
        sourceObject.resource.azurerm_network_interface[
          `node_${owner}_nic_${nic.index}`
        ].ip_configuration[0].subnet_id = subnet;
        sourceObject.output.ce_interfaces.value[`${owner}:${nic.index}`].subnet_id = subnet;
      }
  if (seed) {
    f.plan = structuredClone(seed.plan);
    for (const [n, vm] of Object.entries(seed.inventory.nodes)) {
      const raw = f.vms[Number(n) - 1];
      raw.vmId = vm.vmId;
      raw.tags['xcsh-plan-sha256'] = vm.ownerPlanSha256;
      for (const nic of Object.values(vm.nics)) {
        const cloud = f.nics.get(nic.resourceId);
        if (!cloud) throw Error('missing seeded NIC');
        cloud.macAddress = nic.mac;
        (cloud.tags as Record<string, string>)['xcsh-plan-sha256'] = nic.ownerPlanSha256;
        f.config(cloud).privateIPAddress = nic.privateIp;
        f.config(cloud).subnet = { id: nic.subnetId };
        for (const [id, cidr] of [
          [nic.subnetId, nic.subnetCidr],
          [nic.targetSubnetId, nic.targetSubnetCidr],
        ])
          f.subnets.set(id, { id, provisioningState: 'Succeeded', addressPrefix: cidr });
      }
    }
  }
  const source = seed?.source ?? JSON.stringify(sourceObject),
    before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const root = await createOwnedFixtureRoot();
  const store = seed?.store ?? (await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner));
  const state = {
    configuration: source,
    application: 'planned',
    power: 'VM deallocated',
    loss: '',
    noEffect: false,
    wrongProjection: false,
    changedAfterPlan: false,
    foreignUuid: false,
    cloudUnavailable: false,
  };
  const calls: string[] = [],
    journals = new Map<
      string,
      {
        prior: Record<string, unknown>;
        proposed: Record<string, unknown>;
        unknown: Record<string, unknown>;
        state: string;
      }
    >();
  let latest: PlanReceipt | undefined,
    counter = 0;
  const current = (receipt: PlanReceipt, planned = false) => {
    if (latest?.planSha256 !== receipt.planSha256 || receipt.configurationSha256 !== f.hash(state.configuration))
      throw Error('exact current journal required');
    if (planned && journals.get(receipt.planSha256)?.state !== 'planned')
      throw Error('unsubmitted projection required');
  };
  const resolved = (value: unknown, type: 'subnet' | 'public_ip', configuration: FixtureConfiguration) => {
    if (typeof value !== 'string' || !value.startsWith('$')) return value ?? null;
    const name = value.split('.')[1],
      row = configuration.resource[`azurerm_${type}`][name];
    return type === 'subnet'
      ? `${f.vnet.id}/subnets/${row.name}`
      : `/subscriptions/${f.plan.subscription.id}/resourceGroups/${f.plan.intent.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${row.name}`;
  };
  const values = (index: number, after: boolean, configuration: FixtureConfiguration) => {
    const identity = before.nodes[String(node)].nics[String(index)],
      raw = f.nics.get(identity.resourceId);
    if (!raw) throw Error('missing fixture identity');
    const cloud = f.config(raw),
      configured = configuration.resource.azurerm_network_interface[`node_${node}_nic_${index}`];
    const subnet = after
      ? resolved(configured.ip_configuration[0].subnet_id, 'subnet', configuration)
      : (cloud.subnet as Record<string, unknown>).id;
    return {
      accelerated_networking_enabled: false,
      auxiliary_mode: '',
      auxiliary_sku: '',
      dns_servers: [],
      edge_zone: '',
      id: identity.resourceId,
      internal_dns_name_label: '',
      ip_forwarding_enabled: true,
      location: f.plan.region,
      name: `${f.plan.deploymentName}-${node}-nic${index}`,
      resource_group_name: f.plan.intent.resourceGroup,
      tags: raw.tags,
      mac_address: raw.macAddress,
      virtual_machine_id: before.nodes[String(node)].resourceId,
      timeouts: null,
      ip_configuration: [
        {
          gateway_load_balancer_frontend_ip_configuration_id: '',
          name: cloud.name,
          primary: true,
          private_ip_address_allocation: cloud.privateIPAllocationMethod,
          private_ip_address_version: 'IPv4',
          public_ip_address_id: resolved(
            configured.ip_configuration[0].public_ip_address_id,
            'public_ip',
            configuration,
          ),
          subnet_id: subnet,
          private_ip_address:
            after && subnet !== (cloud.subnet as Record<string, unknown>).id ? null : cloud.privateIPAddress,
        },
      ],
    };
  };
  const routingParents = new Map<string, Record<string, unknown>>(),
    routingRows = new Map<string, Record<string, unknown>>(),
    routingValues = new Map<string, Record<string, unknown>>();
  const graph = JSON.parse(source) as { resource: Record<string, Record<string, Record<string, unknown>>> };
  const networkBase = `/subscriptions/${f.plan.subscription.id}/resourceGroups/${f.plan.intent.resourceGroup}/providers/Microsoft.Network`;
  const resolvedRoutingIp = (value: unknown) => {
    if (typeof value !== 'string') throw Error('missing synthetic routing IP');
    const match = /^\$\{azurerm_network_interface\.node_(\d+)_nic_(\d+)\.private_ip_address\}$/.exec(value);
    if (!match) return value;
    const raw = [...f.nics.values()].find((row) => String(row.id).endsWith(`-${match[1]}-nic${match[2]}`));
    if (!raw) throw Error('missing synthetic routing NIC');
    return f.config(raw).privateIPAddress;
  };
  for (const [type, group] of Object.entries(graph.resource)) {
    if (type !== 'azurerm_route' && type !== 'azurerm_route_server_bgp_connection') continue;
    const udr = type === 'azurerm_route',
      parent = graph.resource[udr ? 'azurerm_route_table' : 'azurerm_route_server'].ce,
      parentId = `${networkBase}/${udr ? 'routeTables' : 'virtualHubs'}/${parent.name}`;
    routingParents.set(parentId, {
      id: parentId,
      name: parent.name,
      tags: structuredClone(parent.tags),
      location: f.plan.region,
      provisioningState: 'Succeeded',
    });
    for (const [name, config] of Object.entries(group)) {
      const address = `${type}.${name}`,
        id = `${parentId}/${udr ? 'routes' : 'bgpConnections'}/${config.name}`;
      const ip = resolvedRoutingIp(config[udr ? 'next_hop_in_ip_address' : 'peer_ip']);
      routingRows.set(id, {
        id,
        name: config.name,
        provisioningState: 'Succeeded',
        ...(udr
          ? {
              addressPrefix: config.address_prefix,
              nextHopType: 'VirtualAppliance',
              nextHopIpAddress: ip,
            }
          : { peerAsn: config.peer_asn, peerIp: ip }),
      });
      routingValues.set(address, {
        id,
        name: config.name,
        timeouts: null,
        ...(udr
          ? {
              resource_group_name: f.plan.intent.resourceGroup,
              route_table_name: parent.name,
              address_prefix: config.address_prefix,
              next_hop_type: 'VirtualAppliance',
            }
          : { route_server_id: parentId, peer_asn: config.peer_asn }),
      });
    }
  }
  const session = {
    async readConfigurationSha256() {
      return f.hash(state.configuration);
    },
    async readConfiguration(expected: string) {
      expect(expected).toBe(f.hash(state.configuration));
      return state.configuration;
    },
    async reviseConfiguration(expected: string, next: string) {
      expect(expected).toBe(f.hash(state.configuration));
      calls.push('revision');
      state.configuration = next;
      if (state.loss === 'revision-after') {
        state.loss = '';
        throw Error('synthetic lost revision response');
      }
      return f.hash(next);
    },
    async plan() {
      calls.push('plan');
      const configuration = JSON.parse(state.configuration),
        prior: Record<string, unknown> = {},
        proposed: typeof prior = {},
        unknown: typeof prior = {};
      const changes: PlanReceipt['changes'] = [];
      for (const nic of f.plan.nics) {
        const address = `azurerm_network_interface.node_${node}_nic_${nic.index}`,
          a = values(nic.index, false, configuration),
          b = values(nic.index, true, configuration);
        const moving = a.ip_configuration[0].subnet_id !== b.ip_configuration[0].subnet_id;
        prior[address] = a;
        proposed[address] = state.wrongProjection ? { ...b, mac_address: '__MAC__' } : b;
        unknown[address] = moving ? { ip_configuration: [{ private_ip_address: true }] } : {};
        changes.push({ address, type: 'azurerm_network_interface', actions: [moving ? 'update' : 'no-op'] });
      }
      for (const [address, identity] of routingValues) {
        const [type, name] = address.split('.'),
          udr = type === 'azurerm_route',
          field = udr ? 'next_hop_in_ip_address' : 'peer_ip',
          installed = routingRows.get(String(identity.id));
        if (!installed) throw Error('missing synthetic routing installation');
        const configured = (configuration.resource as Record<string, Record<string, Record<string, unknown>>>)[type][
            name
          ],
          proposedIp = resolvedRoutingIp(configured[field]),
          priorIp = installed[udr ? 'nextHopIpAddress' : 'peerIp'];
        prior[address] = { ...identity, [field]: priorIp };
        proposed[address] = { ...identity, [field]: proposedIp };
        unknown[address] = {};
        changes.push({ address, type, actions: [priorIp === proposedIp ? 'no-op' : 'update'] });
      }
      const receipt: PlanReceipt = {
        schemaVersion: 1,
        deploymentId: f.plan.deploymentName,
        engine: 'terraform',
        backendIdentity: `local:${f.plan.deploymentName}`,
        configurationSha256: f.hash(state.configuration),
        providerLockSha256: AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        planSha256: f.hash(String(++counter)),
        changes,
        noChanges: changes.every((change) => change.actions[0] === 'no-op'),
      };
      latest = receipt;
      journals.set(receipt.planSha256, { prior, proposed, unknown, state: 'planned' });
      if (state.changedAfterPlan) state.foreignUuid = true;
      return receipt;
    },
    async readPlanApplicationState(receipt: PlanReceipt) {
      current(receipt);
      return journals.get(receipt.planSha256)?.state;
    },
    async readPlannedResourcePaths(receipt: PlanReceipt, selections: Record<string, string[]>) {
      current(receipt, true);
      calls.push('prior-paths');
      const journal = journals.get(receipt.planSha256);
      return Object.fromEntries(
        Object.entries(selections).map(([address, paths]) => [
          address,
          Object.fromEntries(
            paths.map((path) => [path, projectTerraformFieldPath(journal?.prior[address], {}, {}, path)]),
          ),
        ]),
      );
    },
    async readProposedResourcePaths(receipt: PlanReceipt, selections: Record<string, string[]>) {
      current(receipt, true);
      calls.push('proposed-paths');
      const journal = journals.get(receipt.planSha256);
      return Object.fromEntries(
        Object.entries(selections).map(([address, paths]) => [
          address,
          Object.fromEntries(
            paths.map((path) => [
              path,
              projectTerraformFieldPath(journal?.proposed[address], {}, journal?.unknown[address], path),
            ]),
          ),
        ]),
      );
    },
    async apply(receipt: PlanReceipt) {
      current(receipt, true);
      calls.push('apply');
      const journal = journals.get(receipt.planSha256);
      if (!journal) throw Error('missing journal');
      journal.state = 'applying';
      if (state.loss === 'apply-before') {
        state.loss = '';
        throw Error('synthetic submission loss before effect');
      }
      if (!state.noEffect)
        for (const nic of f.plan.nics) {
          const identity = before.nodes[String(node)].nics[String(nic.index)],
            raw = f.nics.get(identity.resourceId);
          if (!raw) throw Error('missing NIC');
          const cloud = f.config(raw);
          if (state.loss === 'apply-partial' && nic.index === 1) {
            state.loss = '';
            throw Error('synthetic interruption after only first NIC reached target');
          }
          if ((cloud.subnet as Record<string, unknown>).id !== identity.targetSubnetId) {
            cloud.subnet = { id: identity.targetSubnetId };
            cloud.privateIPAddress = `${identity.targetSubnetCidr.split('/')[0].split('.').slice(0, 3).join('.')}.${node + 4}`;
          }
        }
      if (!state.noEffect)
        for (const change of receipt.changes) {
          if (change.actions[0] !== 'update' || !routingValues.has(change.address)) continue;
          const identity = routingValues.get(change.address),
            udr = change.type === 'azurerm_route',
            installed = routingRows.get(String(identity?.id)),
            proposed = journal.proposed[change.address] as Record<string, unknown>;
          if (!installed) throw Error('missing applied synthetic routing row');
          installed[udr ? 'nextHopIpAddress' : 'peerIp'] = proposed[udr ? 'next_hop_in_ip_address' : 'peer_ip'];
        }
      if (state.loss === 'apply-after') {
        state.loss = '';
        throw Error('synthetic response loss after effect');
      }
      journal.state = 'applied';
    },
    async reconcileApplyFromEvidence(receipt: PlanReceipt, evidence: string) {
      current(receipt);
      expect(evidence).toMatch(/^[a-f0-9]{64}$/);
      calls.push('reconcile');
      const journal = journals.get(receipt.planSha256);
      if (!journal) throw Error('missing journal');
      expect(journal.state).toBe('applying');
      journal.state = 'applied';
    },
  } as unknown as TerraformSession;
  const api = {
    async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
      if (state.cloudUnavailable) return { exitCode: 1, stdout: '', stderr: '' };
      const parent = args.slice(0, 3).join(' '),
        child = args.slice(0, 4).join(' ');
      if (
        ['network route-table show', 'network routeserver show'].includes(parent) ||
        ['network route-table route show', 'network routeserver peering show'].includes(child)
      ) {
        const id = args[args.indexOf('--ids') + 1],
          isParent = parent.endsWith(' show');
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify((isParent ? routingParents : routingRows).get(id) ?? null),
        };
      }
      if (args[0] === 'vm' && args[1] === 'show')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ...f.vms[node - 1],
            vmId: state.foreignUuid ? '00000000-0000-4000-8000-999999999999' : f.vms[node - 1].vmId,
            powerState: state.power,
          }),
        };
      return f.api.exec(command, args, options);
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkNicStage(f.plan, source, before, node, appliedNics, session, store, api, {}, signal, {
      attempts: 2,
      intervalMs: 0,
      wait: async () => {},
    });
  return {
    ...f,
    source,
    before,
    store,
    state,
    calls,
    journals,
    session,
    api,
    appliedNics,
    routingParents,
    routingRows,
    routingValues,
    run,
  };
}
