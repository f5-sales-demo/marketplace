import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkNicHistory } from '../../src/ce/terraform-network-nic-history';
import { test } from './owned-fixture-test';

import { networkStageHistoryFixture } from './terraform-network-stage-history-fixture';

const suffixes = [
  'prepared',
  'mutation-plan',
  'nic-binding',
  'mutation-outcome',
  'mutation-complete',
  'final-plan',
  'current-no-change-plan',
];
async function fixture(node = 1, move = true, ha = false, execute = true) {
  const f = await networkStageHistoryFixture(node, move, ha, false);
  await f.power('deallocate');
  if (execute) await f.runNic();
  const prefix = `${f.plan.planId}-terraform-network-node-${node}`;
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkNicHistory(f.plan, f.source, f.before, node, f.store, signal);
  return { ...f, prefix, run };
}
for (const [node, move, ha] of [
  [1, true, false],
  [1, false, false],
  [1, true, true],
  [2, true, true],
  [3, false, true],
] as const)
  test(`read-only actual NIC history node${node}/move${move}/HA${ha} retains exact private packet hashes`, async () => {
    const f = await fixture(node, move, ha),
      power = [...f.powerCalls],
      mutations = f.mutations();
    f.api.exec = async () => {
      throw Error('history must not inspect current cloud');
    };
    const row = await f.run();
    expect(row.allPacketsPresent).toBe(true);
    expect(row.lastPacket).toBe('current-no-change-plan');
    expect(row.currentOperationalAcceptanceQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(row.sourceConfigurationSha256).toBe(f.hash(f.source));
    expect(f.powerCalls).toEqual(power);
    expect(f.mutations()).toBe(mutations);
    for (const [name, digest] of Object.entries(row.packetSha256ByName))
      expect(canonicalSha256(await f.store.read(name))).toBe(digest);
  });
for (let length = 0; length < suffixes.length; length++)
  test(`actual NIC publication loss after ${length} packets remains interrupted history`, async () => {
    const f = await fixture(1, true, false, false),
      write = f.store.write.bind(f.store);
    f.store.write = async (name, value) => {
      if (name === `${f.prefix}-${suffixes[length]}.json`) throw Error('synthetic NIC publication loss');
      return write(name, value);
    };
    await expect(f.runNic()).rejects.toThrow('synthetic NIC publication loss');
    const row = await f.run();
    expect(row.lastPacket).toBe(length ? suffixes[length - 1] : null);
    expect(row.allPacketsPresent).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(Object.keys(row.packetSha256ByName)).toHaveLength(length);
  });
for (const missing of suffixes.slice(0, -1))
  test(`NIC prefix rejects orphan after missing ${missing}`, async () => {
    const f = await fixture();
    await f.store.remove(`${f.prefix}-${missing}.json`);
    await expect(f.run()).rejects.toThrow('orphan');
  });
for (const suffix of suffixes)
  test(`NIC prefix rejects malformed ${suffix}`, async () => {
    const f = await fixture();
    await f.store.write(`${f.prefix}-${suffix}.json`, { schemaVersion: 1, foreign: true });
    await expect(f.run()).rejects.toThrow();
  });
for (const part of ['source', 'owner', 'vm', 'mac', 'missing-interface', 'foreign-node'])
  test(`NIC packet joins reject changed ${part}`, async () => {
    const f = await fixture();
    if (part === 'source')
      await expect(readAzureTerraformNetworkNicHistory(f.plan, '{}', f.before, 1, f.store)).rejects.toThrow();
    else {
      if (part === 'owner') f.store.owner.account = 'example-foreign';
      if (part === 'vm') f.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
      if (part === 'mac') f.before.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
      if (part === 'missing-interface') delete f.before.nodes['1'].nics['1'];
      if (part === 'foreign-node')
        await expect(readAzureTerraformNetworkNicHistory(f.plan, f.source, f.before, 2, f.store)).rejects.toThrow();
      else await expect(f.run()).rejects.toThrow();
    }
  });
for (const part of [
  'receipt',
  'projection',
  'outcome',
  'completion',
  'final-changes',
  'current-changes',
  'current-cloud',
])
  test(`NIC history rejects correct-shaped changed ${part}`, async () => {
    const f = await fixture();
    const suffix =
      part === 'receipt'
        ? 'mutation-plan'
        : part === 'projection'
          ? 'nic-binding'
          : part === 'outcome'
            ? 'mutation-outcome'
            : part === 'completion'
              ? 'mutation-complete'
              : part === 'final-changes'
                ? 'final-plan'
                : 'current-no-change-plan';
    const value = (await f.store.read(`${f.prefix}-${suffix}.json`)) as Record<string, unknown>;
    if (part === 'receipt') value.providerLockSha256 = 'a'.repeat(64);
    if (part === 'projection') value.receiptSha256 = 'a'.repeat(64);
    if (part === 'outcome') value.vmId = '00000000-0000-4000-8000-000000000099';
    if (part === 'completion') value.receiptSha256 = 'a'.repeat(64);
    if (part === 'final-changes' || part === 'current-changes')
      value.receipt = { ...(value.receipt as Record<string, unknown>), noChanges: false };
    if (part === 'current-cloud') value.cloud = { ...(value.cloud as Record<string, unknown>), nicConverged: false };
    await f.store.write(`${f.prefix}-${suffix}.json`, value);
    await expect(f.run()).rejects.toThrow();
  });
for (const part of ['request', 'inventory', 'owner', 'read', 'verify'])
  test(`NIC history rejects changing ${part} dependency`, async () => {
    const f = await fixture(),
      read = f.store.read.bind(f.store);
    let fired = false;
    f.store.read = async (name) => {
      const value = await read(name);
      if (name === `${f.prefix}-prepared.json` && !fired) {
        fired = true;
        if (part === 'request') f.plan.siteName = 'changed';
        if (part === 'inventory') f.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
        if (part === 'owner') f.store.owner.account = 'example-foreign';
        if (part === 'read') f.store.read = async () => value;
        if (part === 'verify') f.store.verify = async () => {};
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('changed');
  });
for (const part of ['rewritten', 'appeared', 'disappeared'])
  test(`NIC reader rejects packet ${part} between repeated boundary reads`, async () => {
    const f = await fixture(),
      verify = f.store.verify.bind(f.store),
      read = f.store.read.bind(f.store);
    const name = `${f.prefix}-current-no-change-plan.json`;
    if (part === 'appeared') await f.store.remove(name);
    let collected = false,
      fired = false;
    f.store.read = async (packet) => {
      try {
        return await read(packet);
      } finally {
        if (packet === name) collected = true;
      }
    };
    f.store.verify = async () => {
      await verify();
      if (collected && !fired) {
        fired = true;
        if (part === 'disappeared') await f.store.remove(name);
        else await f.store.write(name, { foreign: true });
      }
    };
    await expect(f.run()).rejects.toThrow();
  });
for (const part of ['read', 'verify'])
  test(`NIC history abort races ignored ${part}`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    const never = async (): Promise<never> => new Promise(() => {});
    if (part === 'read') f.store.read = never;
    else f.store.verify = never;
    const pending = f.run(abort.signal);
    setTimeout(() => abort.abort(Error('synthetic NIC cancellation')), 20);
    await expect(pending).rejects.toThrow('synthetic NIC cancellation');
  });
test('NIC history retains storage permission failure', async () => {
  const f = await fixture();
  f.store.read = async () => {
    throw Object.assign(Error('synthetic denied'), { code: 'EACCES' });
  };
  await expect(f.run()).rejects.toThrow('synthetic denied');
});
