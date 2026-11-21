import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkPowerHistory } from '../../src/ce/terraform-network-power-history';
import { test } from './owned-fixture-test';

import { networkStageHistoryFixture } from './terraform-network-stage-history-fixture';

const suffixes = [
  'mutation-plan',
  'mutation-binding',
  'mutation-outcome',
  'mutation-complete',
  'release-plan',
  'release-binding',
  'release-outcome',
  'release-complete',
  'final-plan',
  'current-no-change-plan',
];
async function fixture(ha = false, operation: 'deallocate' | 'start' = 'deallocate') {
  const f = await networkStageHistoryFixture(ha ? 3 : 1, true, ha);
  const applied =
    operation === 'start' ? [...f.appliedNics, ...f.plan.nics.map((nic) => `${f.node}:${nic.index}`)] : f.appliedNics;
  const prefix = `${f.plan.planId}-terraform-network-node-${f.node}-${operation}`;
  const calls = f.powerCalls.slice();
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkPowerHistory(f.plan, f.before, f.node, operation, applied, f.store, signal);
  return { ...f, applied, prefix, run, calls, name: (suffix: string) => `${prefix}-${suffix}.json` };
}
for (const ha of [false, true])
  for (const operation of ['deallocate', 'start'] as const)
    test(`read-only ${ha ? 'six-interface HA' : 'single'} ${operation} packet history keeps operational and retirement gates separate`, async () => {
      const f = await fixture(ha, operation);
      const row = await f.run();
      expect(row.allPacketsPresent).toBe(true);
      expect(row.lastPacket).toBe('current-no-change-plan');
      expect(Object.keys(row.packetSha256ByName)).toHaveLength(10);
      expect(row.currentOperationalAcceptanceQualified).toBe(false);
      expect(row.retirementQualified).toBe(false);
      expect(f.powerCalls).toEqual(f.calls);
      for (const [name, digest] of Object.entries(row.packetSha256ByName))
        expect(canonicalSha256(await f.store.read(name))).toBe(digest);
    });
for (let length = 0; length < suffixes.length; length++)
  test(`durable interrupted power prefix of ${length} packets never becomes application or retirement acceptance`, async () => {
    const f = await fixture();
    for (const suffix of suffixes.slice(length)) await f.store.remove(f.name(suffix));
    const row = await f.run();
    expect(row.lastPacket).toBe(length ? suffixes[length - 1] : null);
    expect(row.allPacketsPresent).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(Object.keys(row.packetSha256ByName)).toHaveLength(length);
    expect(f.powerCalls).toEqual(f.calls);
  });
for (const suffix of suffixes.slice(0, -1))
  test(`orphan later packet rejects missing ${suffix}`, async () => {
    const f = await fixture();
    await f.store.remove(f.name(suffix));
    await expect(f.run()).rejects.toThrow('orphan later packet');
    expect(f.powerCalls).toEqual(f.calls);
  });
for (const suffix of suffixes)
  test(`complete power history rejects altered ${suffix} schema`, async () => {
    const f = await fixture();
    const row = await f.store.read(f.name(suffix));
    await f.store.write(f.name(suffix), { ...(row as Record<string, unknown>), unverified: true });
    await expect(f.run()).rejects.toThrow();
    expect(f.powerCalls).toEqual(f.calls);
  });
for (const mode of ['vm', 'owner', 'mac', 'missing-interface', 'down', 'timestamp'])
  test(`power history rejects foreign or malformed historical ${mode}`, async () => {
    const f = await fixture();
    const row = (await f.store.read(f.name('mutation-outcome'))) as Record<string, unknown>;
    const inventory = row.inventory as typeof f.before;
    if (mode === 'vm') row.vmId = '00000000-0000-4000-8000-000000000099';
    if (mode === 'owner') row.ownerPlanSha256 = 'a'.repeat(64);
    if (mode === 'mac') inventory.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    if (mode === 'missing-interface') delete inventory.nodes['1'].nics['1'];
    if (mode === 'down') row.converged = false;
    if (mode === 'timestamp') row.observedAt = 'not-a-time';
    await f.store.write(f.name('mutation-outcome'), row);
    await expect(f.run()).rejects.toThrow();
    expect(f.powerCalls).toEqual(f.calls);
  });
for (const mode of ['request', 'callable', 'packet', 'appearance', 'disappearance'])
  test(`history cross-read ${mode} race cannot approve a mixed packet prefix`, async () => {
    const f = await fixture();
    const read = f.store.read.bind(f.store);
    let reads = 0;
    if (mode === 'appearance') await f.store.remove(f.name('current-no-change-plan'));
    f.store.read = async (name) => {
      const row = await read(name);
      if (++reads === 10) {
        if (mode === 'request') f.plan.warnings.push('changed');
        if (mode === 'callable') f.store.read = read;
        if (mode === 'packet') await f.store.write(f.name('mutation-plan'), { unverified: true });
        if (mode === 'appearance')
          await f.store.write(f.name('current-no-change-plan'), await read(f.name('final-plan')));
        if (mode === 'disappearance') await f.store.remove(f.name('mutation-plan'));
      }
      return row;
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.powerCalls).toEqual(f.calls);
  });
for (const kind of ['read', 'verify'] as const)
  test(`ignored storage ${kind} is cancellation bounded`, async () => {
    const f = await fixture();
    f.store[kind] = () => new Promise<never>(() => {});
    const start = Date.now();
    await expect(f.run(AbortSignal.timeout(20))).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(f.powerCalls).toEqual(f.calls);
  });
test('wrong serial applied NIC boundary rejects before packet reads', async () => {
  const f = await fixture();
  f.applied.push('1:1');
  let reads = 0;
  f.store.read = async () => {
    reads++;
    throw Error('must not read');
  };
  await expect(f.run()).rejects.toThrow('serial power boundary');
  expect(reads).toBe(0);
});

for (const kind of ['projection', 'receipt', 'completion', 'release-state', 'foreign-storage', 'unavailable-storage'])
  test(`power history rejects valid-shaped ${kind} corruption or unavailable evidence`, async () => {
    const f = await fixture();
    if (kind === 'projection') {
      const row = (await f.store.read(f.name('mutation-binding'))) as Record<string, unknown>;
      const proposed = row.proposed as Record<string, Record<string, unknown>>;
      const action = proposed['azapi_resource_action.ce_network'];
      if (typeof action.resource_id !== 'string') throw Error('Synthetic action ID requires a string');
      action.resource_id += '-foreign';
      await f.store.write(f.name('mutation-binding'), row);
    }
    if (kind === 'receipt') {
      const row = (await f.store.read(f.name('mutation-plan'))) as Record<string, unknown>;
      row.providerLockSha256 = 'a'.repeat(64);
      await f.store.write(f.name('mutation-plan'), row);
    }
    if (kind === 'completion') {
      const row = (await f.store.read(f.name('mutation-complete'))) as Record<string, unknown>;
      (row.outcome as Record<string, unknown>).vmId = '00000000-0000-4000-8000-000000000099';
      await f.store.write(f.name('mutation-complete'), row);
    }
    if (kind === 'release-state') {
      const row = (await f.store.read(f.name('release-outcome'))) as Record<string, unknown>;
      row.state = { 'azapi_resource_action.ce_network': { type: 'foreign' } };
      await f.store.write(f.name('release-outcome'), row);
    }
    const account = f.store.owner.account;
    if (kind === 'foreign-storage') f.store.owner.account = 'example-foreign';
    if (kind === 'unavailable-storage')
      f.store.verify = async () => {
        throw Error('synthetic unavailable storage');
      };
    try {
      await expect(f.run()).rejects.toThrow();
    } finally {
      f.store.owner.account = account;
    }
    expect(f.powerCalls).toEqual(f.calls);
  });
test('pre-cancelled power history reads no packet or owner manifest', async () => {
  const f = await fixture();
  let reads = 0,
    verifies = 0;
  f.store.read = async () => {
    reads++;
    throw Error('must not read');
  };
  f.store.verify = async () => {
    verifies++;
    throw Error('must not verify');
  };
  const abort = new AbortController();
  abort.abort(Error('synthetic pre-cancelled'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic pre-cancelled');
  expect(reads).toBe(0);
  expect(verifies).toBe(0);
});
