import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkRoutingHistory } from '../../src/ce/terraform-network-routing-history';
import { routingExecutionFixture, routingExecutionRoots } from './terraform-network-routing-execution-fixture';

type Fixture = Awaited<ReturnType<typeof routingExecutionFixture>>;
const fixtures = new Map<'udr' | 'route-server', Fixture>();
const packetsByMode = new Map<'udr' | 'route-server', Map<string, unknown>>();
beforeAll(async () => {
  for (const mode of ['udr', 'route-server'] as const) {
    const f = await routingExecutionFixture(mode);
    await f.run();
    fixtures.set(mode, f);
    const packets = new Map<string, unknown>();
    for (const name of await readdir(f.store.directory))
      if (name.startsWith(f.prefix) && name.endsWith('.json')) packets.set(name, await f.store.read(name));
    packetsByMode.set(mode, packets);
  }
});
afterAll(async () => {
  for (const f of fixtures.values()) {
    await rm(f.store.directory, { recursive: true });
    const i = routingExecutionRoots.indexOf(f.store.directory);
    if (i >= 0) routingExecutionRoots.splice(i, 1);
  }
});
function setup(mode: 'udr' | 'route-server' = 'udr') {
  const f = fixtures.get(mode),
    saved = packetsByMode.get(mode);
  if (!f || !saved) throw Error('synthetic history fixture unavailable');
  const data = structuredClone({ plan: f.plan, before: f.before, current: f.current }),
    packets = structuredClone(saved),
    reads: string[] = [];
  const store = {
    owner: structuredClone(f.store.owner),
    verify: () => f.store.verify(),
    read: async (name: string) => {
      reads.push(name);
      if (!packets.has(name)) throw Error('missing immutable synthetic history');
      return structuredClone(packets.get(name));
    },
  };
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRoutingHistory(data.plan, f.source, data.before, data.current, 1, store, signal);
  return { f, data, packets, reads, store, run };
}
function setPath(value: unknown, path: string[], next: unknown) {
  let row = value as Record<string, unknown>;
  for (const key of path.slice(0, -1)) row = row[key] as Record<string, unknown>;
  row[path.at(-1) as string] = next;
}
for (const mode of ['udr', 'route-server'] as const)
  test(`${mode} authenticates actual immutable store after journal advances without execution`, async () => {
    const { f } = setup(mode);
    await f.session.plan({});
    const calls = [...f.calls];
    const result = await readAzureTerraformNetworkRoutingHistory(f.plan, f.source, f.before, f.current, 1, f.store);
    expect(result.status).toBe('routing-stage-history-verified');
    expect(result.configurationSha256).toBe(f.stage.releasedConfigurationSha256);
    expect(result.inventory.nodes).toEqual(f.current.nodes);
    expect(Object.keys(result.packetSha256ByName)).toHaveLength(10);
    expect(result.forwarding).toBe('unknown');
    expect(result.freshness).toBe('unqualified');
    expect(f.calls).toEqual(calls);
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
  test(`missing ${suffix} cannot be reconstructed by routing history reader`, async () => {
    const s = setup();
    s.packets.delete(`${s.f.prefix}-${suffix}.json`);
    await expect(s.run()).rejects.toThrow('missing immutable synthetic history');
  });
for (const [suffix, path, value] of [
  ['prepared', ['schemaVersion'], 3],
  ['prepared', ['stage', 'currentSha256'], 'f'.repeat(64)],
  ['prepared', ['appliedNics'], ['1:0']],
  ['mutation-plan', ['providerLockSha256'], 'f'.repeat(64)],
  ['mutation-binding', ['stageSha256'], 'f'.repeat(64)],
  ['mutation-binding', ['currentSha256'], 'f'.repeat(64)],
  ['mutation-complete', ['receiptSha256'], 'f'.repeat(64)],
  ['mutation-outcome', ['routing', 'node'], 3],
  ['mutation-complete', ['outcome', 'routing', 'collectedAt'], '2000-01-01T00:00:00Z'],
  ['release-binding', ['phase'], 'mutation'],
  ['release-outcome', ['power', 'resourceId'], 'foreign'],
  ['release-complete', ['schemaVersion'], 2],
  ['final-plan', ['schemaVersion'], 2],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'parentId'], 'foreign'],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'currentIp'], '10.20.2.88'],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'installedIp'], '10.20.2.88'],
  ['final-plan', ['cloud', 'routing', 'rows', '0', 'prefix'], '0.0.0.0/0'],
  ['final-plan', ['cloud', 'routing', 'forwarding'], 'verified'],
  ['final-plan', ['cloud', 'routing', 'freshness'], 'verified'],
  ['final-plan', ['cloud', 'power', 'powerState'], 'deallocated'],
] as const)
  test(`rejects foreign/malformed history ${suffix} ${path.join('.')}`, async () => {
    const s = setup();
    setPath(s.packets.get(`${s.f.prefix}-${suffix}.json`), [...path], value);
    await expect(s.run()).rejects.toThrow();
  });
test('Route Server historical peer ASN cannot be replaced', async () => {
  const s = setup('route-server');
  setPath(s.packets.get(`${s.f.prefix}-final-plan.json`), ['cloud', 'routing', 'rows', '0', 'peerAsn'], 65099);
  await expect(s.run()).rejects.toThrow();
});
test('historical reader rejects a racing earlier packet rewrite', async () => {
  const s = setup(),
    original = s.store.read;
  s.store.read = async (name) => {
    const value = await original(name);
    if (name === `${s.f.prefix}-final-plan.json`)
      setPath(s.packets.get(`${s.f.prefix}-prepared.json`), ['schemaVersion'], 3);
    return value;
  };
  await expect(s.run()).rejects.toThrow('packet changed during history read');
});
test('historical reader rejects input replacement before another call', async () => {
  const s = setup(),
    original = s.store.verify;
  s.store.verify = async () => {
    await original();
    s.data.plan.region = 'foreign';
  };
  await expect(s.run()).rejects.toThrow('input or owning reader changed');
  expect(s.reads).toHaveLength(0);
});
test('historical reader rejects callable replacement without invoking replacement', async () => {
  const s = setup(),
    original = s.store.read;
  let called = 0;
  s.store.read = async (name) => {
    const value = await original(name);
    s.store.read = async () => {
      called++;
      return {};
    };
    return value;
  };
  await expect(s.run()).rejects.toThrow('input or owning reader changed');
  expect(called).toBe(0);
});
test('historical reader rejects foreign owning storage', async () => {
  const s = setup();
  setPath(s.store.owner, ['planSha256'], 'f'.repeat(64));
  await expect(s.run()).rejects.toThrow();
  expect(s.reads).toHaveLength(0);
});
test('historical reader preserves authorization failure', async () => {
  const s = setup();
  s.store.verify = async () => {
    throw Error('synthetic access denied');
  };
  await expect(s.run()).rejects.toThrow('synthetic access denied');
  expect(s.reads).toHaveLength(0);
});
test('historical reader cancellation races ignored signal and never changes packets', async () => {
  const s = setup(),
    entered = Promise.withResolvers<void>(),
    controller = new AbortController(),
    digest = canonicalSha256([...s.packets]);
  s.store.read = async () => {
    entered.resolve();
    return await new Promise(() => {});
  };
  const run = s.run(controller.signal);
  await entered.promise;
  controller.abort(Error('synthetic history cancellation'));
  await expect(run).rejects.toThrow('synthetic history cancellation');
  expect(canonicalSha256([...s.packets])).toBe(digest);
});
