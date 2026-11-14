import { expect } from 'bun:test';
import type { AzExecApi } from '../../src/az/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { observeAzureTerraformNetworkReplacementCurrent } from '../../src/ce/terraform-network-replacement-current';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { test } from './owned-fixture-test';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';

async function fixture(ha = false, phase: 'intact' | 'quiesced' | 'launched' = 'intact') {
  const f = await terraformNetworkBoundReplacementFixture(ha);
  const { binding } = await bindAzureTerraformNetworkReplacementSource(
    f.input.plan,
    f.terraform,
    f.store,
    f.api,
    {},
    f.loaders,
    f.input.site,
    f.dependencies.qualifyAcceptance,
  );
  const source = JSON.parse(binding.source),
    resources = source.resource;
  const state = { phase, loss: '', calls: 0, changed: false };
  const selected = f.input.plan.intent.replacementNode as number,
    old = binding.before.nodes[String(selected)];
  const newVmId = '00000000-0000-4000-8000-000000000099';
  const api: AzExecApi = {
    async exec(command, args, options) {
      state.calls++;
      const result = await f.api.exec(command, args, options);
      if (state.loss === 'unavailable') return { exitCode: 1, stdout: '', stderr: 'synthetic unavailable' };
      if (state.loss === 'malformed') return { ...result, stdout: '{' };
      let row = JSON.parse(result.stdout);
      if (args[0] === 'vm' && args[1] === 'list') {
        row = row.map((vm: Record<string, unknown>, i: number) => ({
          ...vm,
          tags: structuredClone(resources.azurerm_linux_virtual_machine[`node_${i + 1}`].tags),
        }));
        if (state.phase === 'quiesced' && state.loss !== 'selected-present')
          row = row.filter((vm: Record<string, unknown>) => vm.id !== old.resourceId);
        if (state.phase === 'launched') {
          const vm = row.find((vm: Record<string, unknown>) => vm.id === old.resourceId);
          if (vm) {
            vm.vmId = state.loss === 'old-uuid' ? old.vmId : newVmId;
            vm.tags['xcsh-plan-sha256'] = f.input.plan.planSha256;
          }
        }
        if (state.loss === 'missing-vm') row = [];
        if (state.loss === 'duplicate-vm') row.push(structuredClone(row[0]));
        if (state.loss === 'foreign-vm-owner') row[0].tags['xcsh-plan-sha256'] = 'a'.repeat(64);
        if (state.loss === 'wrong-size') row[0].hardwareProfile.vmSize = 'foreign';
        if (state.loss === 'wrong-vm-nic') row[0].networkProfile.networkInterfaces = [];
        if (state.loss === 'survivor-uuid') row[0].vmId = '00000000-0000-4000-8000-000000000098';
        if (state.loss === 'late-vm-race' && state.changed) row[0].vmId = '00000000-0000-4000-8000-000000000098';
      } else if (args.slice(0, 3).join(' ') === 'network nic show') {
        const id = args[args.indexOf('--ids') + 1],
          entry = Object.entries(binding.before.nodes)
            .flatMap(([n, vm]) => Object.entries(vm.nics).map(([i, nic]) => ({ n, i, nic })))
            .find((v) => v.nic.resourceId === id);
        if (!entry) throw Error('unexpected NIC');
        row.tags = structuredClone(resources.azurerm_network_interface[`node_${entry.n}_nic_${entry.i}`].tags);
        if (state.phase === 'quiesced' && entry.n === String(selected)) delete row.virtualMachine;
        if (state.loss === 'wrong-attachment') row.virtualMachine = { id: 'foreign' };
        if (state.loss === 'foreign-nic-owner') row.tags['xcsh-plan-sha256'] = 'a'.repeat(64);
        if (state.loss === 'missing-tag') delete row.tags['xcsh-execution-engine'];
        if (state.loss === 'mac') row.macAddress = '02:00:00:00:00:99';
        const config = row.ipConfigurations[0];
        if (state.loss === 'extra-config') row.ipConfigurations.push(structuredClone(config));
        if (state.loss === 'missing-config') row.ipConfigurations = [];
        if (state.loss === 'config-name') config.name = 'foreign';
        if (state.loss === 'config-id') config.id = 'foreign';
        if (state.loss === 'primary') config.primary = false;
        if (state.loss === 'config-state') config.provisioningState = 'Updating';
        if (state.loss === 'config-version') config.privateIPAddressVersion = 'IPv6';
        if (state.loss === 'allocation')
          config.privateIPAllocationMethod = entry.nic.allocation === 'Dynamic' ? 'Static' : 'Dynamic';
        if (state.loss === 'address') config.privateIPAddress = '10.20.9.5';
        if (state.loss === 'subnet-id') config.subnet.id = 'foreign';
        if (state.loss === 'nic-state') row.provisioningState = 'Updating';
        if (state.loss === 'late-vm-race') state.changed = true;
      } else if (args.slice(0, 4).join(' ') === 'network vnet subnet show') {
        if (state.loss === 'subnet-cidr') row.addressPrefix = '10.20.9.0/24';
        if (state.loss === 'subnet-state') row.provisioningState = 'Updating';
        if (state.loss === 'ambiguous-subnet') row.addressPrefixes = [row.addressPrefix, '10.20.9.0/24'];
      } else if (args[0] === 'account' && state.loss === 'account') row.id = 'foreign';
      return { ...result, stdout: JSON.stringify(row) };
    },
  };
  const request = {
    plan: f.input.plan,
    retainedPlan: f.network,
    binding,
    sourceBindingSha256: canonicalSha256(binding),
    phase,
    ...(phase === 'launched' ? { newVmId } : {}),
  };
  const run = (signal?: AbortSignal) => observeAzureTerraformNetworkReplacementCurrent(request, api, signal);
  return { ...f, binding, state, request, api, run, newVmId, selected };
}
for (const ha of [false, true])
  for (const phase of ['intact', 'quiesced', 'launched'] as const)
    test(`current ${ha ? 'six-NIC HA' : 'single'} ${phase} verifies full retained NICs and exact phase VM identities`, async () => {
      const f = await fixture(ha, phase),
        calls = f.calls.slice(),
        result = await f.run();
      expect(result.phase).toBe(phase);
      expect(result.sourceBindingSha256).toBe(f.request.sourceBindingSha256);
      expect(result.currentOperationalAcceptanceQualified).toBe(false);
      expect(Object.values(result.nodes).flatMap((n) => Object.values(n.nics))).toHaveLength(ha ? 6 : 2);
      const selected = result.nodes[String(f.selected)];
      expect(selected.vmId).toBe(
        phase === 'quiesced'
          ? null
          : phase === 'launched'
            ? f.newVmId
            : f.binding.before.nodes[String(f.selected)].vmId,
      );
      expect(selected.vmState).toBe(phase === 'quiesced' ? 'absent' : 'present');
      expect(f.calls).toEqual(calls);
    }, 20000);
for (const loss of [
  'unavailable',
  'malformed',
  'account',
  'missing-vm',
  'duplicate-vm',
  'foreign-vm-owner',
  'wrong-size',
  'wrong-vm-nic',
  'wrong-attachment',
  'foreign-nic-owner',
  'missing-tag',
  'mac',
  'extra-config',
  'missing-config',
  'config-name',
  'config-id',
  'primary',
  'config-state',
  'config-version',
  'allocation',
  'address',
  'subnet-id',
  'nic-state',
  'subnet-cidr',
  'subnet-state',
  'ambiguous-subnet',
  'late-vm-race',
])
  test(`current phase rejects ${loss} without mutation`, async () => {
    const f = await fixture();
    f.state.loss = loss;
    const calls = f.calls.slice();
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
for (const loss of ['selected-present', 'wrong-attachment'])
  test(`quiesced selected VM rejects ${loss}`, async () => {
    const f = await fixture(false, 'quiesced');
    f.state.loss = loss;
    await expect(f.run()).rejects.toThrow();
  });
test('launched selected node rejects old UUID', async () => {
  const f = await fixture(false, 'launched');
  f.state.loss = 'old-uuid';
  await expect(f.run()).rejects.toThrow();
});
test('HA launched selected node rejects changed survivor UUID', async () => {
  const f = await fixture(true, 'launched');
  f.state.loss = 'survivor-uuid';
  await expect(f.run()).rejects.toThrow();
}, 20000);
test('unresolved expected binding digest rejects before cloud', async () => {
  const f = await fixture();
  f.request.sourceBindingSha256 = '__UNRESOLVED__';
  await expect(f.run()).rejects.toThrow();
  expect(f.state.calls).toBe(0);
});
test('changed full frozen source binding rejects before cloud', async () => {
  const f = await fixture();
  f.binding.before.nodes['1'].nics['1'].ipConfigurationName = 'foreign';
  await expect(f.run()).rejects.toThrow();
  expect(f.state.calls).toBe(0);
});
test('ignored cloud reader remains cancellation bounded', async () => {
  const f = await fixture(),
    abort = new AbortController();
  f.api.exec = () => {
    setTimeout(() => abort.abort(Error('synthetic current deadline')), 20);
    return new Promise<never>(() => {});
  };
  const start = Date.now();
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic current deadline');
  expect(Date.now() - start).toBeLessThan(1000);
});

for (const identifier of ['', '__UNRESOLVED__', 'a'.repeat(64), '00000000-0000-4000-8000-000000000001'])
  test(`launched phase rejects unresolved or retained UUID ${identifier.slice(0, 12)} before cloud`, async () => {
    const f = await fixture(false, 'launched');
    f.request.newVmId = identifier;
    await expect(f.run()).rejects.toThrow();
    expect(f.state.calls).toBe(0);
  });
test('intact phase rejects a supplied future VM identity before cloud', async () => {
  const f = await fixture();
  f.request.newVmId = f.newVmId;
  await expect(f.run()).rejects.toThrow();
  expect(f.state.calls).toBe(0);
});
test('changed caller phase during account observation cannot authorize current identity', async () => {
  const f = await fixture(),
    read = f.api.exec.bind(f.api);
  f.api.exec = async (...args) => {
    const row = await read(...args);
    f.request.phase = 'launched';
    return row;
  };
  await expect(f.run()).rejects.toThrow('requested binding or phase changed');
});

for (const ha of [false, true])
  test(`absent selected VM has no current UUID or VM owner (${ha ? 'HA' : 'single'})`, async () => {
    const f = await fixture(ha, 'quiesced'),
      result = await f.run(),
      node = result.nodes[String(f.selected)];
    expect(node.vmId).toBeNull();
    expect(node.ownerPlanSha256).toBeNull();
    expect(node.vmState).toBe('absent');
    for (const nic of Object.values(node.nics))
      expect(nic.ownerPlanSha256).toBe(
        f.binding.before.nodes[String(f.selected)].nics[
          Object.keys(node.nics).find((i) => node.nics[i].resourceId === nic.resourceId) as string
        ].ownerPlanSha256,
      );
  }, 20000);
