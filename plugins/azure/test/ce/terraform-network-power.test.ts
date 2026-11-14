import { expect, test } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import {
  azureTerraformNetworkPowerDeployment,
  observeAzureTerraformNetworkPower,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from '../../src/ce/terraform-network-power';
import { networkUpdateFixture } from './network-update-fixture';

async function fixture(
  operation: 'deallocate' | 'start' = 'deallocate',
  phase: 'mutation' | 'release' | 'final' = 'mutation',
) {
  const f = networkUpdateFixture(true, 'terraform', true, false);
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const deployment = await azureTerraformNetworkPowerDeployment(f.plan, inventory, 2, operation, phase !== 'mutation');
  const receipt: PlanReceipt = {
    schemaVersion: 1,
    deploymentId: deployment.deploymentId,
    engine: 'terraform',
    backendIdentity: deployment.backendIdentity,
    configurationSha256: f.hash(deployment.configuration),
    providerLockSha256: f.hash(deployment.providerLock),
    planSha256: 'b'.repeat(64),
    noChanges: phase === 'final',
    changes:
      phase === 'final'
        ? []
        : [
            {
              address: 'azapi_resource_action.ce_network',
              type: 'azapi_resource_action',
              actions: [phase === 'mutation' ? 'create' : 'delete'],
            },
          ],
  };
  const resource = JSON.parse(
    (await azureTerraformNetworkPowerDeployment(f.plan, inventory, 2, operation)).configuration,
  ).resource.azapi_resource_action.ce_network;
  const proposed = { 'azapi_resource_action.ce_network': phase === 'mutation' ? resource : null };
  const prior = { 'azapi_resource_action.ce_network': phase === 'release' ? resource : null };
  const validate = () => validateAzureTerraformNetworkPowerPlan(f.plan, inventory, 2, operation, receipt, phase);
  const project = () =>
    validateAzureTerraformNetworkPowerProjection(f.plan, inventory, 2, operation, receipt, phase, prior, proposed);
  return { ...f, inventory, deployment, receipt, proposed, prior, resource, validate, project };
}

for (const operation of ['deallocate', 'start'] as const)
  for (const phase of ['mutation', 'release', 'final'] as const)
    test(`Terraform network power binds selected VM and exact ${operation} ${phase} stage`, async () => {
      const f = await fixture(operation, phase);
      await expect(f.validate()).resolves.toEqual(f.receipt);
      await expect(f.project()).resolves.toBeUndefined();
      const config = JSON.parse(f.deployment.configuration);
      expect(config.provider.azapi.subscription_id).toBe(f.plan.subscription.id);
      expect(config.resource).toEqual(
        phase === 'mutation' ? { azapi_resource_action: { ce_network: f.resource } } : undefined,
      );
      expect(f.resource.resource_id).toBe(f.inventory.nodes['2'].resourceId);
      expect(f.resource.locks).toEqual([f.inventory.nodes['2'].resourceId]);
      expect(f.resource.action).toBe(operation);
      expect(f.deployment.stage).toContain(`node-2-${operation}`);
      expect(f.mutations()).toBe(0);
    });

for (const mode of [
  'foreign-engine',
  'foreign-backend',
  'changed-config',
  'changed-lock',
  'unresolved-plan',
  'destroy',
  'import',
  'relinquish',
  'action-invocation',
  'foreign-address',
  'foreign-type',
  'replace',
  'extra-change',
  'extra-field',
  'contradictory-nochanges',
  'malformed-changes',
] as const)
  test(`Terraform network power rejects ${mode} saved effect`, async () => {
    const f = await fixture();
    const row = f.receipt as unknown as Record<string, unknown>;
    if (mode === 'foreign-engine') row.engine = 'native';
    if (mode === 'foreign-backend') row.backendIdentity = 'local:foreign';
    if (mode === 'changed-config') row.configurationSha256 = 'c'.repeat(64);
    if (mode === 'changed-lock') row.providerLockSha256 = 'c'.repeat(64);
    if (mode === 'unresolved-plan') row.planSha256 = '__PLAN__';
    if (mode === 'destroy') row.operation = 'destroy';
    if (mode === 'import') row.imports = [{}];
    if (mode === 'relinquish') row.relinquishments = [{}];
    if (mode === 'action-invocation') row.actionInvocations = [{}];
    if (mode === 'foreign-address') f.receipt.changes[0].address = 'azapi_resource_action.foreign';
    if (mode === 'foreign-type') f.receipt.changes[0].type = 'azurerm_linux_virtual_machine';
    if (mode === 'replace') f.receipt.changes[0].actions = ['delete', 'create'];
    if (mode === 'extra-change') f.receipt.changes.push(structuredClone(f.receipt.changes[0]));
    if (mode === 'extra-field') row.foreign = true;
    if (mode === 'contradictory-nochanges') row.noChanges = true;
    if (mode === 'malformed-changes') row.changes = null;
    await expect(f.validate()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const phase of ['mutation', 'release'] as const)
  for (const mode of [
    'foreign-vm',
    'wrong-method',
    'wrong-operation',
    'foreign-lock',
    'wrong-api',
    'extra-projection',
    'missing-projection',
    'unresolved',
    'foreign-prior',
  ] as const)
    test(`Terraform network power rejects ${phase} ${mode} prior/proposed ownership projection`, async () => {
      const f = await fixture('deallocate', phase);
      const selected = phase === 'mutation' ? f.proposed : f.prior;
      const value = selected['azapi_resource_action.ce_network'] as Record<string, unknown>;
      if (mode === 'foreign-vm') value.resource_id = f.inventory.nodes['1'].resourceId;
      if (mode === 'wrong-method') value.method = 'DELETE';
      if (mode === 'wrong-operation') value.action = 'start';
      if (mode === 'foreign-lock') value.locks = [f.inventory.nodes['1'].resourceId];
      if (mode === 'wrong-api') value.type = 'Microsoft.Compute/virtualMachines@2000-01-01';
      if (mode === 'extra-projection') Object.assign(selected, { foreign: null });
      if (mode === 'missing-projection')
        delete (selected as Record<string, unknown>)['azapi_resource_action.ce_network'];
      if (mode === 'unresolved') value.resource_id = '__VM__';
      if (mode === 'foreign-prior')
        f.prior['azapi_resource_action.ce_network'] = { ...f.resource, resource_id: f.inventory.nodes['1'].resourceId };
      await expect(f.project()).rejects.toThrow();
      expect(f.mutations()).toBe(0);
    });

test('Terraform network power rejects native and non-network plans without widening existing lifecycle guards', async () => {
  const f = networkUpdateFixture(false, 'native');
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  await expect(azureTerraformNetworkPowerDeployment(f.plan, inventory, 1, 'deallocate')).rejects.toThrow();
  const tf = await fixture();
  await expect(azureTerraformNetworkPowerDeployment(tf.original, tf.inventory, 2, 'deallocate')).rejects.toThrow();
  await expect(azureTerraformNetworkPowerDeployment(tf.plan, tf.inventory, 0, 'deallocate')).rejects.toThrow();
  expect(f.mutations()).toBe(0);
});

test('Terraform network power isolates single-node controls and distinct HA node/operation backends', async () => {
  const f = networkUpdateFixture(false, 'terraform', true, false);
  const inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api);
  const single = await azureTerraformNetworkPowerDeployment(f.plan, inventory, 1, 'deallocate');
  expect(JSON.parse(single.configuration).resource.azapi_resource_action.ce_network.resource_id).toBe(
    inventory.nodes['1'].resourceId,
  );
  const ha = await fixture();
  const ids = new Set<string>();
  for (const node of [1, 2, 3])
    for (const operation of ['start', 'deallocate'] as const) {
      const deployment = await azureTerraformNetworkPowerDeployment(ha.plan, ha.inventory, node, operation);
      expect(ids.has(deployment.backendIdentity)).toBe(false);
      ids.add(deployment.backendIdentity);
    }
  expect(ids.size).toBe(6);
});

for (const mode of ['duplicate-uuid', 'missing-node', 'foreign-owner', 'unresolved-resource', 'tampered-plan'] as const)
  test(`Terraform network power rejects ${mode} inventory or saved action before execution`, async () => {
    const f = await fixture();
    if (mode === 'duplicate-uuid') f.inventory.nodes['2'].vmId = f.inventory.nodes['1'].vmId;
    if (mode === 'missing-node') delete f.inventory.nodes['2'];
    if (mode === 'foreign-owner') f.inventory.nodes['2'].ownerPlanSha256 = 'c'.repeat(64);
    if (mode === 'unresolved-resource') f.inventory.nodes['2'].resourceId = '__VM__';
    if (mode === 'tampered-plan') {
      const selected = f.plan.actions.find((a) => a.kind === 'vm-deallocate' && a.node === 2);
      if (!selected) throw Error('missing fixture deallocate action');
      selected.resourceId = f.inventory.nodes['1'].resourceId;
    }
    await expect(f.validate()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const operation of ['deallocate', 'start'] as const)
  test(`Terraform network ${operation} observer binds current UUID, NIC progress and exact power state`, async () => {
    const f = await fixture(operation);
    const api = {
      async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
        if (args[0] === 'vm' && args[1] === 'show')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              ...f.vms[1],
              powerState: operation === 'start' ? 'VM running' : 'VM deallocated',
            }),
          };
        return f.api.exec(command, args, options);
      },
    };
    const result = await observeAzureTerraformNetworkPower(f.plan, f.inventory, 2, operation, [], api);
    expect(result.vmId).toBe(f.inventory.nodes['2'].vmId);
    expect(result.resourceId).toBe(f.inventory.nodes['2'].resourceId);
    expect(result.converged).toBe(true);
    expect(result.powerState).toBe(operation === 'start' ? 'running' : 'deallocated');
    expect(result.inventory.nodes).toEqual(f.inventory.nodes);
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'changed-uuid',
  'foreign-resource',
  'foreign-owner',
  'foreign-engine',
  'unknown-power',
  'missing-power',
  'unavailable',
  'malformed',
  'changed-nic',
  'partial-result',
  'service-error',
] as const)
  test(`Terraform network power observer rejects ${mode} without an acknowledgment pass`, async () => {
    const f = await fixture();
    const vm = { ...structuredClone(f.vms[1]), powerState: 'VM deallocated' } as Record<string, unknown>;
    if (mode === 'changed-uuid') vm.vmId = f.vms[0].vmId;
    if (mode === 'foreign-resource') vm.id = f.vms[0].id;
    if (mode === 'foreign-owner') (vm.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'foreign-engine') (vm.tags as Record<string, unknown>)['xcsh-execution-engine'] = 'native';
    if (mode === 'unknown-power') vm.powerState = 'Succeeded';
    if (mode === 'missing-power') delete vm.powerState;
    if (mode === 'changed-nic') f.sliNic.macAddress = '02:00:00:00:ff:01';
    if (mode === 'partial-result') vm.nextLink = 'https://example.invalid/next';
    if (mode === 'service-error') vm.error = { code: 'ServiceUnavailable' };
    const api = {
      async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
        if (args[0] === 'vm' && args[1] === 'show')
          return {
            exitCode: mode === 'unavailable' ? 1 : 0,
            stderr: '',
            stdout: mode === 'malformed' ? 'invalid private marker' : JSON.stringify(vm),
          };
        return f.api.exec(command, args, options);
      },
    };
    await expect(observeAzureTerraformNetworkPower(f.plan, f.inventory, 2, 'deallocate', [], api)).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

test('Terraform network power observes nonconvergence separately from VM/interface identity', async () => {
  const f = await fixture();
  const api = {
    async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
      if (args[0] === 'vm' && args[1] === 'show')
        return { exitCode: 0, stderr: '', stdout: JSON.stringify({ ...f.vms[1], powerState: 'VM running' }) };
      return f.api.exec(command, args, options);
    },
  };
  const result = await observeAzureTerraformNetworkPower(f.plan, f.inventory, 2, 'deallocate', [], api);
  expect(result.converged).toBe(false);
  expect(result.powerState).toBe('running');
  expect(result.vmId).toBe(f.vms[1].vmId);
});

test('Terraform network power bounds ignored cloud cancellation without invoking a mutation', async () => {
  const f = await fixture();
  let calls = 0;
  await expect(
    observeAzureTerraformNetworkPower(
      f.plan,
      f.inventory,
      2,
      'deallocate',
      [],
      {
        async exec() {
          calls++;
          return new Promise<never>(() => {});
        },
      },
      AbortSignal.timeout(20),
    ),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});
