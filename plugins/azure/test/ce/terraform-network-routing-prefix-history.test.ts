import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkRoutingHistory } from '../../src/ce/terraform-network-routing-history';
import { readAzureTerraformNetworkRoutingPrefixHistory } from '../../src/ce/terraform-network-routing-prefix-history';
import { routingExecutionFixture, routingExecutionRoots } from './terraform-network-routing-execution-fixture';

afterEach(async () => {
  for (const root of routingExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
const suffixes = [
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
  'current-no-change-plan',
];
async function fixture(mode: 'udr' | 'route-server' = 'udr', node = 1, execute = true) {
  const f = await routingExecutionFixture(mode, node);
  if (execute) await f.run();
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRoutingPrefixHistory(f.plan, f.source, f.before, f.current, node, f.store, signal);
  return { ...f, runDriver: f.run, run };
}
for (const mode of ['udr', 'route-server'] as const)
  for (const node of [1, 2, 3])
    test(`actual ${mode}/node${node} routing packet history agrees with immutable completed reader`, async () => {
      const f = await fixture(mode, node),
        calls = [...f.calls];
      const complete = await readAzureTerraformNetworkRoutingHistory(
        f.plan,
        f.source,
        f.before,
        f.current,
        node,
        f.store,
      );
      const row = await f.run();
      expect(row.allPacketsPresent).toBe(true);
      expect(row.lastPacket).toBe('current-no-change-plan');
      expect(row.currentOperationalAcceptanceQualified).toBe(false);
      expect(row.retirementQualified).toBe(false);
      expect(row.forwarding).toBe('unknown');
      expect(row.bgpExchange).toBe('unknown');
      expect(row.freshness).toBe('unqualified');
      expect(row.sourceConfigurationSha256).toBe(createHash('sha256').update(f.source).digest('hex'));
      expect(f.calls).toEqual(calls);
      for (const [name, digest] of Object.entries(complete.packetSha256ByName))
        expect(row.packetSha256ByName[name]).toBe(digest);
      for (const [name, digest] of Object.entries(row.packetSha256ByName))
        expect(canonicalSha256(await f.store.read(name))).toBe(digest);
    });
for (let length = 0; length < suffixes.length; length++)
  test(`actual routing publication loss after ${length} packets remains interrupted history`, async () => {
    const f = await fixture('udr', 1, false),
      write = f.store.write.bind(f.store);
    f.store.write = async (name, value) => {
      if (name === `${f.prefix}-${suffixes[length]}.json`) throw Error('synthetic routing publication loss');
      return write(name, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic routing publication loss');
    const calls = [...f.calls],
      row = await f.run();
    expect(row.allPacketsPresent).toBe(false);
    expect(row.lastPacket).toBe(length ? suffixes[length - 1] : null);
    expect(row.retirementQualified).toBe(false);
    expect(Object.keys(row.packetSha256ByName)).toHaveLength(length);
    expect(f.calls).toEqual(calls);
  });
for (const suffix of suffixes.slice(0, -1))
  test(`routing prefix rejects orphan after missing ${suffix}`, async () => {
    const f = await fixture();
    await f.store.remove(`${f.prefix}-${suffix}.json`);
    await expect(f.run()).rejects.toThrow('orphan');
  });
for (const suffix of suffixes)
  test(`routing prefix rejects malformed ${suffix}`, async () => {
    const f = await fixture();
    await f.store.write(`${f.prefix}-${suffix}.json`, { schemaVersion: 1, foreign: true });
    await expect(f.run()).rejects.toThrow();
  });
for (const part of ['before', 'current', 'owner', 'read', 'verify', 'plan'])
  test(`routing prefix rejects changed ${part} input or dependency`, async () => {
    const f = await fixture(),
      read = f.store.read.bind(f.store);
    let fired = false;
    f.store.read = async (name) => {
      const value = await read(name);
      if (!fired) {
        fired = true;
        if (part === 'before') f.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
        if (part === 'current') f.current.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
        if (part === 'owner') f.store.owner.account = 'example-foreign';
        if (part === 'read') f.store.read = async () => value;
        if (part === 'verify') f.store.verify = async () => {};
        if (part === 'plan') f.plan.siteName = 'changed';
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('changed');
  });
for (const part of ['rewrite', 'disappear', 'appear'])
  test(`routing prefix rejects packet ${part} after initial collection`, async () => {
    const f = await fixture(),
      read = f.store.read.bind(f.store),
      verify = f.store.verify.bind(f.store);
    const name = `${f.prefix}-current-no-change-plan.json`;
    if (part === 'appear') await f.store.remove(name);
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
        if (part === 'disappear') await f.store.remove(name);
        else await f.store.write(name, { foreign: true });
      }
    };
    await expect(f.run()).rejects.toThrow();
  });
for (const part of ['read', 'verify'])
  test(`routing prefix abort races ignored ${part}`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    const never = async (): Promise<never> => new Promise(() => {});
    if (part === 'read') f.store.read = never;
    else f.store.verify = never;
    const pending = f.run(abort.signal);
    setTimeout(() => abort.abort(Error('synthetic routing prefix cancellation')), 20);
    await expect(pending).rejects.toThrow('synthetic routing prefix cancellation');
  });
for (const part of ['source', 'node', 'owner'])
  test(`routing prefix requires exact ${part} before inspecting packets`, async () => {
    const f = await fixture();
    if (part === 'owner') f.store.owner.account = 'example-foreign';
    await expect(
      readAzureTerraformNetworkRoutingPrefixHistory(
        f.plan,
        part === 'source' ? '{}' : f.source,
        f.before,
        f.current,
        part === 'node' ? 4 : 1,
        f.store,
      ),
    ).rejects.toThrow();
  });
test('routing prefix preserves service/authorization failure', async () => {
  const f = await fixture();
  f.store.read = async () => {
    throw Object.assign(Error('synthetic denied'), { code: 'EACCES' });
  };
  await expect(f.run()).rejects.toThrow('synthetic denied');
});
