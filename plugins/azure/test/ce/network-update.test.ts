import { expect, test } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  azureNetworkUpdateResolvedArguments,
  captureAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from '../../src/ce/network-update';
import {
  buildAzureNetworkUpdateTerraformStage,
  validateAzureNetworkUpdateTerraformReceipt,
} from '../../src/ce/network-update-terraform';
import { networkUpdateFixture } from './network-update-fixture';

for (const engine of ['native', 'terraform'] as const)
  for (const ha of [false, true]) {
    test(`captures complete ${engine} ${ha ? 'three-node' : 'single'} network ownership before action resolution`, async () => {
      const f = networkUpdateFixture(ha, engine),
        plan = f.plan;
      const inventory = await captureAzureNetworkUpdateInventory(plan, f.api);
      expect(Object.keys(inventory.nodes)).toHaveLength(ha ? 3 : 1);
      expect(Object.values(inventory.nodes).flatMap((node) => Object.values(node.nics))).toHaveLength(ha ? 6 : 2);
      for (const action of plan.actions.filter((a) => a.kind === 'nic-update'))
        expect(
          azureNetworkUpdateResolvedArguments(plan, action, inventory)[(action.args as string[]).indexOf('--name') + 1],
        ).toBe(engine === 'terraform' ? 'primary' : 'ipconfig1');
      if (ha) {
        expect(inventory.nodes['2'].ownerPlanSha256).toBe('a'.repeat(64));
        expect(inventory.nodes['2'].nics['1'].ownerPlanSha256).toBe(f.original.planSha256);
      }
      expect(f.mutations()).toBe(0);
    });
    test(`retains ${engine} ${ha ? 'three-node' : 'single'} identities through one selected subnet stage`, async () => {
      const f = networkUpdateFixture(ha, engine),
        plan = f.plan;
      const before = await captureAzureNetworkUpdateInventory(plan, f.api);
      f.config(f.sliNic).subnet = { id: f.target };
      f.config(f.sliNic).privateIPAddress = '10.20.2.5';
      const current = await captureAzureNetworkUpdateInventory(plan, f.api);
      expect(() => verifyAzureNetworkUpdateProgress(plan, before, current, ['1:1'])).not.toThrow();
      expect(() => verifyAzureNetworkUpdateProgress(plan, before, current, [])).toThrow(/unauthorized subnet/);
      expect(f.mutations()).toBe(0);
    });
  }

for (const mode of [
  'account',
  'unavailable',
  'malformed',
  'duplicate-vm',
  'missing-vm',
  'vm-owner',
  'duplicate-attachment',
  'nic-owner',
  'mac',
  'duplicate-mac',
  'missing-config-name',
  'foreign-config-id',
  'multiple-configs',
  'missing-config-state',
  'failed-config-provisioning',
  'wrong-source-ip',
  'target-cidr',
  'cross-vnet',
  'missing-target',
  'vnet-owner',
  'static-address',
] as const)
  test(`network preflight rejects ${mode} before mutation`, async () => {
    const f = networkUpdateFixture(true, 'terraform');
    if (mode === 'account') f.state.wrongAccount = true;
    if (mode === 'unavailable') f.state.unavailable = true;
    if (mode === 'malformed') f.state.malformed = true;
    if (mode === 'duplicate-vm') f.vms[1].vmId = f.vms[0].vmId;
    if (mode === 'missing-vm') f.vms.pop();
    if (mode === 'vm-owner') f.vms[0].tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'duplicate-attachment')
      f.vms[0].networkProfile.networkInterfaces.push(f.vms[0].networkProfile.networkInterfaces[0]);
    if (mode === 'nic-owner') (f.firstNic.tags as Record<string, string>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'mac') f.firstNic.macAddress = 'ff:ff:ff:ff:ff:ff';
    if (mode === 'duplicate-mac') f.sliNic.macAddress = f.firstNic.macAddress;
    if (mode === 'missing-config-name') delete f.config(f.firstNic).name;
    if (mode === 'foreign-config-id') f.config(f.firstNic).id = `${f.firstNic.id}/ipConfigurations/foreign`;
    if (mode === 'multiple-configs')
      (f.firstNic.ipConfigurations as unknown[]).push(structuredClone(f.config(f.firstNic)));
    if (mode === 'missing-config-state') delete f.config(f.firstNic).privateIPAddressVersion;
    if (mode === 'failed-config-provisioning') f.config(f.firstNic).provisioningState = 'Failed';
    if (mode === 'wrong-source-ip') f.config(f.firstNic).privateIPAddress = '10.99.0.4';
    if (mode === 'target-cidr') (f.subnets.get(f.target) as Record<string, unknown>).addressPrefix = '10.99.0.0/24';
    if (mode === 'cross-vnet') f.config(f.sliNic).subnet = { id: `${f.vnet.id}-foreign/subnets/sli` };
    if (mode === 'missing-target') f.subnets.delete(f.target);
    if (mode === 'vnet-owner') f.vnet.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'static-address') f.config(f.sliNic).privateIPAllocationMethod = 'Static';
    const run = () => captureAzureNetworkUpdateInventory(f.plan, f.api);
    if (mode === 'malformed')
      await expect(run()).rejects.toThrow('Azure network update identity: malformed cloud JSON');
    else await expect(run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'unknown-fields',
  'partial',
  'foreign-digest',
  'future',
  'duplicate-uuid',
  'duplicate-ip',
  'foreign-config',
  'changed-mac',
  'changed-uuid',
  'wrong-stage',
  'duplicate-stage',
] as const)
  test(`network checkpoint/replay rejects ${mode}`, async () => {
    const f = networkUpdateFixture(true, 'native'),
      before = await captureAzureNetworkUpdateInventory(f.plan, f.api),
      current = structuredClone(before);
    if (mode === 'unknown-fields') Object.assign(current, { bootstrap: 'synthetic-private-marker' });
    if (mode === 'partial') delete current.nodes['3'];
    if (mode === 'foreign-digest') current.planSha256 = 'f'.repeat(64);
    if (mode === 'future') current.collectedAt = '2099-01-01T00:00:00Z';
    if (mode === 'duplicate-uuid') current.nodes['2'].vmId = current.nodes['1'].vmId;
    if (mode === 'duplicate-ip') current.nodes['2'].nics['0'].privateIp = current.nodes['1'].nics['0'].privateIp;
    if (mode === 'foreign-config') current.nodes['1'].nics['0'].ipConfigurationId += '-foreign';
    if (mode === 'changed-mac') current.nodes['1'].nics['0'].mac = '02:00:00:aa:bb:cc';
    if (mode === 'changed-uuid') current.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
    const applied = mode === 'wrong-stage' ? ['4:0'] : mode === 'duplicate-stage' ? ['1:0', '1:0'] : [];
    expect(() => verifyAzureNetworkUpdateProgress(f.plan, before, current, applied)).toThrow();
  });

test('a literal configuration name cannot be silently rebound to a different observed Terraform configuration', async () => {
  const f = networkUpdateFixture(false, 'terraform');
  for (const action of f.plan.actions.filter((action) => action.kind === 'nic-update'))
    (action.args as string[])[(action.args as string[]).indexOf('--name') + 1] = 'ipconfig1';
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  f.plan.planSha256 = canonicalSha256(draft);
  f.plan.planId = `azure-ce-${f.plan.planSha256.slice(0, 24)}`;
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const action = f.plan.actions.find((a) => a.kind === 'nic-update');
  if (!action) throw Error('fixture action missing');
  await expect(
    Promise.resolve().then(() => azureNetworkUpdateResolvedArguments(f.plan, action, inventory)),
  ).rejects.toThrow(/saved configuration name/);
});

for (const ha of [false, true])
  test(`Terraform ${ha ? 'three-node' : 'single'} network stage changes only selected NIC subnet/output references`, async () => {
    const f = networkUpdateFixture(ha, 'terraform'),
      before = await captureAzureNetworkUpdateInventory(f.plan, f.api),
      source = f.source(),
      stage = buildAzureNetworkUpdateTerraformStage(f.plan, source, before, 1);
    const original = JSON.parse(source),
      next = JSON.parse(stage.configuration);
    expect(next.resource.azurerm_linux_virtual_machine).toEqual(original.resource.azurerm_linux_virtual_machine);
    expect(next.resource.azurerm_subnet).toEqual(original.resource.azurerm_subnet);
    for (const nic of f.plan.nics) {
      const key = `node_1_nic_${nic.index}`;
      expect(next.resource.azurerm_network_interface[key].ip_configuration[0].subnet_id).toBe(
        before.nodes['1'].nics[String(nic.index)].targetSubnetId,
      );
      next.resource.azurerm_network_interface[key].ip_configuration[0].subnet_id =
        original.resource.azurerm_network_interface[key].ip_configuration[0].subnet_id;
      next.output.ce_interfaces.value[`1:${nic.index}`].subnet_id =
        original.output.ce_interfaces.value[`1:${nic.index}`].subnet_id;
    }
    expect(next).toEqual(original);
    expect(stage.previousConfigurationSha256).toBe(f.hash(source));
    expect(stage.configurationSha256).toBe(f.hash(stage.configuration));
    const receipt: PlanReceipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: f.plan.deploymentName,
      backendIdentity: `local:${f.plan.deploymentName}`,
      configurationSha256: stage.configurationSha256,
      providerLockSha256: 'f'.repeat(64),
      planSha256: 'e'.repeat(64),
      noChanges: false,
      changes: stage.addresses.map((address) => ({ address, type: 'azurerm_network_interface', actions: ['update'] })),
    };
    expect(() => validateAzureNetworkUpdateTerraformReceipt(f.plan, stage, receipt, 'f'.repeat(64))).not.toThrow();
    for (const bad of [
      { ...receipt, engine: 'native' },
      { ...receipt, providerLockSha256: 'a'.repeat(64) },
      { ...receipt, noChanges: true },
      { ...receipt, imports: [{}] },
      { ...receipt, relinquishments: [{}] },
      { ...receipt, actionInvocations: {} },
      {
        ...receipt,
        changes: [
          {
            address: 'azurerm_linux_virtual_machine.node_1',
            type: 'azurerm_linux_virtual_machine',
            actions: ['update'],
          },
        ],
      },
      {
        ...receipt,
        changes: [{ address: stage.addresses[0], type: 'azurerm_network_interface', actions: ['delete', 'create'] }],
      },
      {
        ...receipt,
        changes: [
          { address: stage.addresses[0], type: 'azurerm_network_interface', actions: ['update'], importing: {} },
        ],
      },
    ])
      expect(() =>
        validateAzureNetworkUpdateTerraformReceipt(f.plan, stage, bad as PlanReceipt, 'f'.repeat(64)),
      ).toThrow();
  });

for (const mode of ['provider', 'survivor-owner', 'nic-owner', 'name', 'subnet', 'output', 'malformed'] as const)
  test(`network transformation rejects changed retained ${mode}`, async () => {
    const f = networkUpdateFixture(true, 'terraform'),
      inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api),
      source = JSON.parse(f.source());
    if (mode === 'provider') source.provider.azurerm.subscription_id = 'example-foreign';
    if (mode === 'survivor-owner')
      source.resource.azurerm_linux_virtual_machine.node_2.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'nic-owner')
      source.resource.azurerm_network_interface.node_2_nic_0.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'name') source.resource.azurerm_network_interface.node_1_nic_0.ip_configuration[0].name = 'foreign';
    if (mode === 'subnet')
      source.resource.azurerm_network_interface.node_1_nic_0.ip_configuration[0].subnet_id = `${f.vnet.id}/subnets/foreign`;
    if (mode === 'output') source.output.ce_interfaces.value['1:0'].role = 'sli';
    const text = mode === 'malformed' ? 'synthetic-private-marker' : JSON.stringify(source);
    expect(() => buildAzureNetworkUpdateTerraformStage(f.plan, text, inventory, 1)).toThrow(
      mode === 'malformed' ? 'Azure Terraform network update: malformed retained source JSON' : undefined,
    );
  });

for (const fault of [
  'vm-command',
  'restart-owner',
  'restart-missing',
  'nic-command',
  'nic-name',
  'subscription',
  'duplicate-flag',
  'unresolved-name',
] as const)
  test(`complete network action resolution rejects ${fault} before cloud mutation`, async () => {
    const f = networkUpdateFixture(true, 'native');
    const action = f.plan.actions.find((row) => row.kind === 'nic-update' && row.node === 3);
    const stop = f.plan.actions.find((row) => row.kind === 'vm-deallocate' && row.node === 3);
    const start = f.plan.actions.find((row) => row.kind === 'vm-start' && row.node === 3);
    if (!action?.args || !stop?.args || !start) throw Error('missing fault action');
    if (fault === 'vm-command') stop.args[1] = 'delete';
    if (fault === 'restart-owner') start.expectedOwnerPlanSha256 = 'f'.repeat(64);
    if (fault === 'restart-missing') f.plan.actions = f.plan.actions.filter((row) => row !== start);
    if (fault === 'nic-command') action.args[3] = 'delete';
    if (fault === 'nic-name') action.args[action.args.indexOf('--nic-name') + 1] = 'foreign-nic';
    if (fault === 'subscription') action.args[action.args.indexOf('--subscription') + 1] = 'foreign';
    if (fault === 'duplicate-flag') action.args.push('--subnet', f.target);
    if (fault === 'unresolved-name') action.args[action.args.indexOf('--name') + 1] = '__FOREIGN_CONFIGURATION__';
    const { planId: _id, planSha256: _digest, ...draft } = f.plan;
    f.plan.planSha256 = canonicalSha256(draft);
    f.plan.planId = `azure-ce-${f.plan.planSha256.slice(0, 24)}`;
    if (fault === 'unresolved-name') {
      const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
      expect(() => azureNetworkUpdateResolvedArguments(f.plan, action, inventory)).toThrow(/saved configuration name/);
    } else await expect(captureAzureNetworkUpdateInventory(f.plan, f.api)).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

test('aborted network preflight performs no cloud calls', async () => {
  const f = networkUpdateFixture(true, 'terraform'),
    controller = new AbortController();
  controller.abort(Error('synthetic aborted'));
  await expect(captureAzureNetworkUpdateInventory(f.plan, f.api, controller.signal)).rejects.toThrow(
    'synthetic aborted',
  );
  expect(f.cloudCalls()).toBe(0);
  expect(f.mutations()).toBe(0);
});

for (const mode of [
  'unknown-receipt-field',
  'false-no-change',
  'foreign-no-op',
  'wrong-no-op-type',
  'unknown-stage-field',
  'malformed-change',
  'missing-plan-hash',
  'duplicate-change',
  'unresolved-configuration',
  'changed-stage-output',
] as const)
  test(`Terraform NIC saved plan rejects ${mode} before execution`, async () => {
    const f = networkUpdateFixture(false, 'terraform');
    const before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
    const stage = buildAzureNetworkUpdateTerraformStage(f.plan, f.source(), before, 1);
    const receipt: PlanReceipt = {
      schemaVersion: 1,
      engine: 'terraform',
      deploymentId: f.plan.deploymentName,
      backendIdentity: `local:${f.plan.deploymentName}`,
      configurationSha256: stage.configurationSha256,
      providerLockSha256: 'f'.repeat(64),
      planSha256: 'e'.repeat(64),
      noChanges: false,
      changes: stage.addresses.map((address) => ({ address, type: 'azurerm_network_interface', actions: ['update'] })),
    };
    if (mode === 'unknown-receipt-field') Object.assign(receipt, { token: 'synthetic-private-marker' });
    if (mode === 'false-no-change') receipt.changes = receipt.changes.map((row) => ({ ...row, actions: ['no-op'] }));
    if (mode === 'foreign-no-op')
      receipt.changes.push({
        address: 'azurerm_linux_virtual_machine.foreign',
        type: 'azurerm_linux_virtual_machine',
        actions: ['no-op'],
      });
    if (mode === 'wrong-no-op-type')
      receipt.changes.push({
        address: 'azurerm_linux_virtual_machine.node_1',
        type: 'azurerm_subnet',
        actions: ['no-op'],
      });
    if (mode === 'unknown-stage-field') Object.assign(stage, { admission: 'synthetic-private-marker' });
    if (mode === 'malformed-change') receipt.changes = [null] as unknown as PlanReceipt['changes'];
    if (mode === 'missing-plan-hash') receipt.planSha256 = '';
    if (mode === 'duplicate-change') receipt.changes.push(receipt.changes[0]);
    if (mode === 'unresolved-configuration') {
      const next = JSON.parse(stage.configuration);
      next.resource.azurerm_network_interface.node_1_nic_1.ip_configuration[0].subnet_id = '__TARGET_SUBNET__';
      stage.configuration = JSON.stringify(next);
      stage.configurationSha256 = f.hash(stage.configuration);
      receipt.configurationSha256 = stage.configurationSha256;
    }
    if (mode === 'changed-stage-output') {
      const next = JSON.parse(stage.configuration);
      next.output.ce_interfaces.value['1:1'].subnet_id = '/foreign';
      stage.configuration = JSON.stringify(next);
      stage.configurationSha256 = f.hash(stage.configuration);
      receipt.configurationSha256 = stage.configurationSha256;
    }
    expect(() => validateAzureNetworkUpdateTerraformReceipt(f.plan, stage, receipt, 'f'.repeat(64))).toThrow();
    expect(f.mutations()).toBe(0);
  });

test('Terraform NIC final no-change accepts only resource addresses in the exact retained configuration', async () => {
  const f = networkUpdateFixture(true, 'terraform');
  const before = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const stage = buildAzureNetworkUpdateTerraformStage(f.plan, f.source(), before, 1);
  const configuration = JSON.parse(stage.configuration);
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: f.plan.deploymentName,
    backendIdentity: `local:${f.plan.deploymentName}`,
    configurationSha256: stage.configurationSha256,
    providerLockSha256: 'f'.repeat(64),
    planSha256: 'e'.repeat(64),
    noChanges: true,
    changes: Object.entries(configuration.resource).flatMap(([type, names]) =>
      Object.keys(names as object).map((name) => ({
        address: `${type}.${name}`,
        type,
        actions: ['no-op'] as ['no-op'],
      })),
    ),
  };
  expect(() => validateAzureNetworkUpdateTerraformReceipt(f.plan, stage, receipt, 'f'.repeat(64))).not.toThrow();
  expect(f.mutations()).toBe(0);
});
