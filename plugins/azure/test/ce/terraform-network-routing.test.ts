import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import {
  buildAzureNetworkUpdateTerraformStage,
  validateAzureNetworkUpdateTerraformReceipt,
} from '../../src/ce/network-update-terraform';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from '../../src/ce/terraform-network-nic-projection';
import {
  azureTerraformNetworkRoutingSelections,
  buildAzureTerraformNetworkRoutingStage,
  prepareAzureTerraformNetworkRouting,
  validateAzureTerraformNetworkRoutingProjection,
  validateAzureTerraformNetworkRoutingReceipt,
} from '../../src/ce/terraform-network-routing';
import { bindAzureTerraformNetworkRoutingPlan } from '../../src/ce/terraform-network-routing-binding';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

async function fixture(mode: 'udr' | 'route-server' = 'udr', node = 1, changed = true) {
  const routing =
    mode === 'udr'
      ? {
          mode,
          destinationCidrs: ['10.253.0.0/24', '10.254.0.0/24'],
          udr: { subnetNames: ['slo'], nextHop: { node: 1, nicIndex: 1 } },
        }
      : { mode, destinationCidrs: ['10.253.0.0/24'], localAsn: 65010 };
  const move = mode === 'route-server' || changed;
  const f = networkUpdateFixture(true, 'terraform', move, false, routing);
  const before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  let source = f.source();
  // Serial predecessor source/inventory have already converged before this node is selected.
  for (let selected = 1; selected < node; selected++) {
    source = buildAzureNetworkUpdateTerraformStage(f.plan, source, before, selected).configuration;
    for (const [index, nic] of Object.entries(before.nodes[String(selected)].nics)) {
      nic.subnetId = nic.targetSubnetId;
      nic.subnetCidr = nic.targetSubnetCidr;
      if (move && index === '1') nic.privateIp = `10.20.2.${selected + 4}`;
    }
  }
  // This current identity is synthetic regression input, not live qualification evidence.
  const current = structuredClone(before);
  for (const [index, nic] of Object.entries(current.nodes[String(node)].nics)) {
    nic.subnetId = nic.targetSubnetId;
    nic.subnetCidr = nic.targetSubnetCidr;
    if (move && index === '1') nic.privateIp = `10.20.2.${node + 4}`;
  }
  if (mode === 'route-server' && changed) current.nodes[String(node)].nics['0'].privateIp = `10.20.0.${node + 14}`;
  const stage = buildAzureTerraformNetworkRoutingStage(f.plan, source, before, current, node);
  const receipt = (phase: 'mutation' | 'release'): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: phase === 'mutation' ? stage.configurationSha256 : stage.releasedConfigurationSha256,
    providerLockSha256: AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
    planSha256: 'b'.repeat(64),
    changes: stage.dependencies.map((row) => ({
      address: row.address,
      type: row.address.split('.')[0],
      actions: [phase === 'mutation' && row.previousIp !== row.currentIp ? 'update' : 'no-op'],
    })),
    noChanges: phase === 'release' || stage.dependencies.every((row) => row.previousIp === row.currentIp),
  });
  const prior: Record<string, Record<string, unknown>> = {},
    proposed: typeof prior = {};
  for (const row of stage.dependencies) {
    const index = Number(row.address.split('_').at(-1));
    const fields =
      row.kind === 'udr-next-hop'
        ? {
            name: `ce-route-${index + 1}`,
            resource_group_name: f.plan.intent.resourceGroup,
            route_table_name: `${f.plan.deploymentName}-rt`,
            address_prefix: f.plan.routing.destinationCidrs[index],
            next_hop_type: 'VirtualAppliance',
          }
        : {
            name: `${f.plan.deploymentName}-${node}`,
            peer_asn: f.plan.routing.localAsn,
            route_server_id: row.resourceId.slice(0, row.resourceId.lastIndexOf('/bgpConnections/')),
          };
    prior[row.address] = { id: row.resourceId, ...fields, [row.field]: row.previousIp, timeouts: null };
    proposed[row.address] = { ...prior[row.address], [row.field]: row.currentIp };
  }
  const validate = (phase: 'mutation' | 'release' = 'mutation', saved = receipt(phase)) =>
    validateAzureTerraformNetworkRoutingProjection(
      f.plan,
      source,
      before,
      current,
      stage,
      saved,
      phase,
      prior,
      proposed,
    );
  return { ...f, before, current, source, stage, receipt, prior, proposed, validate };
}
for (const mode of ['udr', 'route-server'] as const)
  for (const node of [1, 2, 3])
    for (const changed of [false, true])
      test(`separate ${mode} node ${node} changed ${changed} routing contract and release`, async () => {
        const f = await fixture(mode, node, changed);
        f.validate();
        for (const dependency of f.stage.dependencies)
          f.prior[dependency.address][dependency.field] = dependency.currentIp;
        f.validate('release');
        expect(f.mutations()).toBe(0);
        expect(f.stage.dependencies.length).toBe(mode === 'udr' ? (node === 1 ? 2 : 0) : 1);
        const regular = buildAzureNetworkUpdateTerraformStage(f.plan, f.source, f.before, node);
        expect(JSON.parse(f.stage.releasedConfiguration)).toEqual(JSON.parse(regular.configuration));
        for (const row of f.stage.dependencies) {
          const [type, name] = row.address.split('.');
          expect(JSON.parse(f.stage.nicConfiguration).resource[type][name][row.field]).toBe(row.previousIp);
          expect(JSON.parse(f.stage.configuration).resource[type][name][row.field]).toBe(row.currentIp);
        }
      });
test('dependent routing effects remain rejected by the NIC saved-plan whitelist', async () => {
  const f = await fixture();
  const prepared = prepareAzureTerraformNetworkRouting(f.plan, f.source, f.before, 1);
  const { dependencies: _, ...nicStage } = prepared;
  const receipt = f.receipt('mutation');
  receipt.configurationSha256 = nicStage.configurationSha256;
  expect(() =>
    validateAzureNetworkUpdateTerraformReceipt(f.plan, nicStage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256),
  ).toThrow('unauthorized resource');
});
for (const mode of ['udr', 'route-server'] as const) {
  test(`${mode} exact mapping covers installed AzureRM configurable fields and timeouts`, async () => {
    const f = await fixture(mode);
    const schema = JSON.parse(
      readFileSync(new URL('./terraform-network-routing-schema-fixture.json', import.meta.url), 'utf8'),
    );
    const row = f.stage.dependencies[0],
      block = schema[row.address.split('.')[0]].block;
    expect([...Object.keys(block.attributes), ...Object.keys(block.block_types)].sort()).toEqual(
      azureTerraformNetworkRoutingSelections(f.stage)[row.address].sort(),
    );
  });
  for (const field of ['id', 'name', 'timeouts'])
    for (const side of ['prior', 'proposed'] as const)
      test(`${mode} rejects foreign/malformed ${side} ${field}`, async () => {
        const f = await fixture(mode);
        f[side][f.stage.dependencies[0].address][field] = field === 'timeouts' ? { exec: '1m' } : '__FOREIGN__';
        expect(f.validate).toThrow();
      });
  for (const label of ['missing', 'extra', 'unresolved', 'changedIp', 'extraResource'])
    test(`${mode} rejects ${label} saved projection`, async () => {
      const f = await fixture(mode),
        row = f.stage.dependencies[0],
        fields = f.proposed[row.address];
      if (label === 'missing') delete fields[row.field];
      if (label === 'extra') fields.extra = true;
      if (label === 'unresolved') fields[row.field] = row.expression;
      if (label === 'changedIp') fields[row.field] = '10.99.0.5';
      if (label === 'extraResource') f.proposed.foreign = {};
      expect(f.validate).toThrow();
    });
  for (const label of [
    'wrongLock',
    'wrongPlan',
    'wrongConfig',
    'wrongEngine',
    'wrongBackend',
    'duplicate',
    'nicMutation',
    'replacement',
    'unknownResource',
    'imports',
    'actions',
    'noChanges',
    'missingEffects',
    'unqualifiedMetadata',
  ])
    test(`${mode} rejects ${label} saved plan`, async () => {
      const f = await fixture(mode),
        receipt = f.receipt('mutation');
      if (label === 'wrongLock') receipt.providerLockSha256 = 'c'.repeat(64);
      if (label === 'wrongPlan') receipt.planSha256 = '__PLAN__';
      if (label === 'wrongConfig') receipt.configurationSha256 = 'c'.repeat(64);
      if (label === 'wrongEngine') (receipt as unknown as Record<string, unknown>).engine = 'native';
      if (label === 'wrongBackend') receipt.backendIdentity = 'local:foreign';
      if (label === 'duplicate') receipt.changes.push(receipt.changes[0]);
      if (label === 'nicMutation')
        receipt.changes.push({
          address: 'azurerm_network_interface.node_1_nic_1',
          type: 'azurerm_network_interface',
          actions: ['update'],
        });
      if (label === 'replacement') receipt.changes[0].actions = ['delete', 'create'];
      if (label === 'unknownResource') receipt.changes[0].address = 'azurerm_route.foreign';
      if (label === 'imports')
        receipt.imports = [
          {
            address: 'foreign',
            type: 'azurerm_route',
            providerName: 'registry.terraform.io/hashicorp/azurerm',
            idSha256: 'f'.repeat(64),
          },
        ];
      if (label === 'actions')
        receipt.actionInvocations = [
          {
            address: 'foreign',
            type: 'azapi_resource_action',
            providerName: 'registry.terraform.io/azure/azapi',
            configValuesSha256: 'f'.repeat(64),
          },
        ];
      if (label === 'noChanges') receipt.noChanges = true;
      if (label === 'missingEffects') receipt.changes = [];
      if (label === 'unqualifiedMetadata') Object.assign(receipt.changes[0], { imported: true });
      expect(() => f.validate('mutation', receipt)).toThrow();
    });
  test(`${mode} release refuses remaining routing mutation`, async () => {
    const f = await fixture(mode),
      receipt = f.receipt('release');
    receipt.changes[0].actions = ['update'];
    receipt.noChanges = false;
    expect(() =>
      validateAzureTerraformNetworkRoutingReceipt(f.plan, f.source, f.before, f.current, f.stage, receipt, 'release'),
    ).toThrow();
  });
}
for (const label of [
  'changedStage',
  'changedCurrentMac',
  'changedOtherIp',
  'unfinishedNic',
  'changedSource',
  'malformedSource',
])
  test(`recompute routing provenance rejects ${label}`, async () => {
    const f = await fixture();
    if (label === 'changedStage') f.stage.dependencies[0].resourceId = 'foreign';
    if (label === 'changedCurrentMac') f.current.nodes['1'].nics['1'].mac = '02:00:00:ff:00:01';
    if (label === 'changedOtherIp') f.current.nodes['2'].nics['0'].privateIp = '10.20.0.17';
    if (label === 'unfinishedNic') f.current.nodes['1'].nics['1'].subnetId = f.before.nodes['1'].nics['1'].subnetId;
    if (label === 'changedSource') f.source = f.source.replace('ce-route-1', 'foreign');
    if (label === 'malformedSource') f.source = 'synthetic-private-marker';
    expect(() =>
      validateAzureTerraformNetworkRoutingReceipt(
        f.plan,
        f.source,
        f.before,
        f.current,
        f.stage,
        f.receipt('mutation'),
        'mutation',
      ),
    ).toThrow();
  });
test('source errors are sanitized', async () => {
  const f = await fixture();
  expect(() => prepareAzureTerraformNetworkRouting(f.plan, 'synthetic-private-marker', f.before, 1)).toThrow(
    'malformed retained source JSON',
  );
});

for (const mode of ['udr', 'route-server'] as const)
  for (const label of [
    'foreignParent',
    'foreignGroup',
    'foreignIpReference',
    'extraResource',
    'partialResource',
    'unknownDependentExpression',
    'unqualifiedField',
    'changedIntent',
    'foreignParentOwner',
  ])
    test(`${mode} rejects ${label} retained source graph`, async () => {
      const f = await fixture(mode),
        config = JSON.parse(f.source);
      const parent = mode === 'udr' ? config.resource.azurerm_route_table.ce : config.resource.azurerm_route_server.ce;
      const resources =
        mode === 'udr' ? config.resource.azurerm_route : config.resource.azurerm_route_server_bgp_connection;
      const key = Object.keys(resources)[0],
        row = resources[key],
        field = mode === 'udr' ? 'next_hop_in_ip_address' : 'peer_ip';
      if (label === 'foreignParent') parent.name = 'foreign';
      if (label === 'foreignGroup') config.resource.azurerm_resource_group.ce.name = 'foreign';
      if (label === 'foreignIpReference') row[field] = `\${azurerm_network_interface.foreign.private_ip_address}`;
      if (label === 'extraResource') resources.foreign = structuredClone(row);
      if (label === 'partialResource') delete resources[key];
      if (label === 'unknownDependentExpression')
        config.resource.azurerm_linux_virtual_machine.node_1.some_field = `\${azurerm_network_interface.node_1_nic_1.private_ip_address}`;
      if (label === 'unqualifiedField') row.some_field = true;
      if (label === 'changedIntent')
        row[mode === 'udr' ? 'address_prefix' : 'peer_asn'] = mode === 'udr' ? '10.99.0.0/24' : 64555;
      if (label === 'foreignParentOwner') parent.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
      expect(() => prepareAzureTerraformNetworkRouting(f.plan, JSON.stringify(config), f.before, 1)).toThrow();
    });

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function bindingFixture(mode: 'udr' | 'route-server' = 'udr', phase: 'mutation' | 'release' = 'mutation') {
  const f = await fixture(mode),
    root = await mkdtemp(join(tmpdir(), 'azure-network-routing-binding-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  if (phase === 'release') for (const row of f.stage.dependencies) f.prior[row.address][row.field] = row.currentIp;
  const state = {
    application: 'planned' as Awaited<ReturnType<TerraformSession['readPlanApplicationState']>>,
    reads: 0,
    stateReads: 0,
    submittedDuringRead: false,
  };
  const session: Pick<
    TerraformSession,
    'readPlanApplicationState' | 'readPlannedResourcePaths' | 'readProposedResourcePaths'
  > = {
    async readPlanApplicationState() {
      state.stateReads++;
      return state.application;
    },
    async readPlannedResourcePaths(_receipt, selections) {
      state.reads++;
      expect(selections).toEqual(azureTerraformNetworkRoutingSelections(f.stage));
      return structuredClone(f.prior);
    },
    async readProposedResourcePaths(_receipt, selections) {
      state.reads++;
      expect(selections).toEqual(azureTerraformNetworkRoutingSelections(f.stage));
      if (state.submittedDuringRead) state.application = 'applying';
      return structuredClone(f.proposed);
    },
  };
  const env: Record<string, string | undefined> = { ROUTING_TEST: 'synthetic' },
    controller = new AbortController();
  const receipt = f.receipt(phase);
  const bind = () =>
    bindAzureTerraformNetworkRoutingPlan(
      f.plan,
      f.source,
      f.before,
      f.current,
      f.stage,
      receipt,
      phase,
      session as TerraformSession,
      store,
      env,
      controller.signal,
    );
  const name = `${f.plan.planId}-terraform-network-node-${f.stage.node}-routing-${phase}-binding.json`;
  return { ...f, store, session, env, controller, receipt, phase, name, state, bind };
}
for (const mode of ['udr', 'route-server'] as const)
  for (const phase of ['mutation', 'release'] as const)
    test(`${mode} ${phase} owning-runner binding persists exact real private path reads and reuses history`, async () => {
      const f = await bindingFixture(mode, phase),
        first = await f.bind();
      expect(f.state.reads).toBe(2);
      expect(f.state.stateReads).toBe(2);
      expect(await f.store.read(f.name)).toEqual(first);
      f.state.application = 'applied';
      f.state.reads = 0;
      f.state.stateReads = 0;
      expect(await f.bind()).toEqual(first);
      expect(f.state.reads).toBe(0);
      expect(f.state.stateReads).toBe(0);
      expect(f.mutations()).toBe(0);
    });
for (const label of [
  'applying',
  'applied',
  'submittedDuringRead',
  'badProjection',
  'missingCapability',
  'foreignStore',
])
  test(`routing binding rejects ${label} before publication`, async () => {
    const f = await bindingFixture();
    if (label === 'applying' || label === 'applied') f.state.application = label;
    if (label === 'submittedDuringRead') f.state.submittedDuringRead = true;
    if (label === 'badProjection') f.proposed[f.stage.dependencies[0].address].name = 'foreign';
    if (label === 'missingCapability') f.session.readProposedResourcePaths = undefined;
    if (label === 'foreignStore') Object.assign(f.store.owner, { deploymentId: 'foreign' });
    await expect(f.bind()).rejects.toThrow();
    await expect(f.store.read(f.name)).rejects.toThrow();
  });
for (const label of [
  'stageSha256',
  'currentSha256',
  'receiptSha256',
  'providerLockSha256',
  'phase',
  'extra',
  'projection',
])
  test(`routing binding refuses tampered immutable ${label}`, async () => {
    const f = await bindingFixture(),
      saved = await f.bind();
    if (label === 'extra') saved.extra = true;
    else if (label === 'projection')
      (saved.proposed as Record<string, Record<string, unknown>>)[f.stage.dependencies[0].address].name = 'foreign';
    else saved[label] = label === 'phase' ? 'release' : 'f'.repeat(64);
    await f.store.write(f.name, saved);
    f.state.reads = 0;
    await expect(f.bind()).rejects.toThrow();
    expect(f.state.reads).toBe(0);
  });
for (const label of ['runnerSwap', 'storeSwap', 'inputSwap', 'envSwap'])
  test(`routing binding seals ${label} and never invokes the replacement`, async () => {
    const f = await bindingFixture();
    let replacements = 0;
    f.session.readPlannedResourcePaths = async () => {
      if (label === 'runnerSwap')
        f.session.readProposedResourcePaths = async () => {
          replacements++;
          return f.proposed;
        };
      if (label === 'storeSwap')
        f.store.write = async () => {
          replacements++;
        };
      if (label === 'inputSwap') f.current.nodes['1'].nics['1'].privateIp = '10.20.2.88';
      if (label === 'envSwap') f.env.ROUTING_TEST = 'changed';
      return f.prior;
    };
    await expect(f.bind()).rejects.toThrow('changed during binding');
    expect(replacements).toBe(0);
    await expect(f.store.read(f.name)).rejects.toThrow();
  });
test('routing binding cancellation races a private reader that ignores its signal and releases the lock', async () => {
  const f = await bindingFixture(),
    original = f.session.readPlannedResourcePaths;
  f.session.readPlannedResourcePaths = async (_receipt, _selections, _env, signal) => {
    expect(signal?.aborted).toBe(false);
    f.controller.abort(Error('synthetic cancel'));
    return await new Promise<never>(() => {});
  };
  await expect(f.bind()).rejects.toThrow('synthetic cancel');
  await expect(f.store.read(f.name)).rejects.toThrow();
  f.session.readPlannedResourcePaths = original;
  const retry = await bindAzureTerraformNetworkRoutingPlan(
    f.plan,
    f.source,
    f.before,
    f.current,
    f.stage,
    f.receipt,
    f.phase,
    f.session as TerraformSession,
    f.store,
    f.env,
  );
  expect(await f.store.read(f.name)).toEqual(retry);
});

for (const target of ['receipt', 'env', 'selections'] as const)
  test(`routing binding rejects mutated executor ${target} snapshots before another read`, async () => {
    const f = await bindingFixture();
    let proposedReads = 0;
    f.session.readPlannedResourcePaths = async (receipt, selections, env) => {
      if (target === 'receipt') receipt.planSha256 = 'f'.repeat(64);
      if (target === 'env') env.ROUTING_TEST = 'changed';
      if (target === 'selections') selections.foreign = ['secret'];
      return structuredClone(f.prior);
    };
    f.session.readProposedResourcePaths = async () => {
      proposedReads++;
      return f.proposed;
    };
    await expect(f.bind()).rejects.toThrow('changed during binding');
    expect(proposedReads).toBe(0);
    await expect(f.store.read(f.name)).rejects.toThrow();
  });
