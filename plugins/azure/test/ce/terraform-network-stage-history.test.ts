import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { readAzureTerraformNetworkNodeHistory } from '../../src/ce/terraform-network-stage-history';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { networkStageHistoryFixture as historyFixture } from './terraform-network-stage-history-fixture';

afterEach(async () => {
  for (const p of nicExecutionRoots.splice(0)) await rm(p, { recursive: true });
});

for (const [node, move, ha] of [
  [1, true, false],
  [1, true, true],
  [2, true, true],
  [3, true, true],
  [1, false, true],
] as const)
  test(`serial history verifies node ${node} move ${move} HA ${ha} after restart without replay or consumed journal reads`, async () => {
    const f = await historyFixture(node, move, ha);
    const calls = [...f.calls],
      powerCalls = [...f.powerCalls];
    for (const phase of ['deallocated', 'nic-complete', 'restarted', 'routing-complete'] as const) {
      const result = await f.run(phase);
      expect(result.status).toBe('node-stage-history-verified');
      expect(result.phase).toBe(phase);
      expect(result.node).toBe(node);
      expect(result.inventory.nodes[String(node)].vmId).toBe(f.before.nodes[String(node)].vmId);
      expect(result.packetSha256ByName).not.toEqual({});
    }
    expect(f.calls).toEqual(calls);
    expect(f.powerCalls).toEqual(powerCalls);
    expect(f.state.power).toBe('VM running');
    expect(f.mutations()).toBe(0);
  });
for (const suffix of [
  'deallocate-mutation-plan',
  'deallocate-mutation-binding',
  'deallocate-mutation-complete',
  'deallocate-release-plan',
  'deallocate-release-binding',
  'deallocate-release-complete',
  'deallocate-final-plan',
  'prepared',
  'mutation-plan',
  'nic-binding',
  'mutation-complete',
  'final-plan',
  'start-mutation-complete',
  'start-release-complete',
  'start-final-plan',
])
  test(`serial history rejects missing ${suffix} without replay`, async () => {
    const f = await historyFixture();
    await f.store.remove(`${f.plan.planId}-terraform-network-node-1-${suffix}.json`);
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
for (const mode of [
  'owner',
  'engine',
  'operation',
  'uuid',
  'mac',
  'foreign-subnet',
  'partial-target',
  'state-present',
  'receipt-digest',
  'source-digest',
  'binding',
  'final-mutation',
  'extra-field',
])
  test(`serial history rejects ${mode} in saved complete packets`, async () => {
    const f = await historyFixture();
    let name = `${f.plan.planId}-terraform-network-node-1-mutation-complete.json`;
    if (['owner', 'engine', 'operation', 'uuid', 'state-present'].includes(mode))
      name = `${f.plan.planId}-terraform-network-node-1-start-release-complete.json`;
    if (mode === 'source-digest') name = `${f.plan.planId}-terraform-network-node-1-prepared.json`;
    if (mode === 'binding') name = `${f.plan.planId}-terraform-network-node-1-nic-binding.json`;
    if (mode === 'final-mutation') name = `${f.plan.planId}-terraform-network-node-1-final-plan.json`;
    const packet = (await f.store.read(name)) as Record<string, unknown>;
    if (['owner', 'engine', 'operation', 'uuid'].includes(mode)) {
      const cloud = (packet.outcome as { cloud: Record<string, unknown> }).cloud;
      if (mode === 'owner') cloud.ownerPlanSha256 = 'a'.repeat(64);
      if (mode === 'engine') cloud.engine = 'native';
      if (mode === 'operation') cloud.operation = 'deallocate';
      if (mode === 'uuid') cloud.vmId = '00000000-0000-4000-8000-000000000099';
    }
    if (['mac', 'foreign-subnet', 'partial-target'].includes(mode)) {
      const nic = (packet.outcome as { inventory: typeof f.before }).inventory.nodes['1'].nics['1'];
      if (mode === 'mac') nic.mac = '02:00:00:00:00:99';
      if (mode === 'foreign-subnet') nic.subnetId = nic.subnetId.replace('/subnets/', '/subnets/foreign-');
      if (mode === 'partial-target') nic.subnetId = f.before.nodes['1'].nics['1'].subnetId;
    }
    if (mode === 'state-present')
      (packet.outcome as Record<string, unknown>).state = { 'azapi_resource_action.ce_network': { action: 'start' } };
    if (mode === 'receipt-digest') packet.receiptSha256 = 'a'.repeat(64);
    if (mode === 'source-digest') packet.inventorySha256 = 'b'.repeat(64);
    if (mode === 'binding') (packet.proposed as Record<string, unknown>)['azurerm_network_interface.node_1_nic_1'] = {};
    if (mode === 'final-mutation') {
      const receipt = packet.receipt as PlanReceipt;
      receipt.noChanges = false;
      receipt.changes = [
        { address: 'azurerm_network_interface.node_1_nic_1', type: 'azurerm_network_interface', actions: ['update'] },
      ];
    }
    if (mode === 'extra-field') packet.unverified = true;
    await f.store.write(name, packet);
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  });
test('serial history rechecks packets after reading the complete chain', async () => {
  const f = await historyFixture();
  const read = f.store.read.bind(f.store);
  let changed = false;
  const target = `${f.plan.planId}-terraform-network-node-1-prepared.json`;
  f.store.read = async (name) => {
    const value = await read(name);
    if (!changed && name.endsWith('-start-final-plan.json')) {
      changed = true;
      const prepared = (await read(target)) as Record<string, unknown>;
      prepared.inventorySha256 = 'a'.repeat(64);
      await f.store.write(target, prepared);
    }
    return value;
  };
  await expect(f.run()).rejects.toThrow('changed during history');
});
test('serial history rejects cancellation before private reads', async () => {
  const f = await historyFixture();
  const abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  let reads = 0;
  const read = f.store.read.bind(f.store);
  f.store.read = async (name) => {
    reads++;
    return read(name);
  };
  await expect(f.run('restarted', abort.signal)).rejects.toThrow('synthetic cancelled');
  expect(reads).toBe(0);
});
test('historical receipts do not authorize a foreign store or another stage source', async () => {
  const f = await historyFixture();
  await expect(readAzureTerraformNetworkNodeHistory(f.plan, '{}', f.before, 1, 'restarted', f.store)).rejects.toThrow();
  f.store.owner.engine = 'native';
  await expect(f.run()).rejects.toThrow();
});

for (const suffix of [
  'prepared',
  'mutation-plan',
  'mutation-binding',
  'mutation-outcome',
  'mutation-complete',
  'release-plan',
  'release-binding',
  'release-outcome',
  'release-complete',
  'final-plan',
])
  test(`routing-complete serial history rejects missing routing ${suffix} without execution`, async () => {
    const f = await historyFixture(1, true, false, true, undefined, undefined, {
      mode: 'udr',
      destinationCidrs: ['10.90.0.0/16'],
      udr: { subnetNames: ['slo'], nextHop: { node: 1, nicIndex: 1 } },
    });
    await f.store.remove(`${f.plan.planId}-terraform-network-node-1-routing-${suffix}.json`);
    const calls = [...f.calls],
      powerCalls = [...f.powerCalls];
    await expect(f.run('routing-complete')).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    expect(f.powerCalls).toEqual(powerCalls);
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'current-timestamp',
  'before-identity',
  'serial-boundary',
  'provider',
  'receipt',
  'routing-owner',
  'nic-mac',
])
  test(`routing-complete serial history rejects altered ${mode} without execution`, async () => {
    const f = await historyFixture(1, true, false);
    const prefix = `${f.plan.planId}-terraform-network-node-1-routing`;
    const name = `${prefix}-${
      ['current-timestamp', 'before-identity', 'serial-boundary'].includes(mode)
        ? 'prepared'
        : mode === 'provider'
          ? 'mutation-plan'
          : mode === 'receipt'
            ? 'release-complete'
            : 'final-plan'
    }.json`;
    const packet = (await f.store.read(name)) as Record<string, unknown>;
    if (mode === 'current-timestamp') (packet.current as typeof f.before).collectedAt = '2000-01-01T00:00:00Z';
    if (mode === 'before-identity')
      (packet.before as typeof f.before).nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
    if (mode === 'serial-boundary') packet.appliedNics = ['1:1'];
    if (mode === 'provider') packet.providerLockSha256 = 'a'.repeat(64);
    if (mode === 'receipt') packet.receiptSha256 = 'a'.repeat(64);
    if (mode === 'routing-owner' || mode === 'nic-mac') {
      const power = (packet.cloud as { power: { inventory: typeof f.before; ownerPlanSha256: string } }).power;
      if (mode === 'routing-owner') power.ownerPlanSha256 = 'a'.repeat(64);
      if (mode === 'nic-mac') power.inventory.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    }
    await f.store.write(name, packet);
    const calls = [...f.calls],
      powerCalls = [...f.powerCalls];
    await expect(f.run('routing-complete')).rejects.toThrow();
    expect(f.calls).toEqual(calls);
    expect(f.powerCalls).toEqual(powerCalls);
    expect(f.mutations()).toBe(0);
  });

test('routing-complete serial history rejects a rewritten NIC predecessor during routing history reads', async () => {
  const f = await historyFixture(1, true, false);
  const read = f.store.read.bind(f.store),
    prefix = `${f.plan.planId}-terraform-network-node-1`;
  let changed = false;
  f.store.read = async (name) => {
    const value = await read(name);
    if (!changed && name === `${prefix}-routing-final-plan.json`) {
      changed = true;
      const prepared = (await read(`${prefix}-prepared.json`)) as Record<string, unknown>;
      prepared.inventorySha256 = 'a'.repeat(64);
      await f.store.write(`${prefix}-prepared.json`, prepared);
    }
    return value;
  };
  const calls = [...f.calls];
  await expect(f.run('routing-complete')).rejects.toThrow('changed during history');
  expect(changed).toBe(true);
  expect(f.calls).toEqual(calls);
});
