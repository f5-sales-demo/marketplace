import { expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { buildAzureNetworkUpdateTerraformStage } from '../../src/ce/network-update-terraform';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from '../../src/ce/terraform-network-nic-projection';
import { buildAzureTerraformNetworkRoutingStage } from '../../src/ce/terraform-network-routing';
import { runAzureTerraformNetworkRoutingStage } from '../../src/ce/terraform-network-routing-execution';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

type Graph = { resource: Record<string, Record<string, Record<string, unknown>>> };
export const routingExecutionRoots: string[] = [];
export async function routingExecutionFixture(mode: 'udr' | 'route-server' = 'udr', node = 1, changed = true) {
  const routing =
    mode === 'udr'
      ? {
          mode,
          destinationCidrs: ['10.253.0.0/24', '10.254.0.0/24'],
          udr: { subnetNames: ['slo'], nextHop: { node: 1, nicIndex: 1 } },
        }
      : { mode, destinationCidrs: ['10.253.0.0/24'], localAsn: 65010 };
  const f = networkUpdateFixture(true, 'terraform', changed, false, routing);
  let source = f.source(),
    before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const move = (selected: number) => {
    for (const nic of f.nics.values())
      if (String(nic.id).includes(`-${selected}-nic`)) {
        const ip = f.config(nic);
        if (changed && String(nic.id).endsWith('nic1')) {
          ip.subnet = { id: f.target };
          ip.privateIPAddress = `10.20.2.${selected + 4}`;
        }
        if (changed && mode === 'route-server' && String(nic.id).endsWith('nic0'))
          ip.privateIPAddress = `10.20.0.${selected + 14}`;
      }
  };
  for (let selected = 1; selected < node; selected++) {
    source = buildAzureNetworkUpdateTerraformStage(f.plan, source, before, selected).configuration;
    move(selected);
    before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  }
  move(node);
  const current = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const stage = buildAzureTerraformNetworkRoutingStage(f.plan, source, before, current, node);
  const root = await mkdtemp(join(tmpdir(), 'azure-network-routing-execution-'));
  routingExecutionRoots.push(root);
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  const config = JSON.parse(source) as Graph;
  const parents = new Map<string, Record<string, unknown>>(),
    rows = new Map<string, Record<string, unknown>>();
  const values: Record<string, Record<string, unknown>> = {};
  for (const dependency of stage.dependencies) {
    const udr = dependency.kind === 'udr-next-hop',
      parentId = dependency.resourceId.slice(
        0,
        dependency.resourceId.lastIndexOf(udr ? '/routes/' : '/bgpConnections/'),
      );
    const parent = config.resource[udr ? 'azurerm_route_table' : 'azurerm_route_server'].ce;
    parents.set(parentId, {
      id: parentId,
      name: parent.name,
      tags: structuredClone(parent.tags),
      location: f.plan.region,
      provisioningState: 'Succeeded',
    });
    const configured = config.resource[dependency.address.split('.')[0]][dependency.address.split('.')[1]];
    rows.set(dependency.resourceId, {
      id: dependency.resourceId,
      name: configured.name,
      provisioningState: 'Succeeded',
      ...(udr
        ? {
            addressPrefix: configured.address_prefix,
            nextHopType: 'VirtualAppliance',
            nextHopIpAddress: dependency.previousIp,
          }
        : { peerAsn: configured.peer_asn, peerIp: dependency.previousIp }),
    });
    values[dependency.address] = {
      id: dependency.resourceId,
      name: configured.name,
      timeouts: null,
      ...(udr
        ? {
            resource_group_name: f.plan.intent.resourceGroup,
            route_table_name: `${f.plan.deploymentName}-rt`,
            address_prefix: configured.address_prefix,
            next_hop_type: 'VirtualAppliance',
          }
        : { route_server_id: parentId, peer_asn: configured.peer_asn }),
    };
  }
  const state = {
    configuration: stage.nicConfiguration,
    loss: '',
    noEffect: false,
    wrongProjection: false,
    foreignOwnerAfterPlan: false,
    unavailable: false,
    power: 'VM running',
    extraMutation: false,
    wrongLock: false,
    unknownApplication: false,
    privateReadFailed: false,
  };
  const calls: string[] = [],
    journals = new Map<
      string,
      {
        receipt: PlanReceipt;
        prior: Record<string, Record<string, unknown>>;
        proposed: Record<string, Record<string, unknown>>;
        state: 'planned' | 'applying' | 'applied';
      }
    >();
  let latest: PlanReceipt | undefined,
    counter = 0;
  const journal = (receipt: PlanReceipt, planned = false) => {
    const value = journals.get(receipt.planSha256);
    if (!latest) throw Error('missing latest synthetic journal');
    expect(receipt.planSha256).toBe(latest.planSha256);
    expect(receipt.configurationSha256).toBe(f.hash(state.configuration));
    if (!value) throw Error('missing exact synthetic journal');
    if (planned) expect(value.state).toBe('planned');
    return value;
  };
  const installed = (address: string) => {
    const dependency = stage.dependencies.find((row) => row.address === address);
    if (!dependency) throw Error('missing synthetic dependency');
    const row = rows.get(dependency.resourceId);
    return row?.[dependency.kind === 'udr-next-hop' ? 'nextHopIpAddress' : 'peerIp'];
  };
  const completeEffect = (partial = false) => {
    for (const [index, dependency] of stage.dependencies.entries()) {
      if (partial && index > 0) continue;
      const row = rows.get(dependency.resourceId);
      if (!row) throw Error('missing synthetic route');
      row[dependency.kind === 'udr-next-hop' ? 'nextHopIpAddress' : 'peerIp'] = dependency.currentIp;
    }
  };
  const session = {
    async readConfigurationSha256() {
      return f.hash(state.configuration);
    },
    async readConfiguration(hash: string) {
      expect(hash).toBe(f.hash(state.configuration));
      return state.configuration;
    },
    async reviseConfiguration(hash: string, next: string) {
      expect(hash).toBe(f.hash(state.configuration));
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
      const graph = JSON.parse(state.configuration) as Graph;
      const prior: Record<string, Record<string, unknown>> = {},
        proposed: typeof prior = {},
        changes: PlanReceipt['changes'] = [];
      for (const dependency of stage.dependencies) {
        const row = graph.resource[dependency.address.split('.')[0]][dependency.address.split('.')[1]];
        const configured = row[dependency.field];
        const ip = configured === dependency.expression ? dependency.currentIp : configured;
        prior[dependency.address] = {
          ...values[dependency.address],
          [dependency.field]: installed(dependency.address),
        };
        proposed[dependency.address] = { ...values[dependency.address], [dependency.field]: ip };
        if (state.wrongProjection) proposed[dependency.address].id = 'foreign';
        changes.push({
          address: dependency.address,
          type: dependency.address.split('.')[0],
          actions: [installed(dependency.address) === ip ? 'no-op' : 'update'],
        });
      }
      if (state.extraMutation)
        changes.push({
          address: 'azurerm_network_interface.node_1_nic_1',
          type: 'azurerm_network_interface',
          actions: ['update'],
        });
      const receipt: PlanReceipt = {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: f.plan.deploymentName,
        backendIdentity: `local:${f.plan.deploymentName}`,
        configurationSha256: f.hash(state.configuration),
        providerLockSha256: state.wrongLock ? 'f'.repeat(64) : AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        planSha256: f.hash(String(++counter)),
        changes,
        noChanges: changes.every((row) => row.actions[0] === 'no-op'),
      };
      latest = receipt;
      journals.set(receipt.planSha256, { receipt, prior, proposed, state: 'planned' });
      if (state.foreignOwnerAfterPlan)
        for (const parent of parents.values())
          (parent.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
      if (state.loss === 'plan-after') {
        state.loss = '';
        throw Error('synthetic lost plan response');
      }
      return receipt;
    },
    async readPlanApplicationState(receipt: PlanReceipt) {
      return state.unknownApplication ? 'unavailable' : journal(receipt).state;
    },
    async readPlannedResourcePaths(receipt: PlanReceipt, selections: Record<string, string[]>) {
      calls.push('prior-paths');
      const saved = journal(receipt, true);
      if (state.privateReadFailed) throw Error('synthetic private reader unavailable');
      return Object.fromEntries(
        Object.entries(selections).map(([address, fields]) => [
          address,
          Object.fromEntries(fields.map((field) => [field, saved.prior[address][field]])),
        ]),
      );
    },
    async readProposedResourcePaths(receipt: PlanReceipt, selections: Record<string, string[]>) {
      calls.push('proposed-paths');
      const saved = journal(receipt, true);
      return Object.fromEntries(
        Object.entries(selections).map(([address, fields]) => [
          address,
          Object.fromEntries(fields.map((field) => [field, saved.proposed[address][field]])),
        ]),
      );
    },
    async apply(receipt: PlanReceipt) {
      calls.push('apply');
      const saved = journal(receipt, true);
      if (state.loss === 'submission-before') {
        state.loss = '';
        throw Error('synthetic failure before submission');
      }
      saved.state = 'applying';
      if (state.loss === 'apply-before') {
        state.loss = '';
        throw Error('synthetic submitted before effect');
      }
      if (!state.noEffect) completeEffect(state.loss === 'apply-partial');
      if (state.loss === 'apply-partial' || state.loss === 'apply-after') {
        state.loss = '';
        throw Error('synthetic submitted response lost');
      }
      saved.state = 'applied';
    },
    async reconcileApplyFromEvidence(receipt: PlanReceipt, evidence: string) {
      calls.push('reconcile');
      const saved = journal(receipt);
      expect(saved.state).toBe('applying');
      expect(evidence).toMatch(/^[a-f0-9]{64}$/);
      saved.state = 'applied';
    },
  } as unknown as TerraformSession;
  const originalWrite = store.write;
  store.write = async (name, value) => {
    await originalWrite.call(store, name, value);
    if (state.loss === `write-${name.slice(name.indexOf('-routing-') + 9)}`) {
      state.loss = '';
      throw Error('synthetic durable write response lost');
    }
  };
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (state.unavailable) return { exitCode: 1, stdout: '', stderr: 'synthetic-private-marker' };
      if (args[0] === 'vm' && args[1] === 'show')
        return { exitCode: 0, stdout: JSON.stringify({ ...f.vms[node - 1], powerState: state.power }), stderr: '' };
      const isParent = args.slice(0, 3).join(' ') === `network ${mode === 'udr' ? 'route-table' : 'routeserver'} show`;
      const isRow =
        args.slice(0, 3).join(' ') === `network ${mode === 'udr' ? 'route-table route' : 'routeserver peering'}`;
      if (isParent || isRow) {
        const id = args[args.indexOf('--ids') + 1],
          value = (isParent ? parents : rows).get(id);
        return { exitCode: 0, stdout: JSON.stringify(value ?? null), stderr: '' };
      }
      return await f.api.exec(command, args, options);
    },
  };
  const run = (signal?: AbortSignal) =>
    runAzureTerraformNetworkRoutingStage(f.plan, source, before, current, node, session, store, api, {}, signal, {
      attempts: 2,
      intervalMs: 0,
      wait: async () => {},
    });
  const prefix = `${f.plan.planId}-terraform-network-node-${node}-routing`;
  return {
    ...f,
    source,
    before,
    current,
    stage,
    store,
    session,
    state,
    calls,
    journals,
    parents,
    rows,
    api,
    prefix,
    completeEffect,
    run,
  };
}
