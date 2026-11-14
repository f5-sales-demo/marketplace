import { expect } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AzureCeIntent } from '../../src/ce/types';
import { test } from './owned-fixture-test';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

const profile = (mode: 'udr' | 'route-server', node = 1): AzureCeIntent['routing'] =>
  mode === 'udr'
    ? {
        mode,
        destinationCidrs: ['10.253.0.0/24', '10.254.0.0/24'],
        udr: { subnetNames: ['slo'], nextHop: { node, nicIndex: 1 } },
      }
    : { mode, destinationCidrs: ['10.253.0.0/24'], localAsn: 65010 };
for (const mode of ['udr', 'route-server'] as const)
  for (const ha of [false, true])
    test(`${mode} serial ${ha ? 'HA' : 'single'} owns separate NIC/routing effects before acceptance`, async () => {
      const f = await terraformNetworkDriverFixture(
        ha,
        true,
        undefined,
        profile(mode, ha ? 2 : 1),
        mode === 'route-server',
      );
      const result = await f.run();
      expect(result.status).toBe('complete');
      expect(f.calls).toEqual(
        Array.from({ length: ha ? 3 : 1 }, (_, i) =>
          ['deallocate', 'nic', 'start', 'routing'].map((s) => `${i + 1}:${s}`),
        ).flat(),
      );
      for (let node = 1; node <= (ha ? 3 : 1); node++) {
        const prefix = `${f.plan.planId}-terraform-network-node-${node}`,
          nic = (await f.store.read(`${prefix}-mutation-plan.json`)) as PlanReceipt,
          routing = (await f.store.read(`${prefix}-routing-mutation-plan.json`)) as PlanReceipt;
        expect(
          nic.changes
            .filter((c) => c.actions[0] === 'update')
            .every(
              (c) =>
                c.type === 'azurerm_network_interface' &&
                c.address.startsWith(`azurerm_network_interface.node_${node}_nic_`),
            ),
        ).toBe(true);
        expect(
          nic.changes.filter((c) => c.type !== 'azurerm_network_interface').every((c) => c.actions[0] === 'no-op'),
        ).toBe(true);
        expect(
          routing.changes
            .filter((c) => c.actions[0] === 'update')
            .every((c) => c.type === (mode === 'udr' ? 'azurerm_route' : 'azurerm_route_server_bgp_connection')),
        ).toBe(true);
        expect(
          routing.changes.filter((c) => c.type === 'azurerm_network_interface').every((c) => c.actions[0] === 'no-op'),
        ).toBe(true);
        const expected = mode === 'route-server' ? 1 : node === (ha ? 2 : 1) ? 2 : 0;
        expect(routing.changes.filter((c) => c.actions[0] === 'update')).toHaveLength(expected);
        const release = (await f.store.read(`${prefix}-routing-release-plan.json`)) as PlanReceipt;
        expect(release.noChanges).toBe(true);
        const prepared = (await f.store.read(`${prefix}-routing-prepared.json`)) as {
          schemaVersion: number;
          before: { nodes: unknown };
          current: { nodes: unknown };
        };
        expect(prepared.schemaVersion).toBe(2);
        expect(prepared.before.nodes).not.toEqual(prepared.current.nodes);
        expect(f.observations).toContain(`${node}:restored`);
      }
      const final = await f.store.read(`${f.plan.planId}-terraform-network-driver-complete.json`),
        digest = canonicalSha256(final),
        calls = [...f.calls];
      expect((await f.run()).status).toBe('complete');
      expect(f.calls).toEqual(calls);
      expect(canonicalSha256(await f.store.read(`${f.plan.planId}-terraform-network-driver-complete.json`))).toBe(
        digest,
      );
    }, 60000);
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
  test(`serial UDR resumes lost routing ${suffix} publication with original input and no duplicate apply`, async () => {
    const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr')),
      write = f.store.write.bind(f.store);
    let lost = true;
    f.store.write = async (name, value) => {
      await write(name, value);
      if (lost && name.endsWith(`-routing-${suffix}.json`)) {
        lost = false;
        throw Error('synthetic original routing response lost');
      }
    };
    await expect(f.run()).rejects.toThrow('synthetic original routing response lost');
    expect(lost).toBe(false);
    expect((await f.run()).status).toBe('complete');
    expect(f.fixtures.get(1)?.calls.filter((c) => c === 'apply')).toHaveLength(2);
    expect(f.calls.filter((c) => c === '1:nic')).toHaveLength(1);
    expect(f.calls.filter((c) => c === '1:start')).toHaveLength(1);
  }, 30000);
test('routing acknowledgement without immutable history cannot authorize restored acceptance', async () => {
  const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr'));
  f.dependencies.runRouting = async () =>
    ({ status: 'routing-stage-complete' }) as Awaited<ReturnType<typeof f.dependencies.runRouting>>;
  await expect(f.run()).rejects.toThrow();
  expect(f.observations).not.toContain('1:restored');
  expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start']);
});
test('foreign route owner after restart prevents routing mutation and operational acceptance', async () => {
  const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr'));
  f.state.afterStage = (stage) => {
    if (stage === 'start')
      for (const parent of f.fixtures.get(1)?.routingParents.values() ?? [])
        (parent.tags as Record<string, unknown>)['xcsh-plan-sha256'] = 'f'.repeat(64);
  };
  await expect(f.run()).rejects.toThrow('unavailable');
  expect(f.observations).not.toContain('1:restored');
  expect(f.fixtures.get(1)?.calls.filter((c) => c === 'apply')).toHaveLength(1);
});
test('changed selected NIC after restart cannot enter routing phase', async () => {
  const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr'));
  f.state.afterStage = (stage) => {
    if (stage === 'start') {
      const active = f.fixtures.get(1);
      if (!active) throw Error('missing active node');
      active.config(active.sliNic).privateIPAddress = '10.20.2.99';
    }
  };
  await expect(f.run()).rejects.toThrow('restart boundary');
  expect(f.calls).toEqual(['1:deallocate', '1:nic', '1:start']);
  expect(f.observations).not.toContain('1:restored');
});
test('tampered original routing current input cannot be replaced by fresh current evidence', async () => {
  const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr'));
  f.state.rejectPurpose = 'restored';
  await f.run();
  const name = `${f.plan.planId}-terraform-network-node-1-routing-prepared.json`,
    packet = (await f.store.read(name)) as { current: { collectedAt: string } };
  packet.current.collectedAt = '2000-01-01T00:00:00Z';
  await f.store.write(name, packet);
  f.state.rejectPurpose = '';
  const calls = [...f.calls];
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual(calls);
});
test('checkpoint cannot skip routing completion and accept a restarted node', async () => {
  const f = await terraformNetworkDriverFixture(false, true, undefined, profile('udr'));
  f.dependencies.runRouting = async () => {
    throw Error('synthetic hold before routing');
  };
  await expect(f.run()).rejects.toThrow('synthetic hold');
  const checkpoint = (await f.store.read(`${f.plan.planId}-terraform-network-driver-checkpoint.json`)) as {
    nodes: { phase: string }[];
  };
  expect(checkpoint.nodes.at(-1)?.phase).toBe('restarted');
  expect(f.observations).not.toContain('1:restored');
});
