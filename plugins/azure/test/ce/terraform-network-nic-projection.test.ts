import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { buildAzureNetworkUpdateTerraformStage } from '../../src/ce/network-update-terraform';
import { bindAzureTerraformNetworkNicPlan } from '../../src/ce/terraform-network-nic-binding';
import {
  AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
  azureTerraformNetworkNicSelections,
  validateAzureTerraformNetworkNicProjection,
} from '../../src/ce/terraform-network-nic-projection';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

async function fixture(move = true, node = 2) {
  const f = networkUpdateFixture(true, 'terraform', move, false);
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const stage = buildAzureNetworkUpdateTerraformStage(f.plan, f.source(), inventory, node);
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: f.plan.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: stage.configurationSha256,
    providerLockSha256: AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
    planSha256: 'b'.repeat(64),
    changes: stage.addresses.map((address) => ({
      address,
      type: 'azurerm_network_interface',
      actions: [move && address.endsWith('_nic_1') ? 'update' : 'no-op'],
    })),
    noChanges: !move,
  };
  const selections = azureTerraformNetworkNicSelections(f.plan, stage, inventory);
  const prior: Record<string, Record<string, unknown>> = {},
    proposed: typeof prior = {};
  const configured = JSON.parse(stage.configuration).resource.azurerm_network_interface;
  for (const nic of f.plan.nics) {
    const id = inventory.nodes[String(node)].nics[String(nic.index)];
    const address = `azurerm_network_interface.node_${node}_nic_${nic.index}`;
    const values: Record<string, unknown> = {
      accelerated_networking_enabled: false,
      auxiliary_mode: '',
      auxiliary_sku: '',
      dns_servers: [],
      edge_zone: '',
      id: id.resourceId,
      internal_dns_name_label: '',
      ip_forwarding_enabled: true,
      location: f.plan.region,
      name: `${f.plan.deploymentName}-${node}-nic${nic.index}`,
      resource_group_name: f.plan.intent.resourceGroup,
      tags: configured[address.split('.')[1]].tags,
      mac_address: id.mac.replaceAll(':', '-').toUpperCase(),
      virtual_machine_id: inventory.nodes[String(node)].resourceId,
      timeouts: null,
      'ip_configuration.length': 1,
      'ip_configuration.0.name': id.ipConfigurationName,
      'ip_configuration.0.primary': true,
      'ip_configuration.0.private_ip_address_allocation': id.allocation,
      'ip_configuration.0.private_ip_address_version': 'IPv4',
      'ip_configuration.0.private_ip_address': id.privateIp,
      'ip_configuration.0.gateway_load_balancer_frontend_ip_configuration_id': '',
      'ip_configuration.0.public_ip_address_id':
        nic.index === 0
          ? `/subscriptions/${f.plan.subscription.id}/resourceGroups/${f.plan.intent.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${f.plan.deploymentName}-${node}-pip`
          : null,
      'ip_configuration.0.subnet_id': id.subnetId,
    };
    prior[address] = Object.fromEntries(selections.prior[address].map((path) => [path, values[path]]));
    proposed[address] = Object.fromEntries(
      selections.proposed[address].map((path) => [
        path,
        path === 'ip_configuration.0.subnet_id' ? id.targetSubnetId : values[path],
      ]),
    );
  }
  const validate = () =>
    validateAzureTerraformNetworkNicProjection(
      f.plan,
      stage,
      inventory,
      receipt,
      receipt.providerLockSha256,
      prior,
      proposed,
    );
  return { ...f, inventory, stage, receipt, selections, prior, proposed, validate };
}

for (const node of [1, 2, 3])
  for (const move of [true, false])
    test(`NIC projections bind selected node ${node}, move ${move}, and permit only computed moving dynamic IP absence`, async () => {
      const f = await fixture(move, node);
      f.validate();
      expect(f.selections.proposed[f.stage.addresses[1]].includes('ip_configuration.0.private_ip_address')).toBe(!move);
      expect(f.mutations()).toBe(0);
    });

test('NIC projection mapping covers exact installed AzureRM configurable fields and timeout block', () => {
  const schema = JSON.parse(
    readFileSync(new URL('./terraform-network-nic-schema-fixture.json', import.meta.url), 'utf8'),
  );
  const fields = Object.entries(schema.block.attributes)
    .filter(
      ([, value]) =>
        (value as { optional?: boolean; required?: boolean }).optional || (value as { required?: boolean }).required,
    )
    .map(([key]) => key);
  expect(fields.sort()).toEqual(
    [
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
    ].sort(),
  );
  expect(Object.keys(schema.block.block_types).sort()).toEqual(['ip_configuration', 'timeouts']);
  expect(schema.block.block_types.ip_configuration.nesting_mode).toBe('list');
  expect(schema.block.block_types.timeouts.nesting_mode).toBe('single');
});

for (const side of ['prior', 'proposed'] as const)
  for (const [path, value] of Object.entries({
    id: '__NIC__',
    name: 'foreign',
    resource_group_name: 'foreign',
    location: 'foreign',
    mac_address: '02:00:00:ff:ff:01',
    virtual_machine_id: '__VM__',
    'ip_configuration.length': 2,
    'ip_configuration.0.name': 'foreign',
    'ip_configuration.0.primary': false,
    'ip_configuration.0.private_ip_address_allocation': 'Static',
    'ip_configuration.0.private_ip_address_version': 'IPv6',
    'ip_configuration.0.subnet_id': '__SUBNET__',
  }))
    test(`NIC projection rejects ${side} ${path} identity change`, async () => {
      const f = await fixture();
      f[side][f.stage.addresses[1]][path] = value;
      expect(f.validate).toThrow();
    });

for (const [path, value] of Object.entries({
  accelerated_networking_enabled: true,
  auxiliary_mode: 'AcceleratedConnections',
  auxiliary_sku: 'A1',
  dns_servers: ['1.1.1.1'],
  edge_zone: 'foreign',
  internal_dns_name_label: 'foreign',
  ip_forwarding_enabled: false,
  tags: {},
  timeouts: { update: '1m' },
  'ip_configuration.0.gateway_load_balancer_frontend_ip_configuration_id': '/foreign',
  'ip_configuration.0.public_ip_address_id': '/foreign',
}))
  test(`NIC projection rejects unauthorized mutable ${path} delta`, async () => {
    const f = await fixture();
    f.proposed[f.stage.addresses[1]][path] = value;
    expect(f.validate).toThrow();
  });

for (const mode of [
  'foreign-address',
  'missing-address',
  'missing-field',
  'extra-field',
  'null-resource',
  'wrong-lock',
  'foreign-owner',
  'wrong-prior-ip',
  'wrong-noop-ip',
  'requested-dynamic-ip',
  'unresolved-request',
  'extra-config-field',
] as const)
  test(`NIC projection rejects ${mode}`, async () => {
    const f = await fixture();
    const address = f.stage.addresses[1];
    if (mode === 'foreign-address') f.proposed.foreign = {};
    if (mode === 'missing-address') delete f.prior[address];
    if (mode === 'missing-field') delete f.proposed[address].dns_servers;
    if (mode === 'extra-field') f.proposed[address].foreign = true;
    if (mode === 'null-resource') (f.proposed as Record<string, unknown>)[address] = null;
    if (mode === 'wrong-lock') f.receipt.providerLockSha256 = 'c'.repeat(64);
    if (mode === 'foreign-owner')
      (f.prior[address].tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'c'.repeat(64);
    if (mode === 'wrong-prior-ip') f.prior[address]['ip_configuration.0.private_ip_address'] = '10.20.1.88';
    if (mode === 'wrong-noop-ip')
      f.proposed[f.stage.addresses[0]]['ip_configuration.0.private_ip_address'] = '10.20.0.88';
    if (['requested-dynamic-ip', 'unresolved-request', 'extra-config-field'].includes(mode)) {
      const c = JSON.parse(f.stage.configuration),
        nic = c.resource.azurerm_network_interface[address.split('.')[1]];
      if (mode === 'requested-dynamic-ip') nic.ip_configuration[0].private_ip_address = '10.20.2.88';
      if (mode === 'unresolved-request') nic.dns_servers = ['__DNS__'];
      if (mode === 'extra-config-field') nic.foreign = true;
      f.stage.configuration = JSON.stringify(c);
      f.stage.configurationSha256 = f.hash(f.stage.configuration);
      f.receipt.configurationSha256 = f.stage.configurationSha256;
    }
    expect(f.validate).toThrow();
  });

for (const mode of [
  'missing-effect',
  'wrong-effect',
  'unresolved-public-reference',
  'foreign-public-reference',
  'configured-identity',
  'unknown-ip-field',
  'dynamic-noop-input',
] as const)
  test(`NIC projection rejects ${mode} even with rewritten configuration hashes`, async () => {
    const f = await fixture();
    if (mode === 'missing-effect') f.receipt.changes.pop();
    else if (mode === 'wrong-effect') {
      f.receipt.changes[1].actions = ['no-op'];
      f.receipt.noChanges = true;
    } else {
      const c = JSON.parse(f.stage.configuration),
        nic = c.resource.azurerm_network_interface.node_2_nic_0;
      if (mode === 'unresolved-public-reference')
        nic.ip_configuration[0].public_ip_address_id = `\${azurerm_public_ip.missing.id}`;
      if (mode === 'foreign-public-reference') c.resource.azurerm_public_ip.node_2.resource_group_name = 'foreign';
      if (mode === 'configured-identity') nic.name = '__NIC__';
      if (mode === 'unknown-ip-field') nic.ip_configuration[0].foreign = true;
      if (mode === 'dynamic-noop-input') nic.ip_configuration[0].private_ip_address = '10.20.0.88';
      f.stage.configuration = JSON.stringify(c);
      f.stage.configurationSha256 = f.hash(f.stage.configuration);
      f.receipt.configurationSha256 = f.stage.configurationSha256;
    }
    expect(f.validate).toThrow();
  });

test('NIC schema mapping selects every configurable installed field, including the complete timeout subtree', async () => {
  const f = await fixture();
  const schema = JSON.parse(
    readFileSync(new URL('./terraform-network-nic-schema-fixture.json', import.meta.url), 'utf8'),
  );
  const fields = Object.entries(schema.block.attributes)
    .filter(
      ([, v]) => (v as { optional?: boolean; required?: boolean }).optional || (v as { required?: boolean }).required,
    )
    .map(([key]) => key);
  const paths = f.selections.prior[f.stage.addresses[0]];
  expect(fields.every((field) => paths.includes(field))).toBe(true);
  expect(paths.includes('timeouts')).toBe(true);
  expect(
    Object.keys(schema.block.block_types.ip_configuration.block.attributes).every((field) =>
      paths.includes(`ip_configuration.0.${field}`),
    ),
  ).toBe(true);
});

const bindingRoots: string[] = [];
afterEach(async () => {
  for (const path of bindingRoots.splice(0)) await rm(path, { recursive: true });
});
async function bindingFixture() {
  const f = await fixture();
  const root = await mkdtemp(join(tmpdir(), 'azure-network-nic-binding-'));
  bindingRoots.push(root);
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  const state = { application: 'planned', paths: 0, changeAfterRead: false, failedRead: false };
  const session = {
    async readPlanApplicationState() {
      return state.application;
    },
    async readPlannedResourcePaths() {
      state.paths++;
      if (state.failedRead) throw Error('synthetic private read failure');
      return structuredClone(f.prior);
    },
    async readProposedResourcePaths() {
      state.paths++;
      if (state.changeAfterRead) state.application = 'applying';
      return structuredClone(f.proposed);
    },
  } as unknown as TerraformSession;
  const run = (signal?: AbortSignal) =>
    bindAzureTerraformNetworkNicPlan(
      f.plan,
      f.stage,
      f.inventory,
      f.receipt,
      f.receipt.providerLockSha256,
      session,
      store,
      {},
      signal,
    );
  const name = `${f.plan.planId}-terraform-network-node-${f.stage.node}-nic-binding.json`;
  return { ...f, store, state, session, run, name };
}

test('owning NIC binding persists exact validated projections and reuses them after consumed apply', async () => {
  const f = await bindingFixture();
  const binding = await f.run();
  expect(binding.receiptSha256).toBe(canonicalSha256(f.receipt));
  expect(f.state.paths).toBe(2);
  f.state.application = 'applied';
  expect(await f.run()).toEqual(binding);
  expect(f.state.paths).toBe(2);
});

for (const mode of [
  'foreign-owner',
  'missing-paths',
  'applied-before-read',
  'changed-during-read',
  'read-failure',
  'invalid-projection',
  'pre-aborted',
  'wrong-lock',
] as const)
  test(`owning NIC binding rejects ${mode} without publishing private acceptance`, async () => {
    const f = await bindingFixture();
    if (mode === 'foreign-owner') f.store.owner.account = 'example-foreign';
    if (mode === 'missing-paths') f.session.readProposedResourcePaths = undefined;
    if (mode === 'applied-before-read') f.state.application = 'applied';
    if (mode === 'changed-during-read') f.state.changeAfterRead = true;
    if (mode === 'read-failure') f.state.failedRead = true;
    if (mode === 'wrong-lock') f.receipt.providerLockSha256 = 'f'.repeat(64);
    if (mode === 'invalid-projection') f.proposed[f.stage.addresses[1]]['ip_configuration.length'] = 2;
    const signal = mode === 'pre-aborted' ? AbortSignal.abort() : undefined;
    await expect(f.run(signal)).rejects.toThrow();
    if (mode !== 'foreign-owner') await expect(f.store.read(f.name)).rejects.toThrow();
  });

for (const key of [
  'schemaVersion',
  'planSha256',
  'stageSha256',
  'inventorySha256',
  'receiptSha256',
  'providerLockSha256',
  'prior',
  'extra',
] as const)
  test(`owning NIC binding rejects tampered ${key} after apply without re-reading consumed plans`, async () => {
    const f = await bindingFixture();
    const binding = await f.run();
    f.state.application = 'applied';
    if (key === 'prior')
      (binding.prior as Record<string, Record<string, unknown>>)[f.stage.addresses[1]].mac_address = '__MAC__';
    else binding[key] = 'foreign';
    await f.store.write(f.name, binding);
    await expect(f.run()).rejects.toThrow();
    expect(f.state.paths).toBe(2);
  });

test('owning NIC binding resumes failed publication only while original saved plan remains unsubmitted', async () => {
  const f = await bindingFixture();
  const write = f.store.write.bind(f.store);
  let fail = true;
  f.store.write = async (name, value) => {
    if (fail) {
      fail = false;
      throw Error('synthetic publication failure');
    }
    return write(name, value);
  };
  await expect(f.run()).rejects.toThrow();
  const binding = await f.run();
  expect(binding.receiptSha256).toBe(canonicalSha256(f.receipt));
  expect(f.state.paths).toBe(4);
});

test('missing NIC binding after consumed apply fails without querying historical runner projections', async () => {
  const f = await bindingFixture();
  await f.run();
  await f.store.remove(f.name);
  f.state.application = 'applied';
  await expect(f.run()).rejects.toThrow();
  expect(f.state.paths).toBe(2);
});
test('owning NIC binding survives a completed publication with a lost response after plan consumption', async () => {
  const f = await bindingFixture();
  const write = f.store.write.bind(f.store);
  let loss = true;
  f.store.write = async (name, value) => {
    await write(name, value);
    if (loss) {
      loss = false;
      f.state.application = 'applied';
      throw Error('synthetic publication response loss');
    }
  };
  await expect(f.run()).rejects.toThrow();
  const binding = await f.run();
  expect(binding.receiptSha256).toBe(canonicalSha256(f.receipt));
  expect(f.state.paths).toBe(2);
});
