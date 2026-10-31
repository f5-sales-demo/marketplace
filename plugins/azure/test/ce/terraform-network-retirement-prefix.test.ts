import { expect } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AzureTerraformNetworkCheckpoint } from '../../src/ce/terraform-network-checkpoint';
import {
  readAzureTerraformNetworkRetirementGraph,
  readAzureTerraformNetworkRetirementGraphPrefix,
} from '../../src/ce/terraform-network-retirement-graph';
import { test } from './owned-fixture-test';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

async function fixture(ha = false, pending = false) {
  const f = await terraformNetworkDriverFixture(ha);
  f.state.lostStage = 'deallocate';
  await expect(f.run()).rejects.toThrow('synthetic lost completed stage response');
  const readGraph = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementGraph(
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  const original = await readGraph();
  const checkpoint = await AzureTerraformNetworkCheckpoint.open(
    f.plan,
    original.original.binding,
    f.store,
    f.dependencies.qualifyAcceptance,
  );
  const before = await checkpoint.read();
  const write = f.store.write.bind(f.store);
  if (pending)
    f.store.write = async (name, value) => {
      if (name === `${f.plan.planId}-terraform-network-driver-checkpoint.json`) throw Error('synthetic pointer loss');
      return write(name, value);
    };
  if (pending)
    await expect(checkpoint.recordStage(before.checkpointSha256, 1, 'deallocated')).rejects.toThrow('pointer loss');
  else await checkpoint.recordStage(before.checkpointSha256, 1, 'deallocated');
  f.store.write = write;
  const readPrefix = (value: unknown = original, signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementGraphPrefix(
      value,
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, original, readGraph, readPrefix };
}
test('original graph reconstructs after an actual prepared to deallocated immutable transition', async () => {
  const f = await fixture(),
    current = await f.readGraph();
  expect(current.checkpoint.snapshot?.phase).toBe('deallocated');
  expect(canonicalSha256(current)).not.toBe(canonicalSha256(f.original));
  const calls = [...f.calls],
    names = (await readdir(f.store.directory)).sort();
  const reconstructed = await f.readPrefix();
  expect(reconstructed).toEqual(f.original);
  expect(reconstructed.currentOperationalAcceptanceQualified).toBe(false);
  expect(reconstructed.parentRetirementQualified).toBe(false);
  expect(f.calls).toEqual(calls);
  expect((await readdir(f.store.directory)).sort()).toEqual(names);
  expect(await f.readGraph()).toEqual(current);
}, 60000);
for (const ha of [false, true])
  test(`original partial ${ha ? 'three-node HA' : 'single'} graph reconstructs after full production serial continuation`, async () => {
    const f = await fixture(ha);
    await f.run();
    const current = await f.readGraph();
    expect(current.nodes.every((row) => row.phase === 'accepted')).toBe(true);
    expect(current.nodes).toHaveLength(ha ? 3 : 1);
    const calls = [...f.calls],
      observations = [...f.observations];
    expect(await f.readPrefix()).toEqual(f.original);
    expect(await f.readGraph()).toEqual(current);
    expect(f.calls).toEqual(calls);
    expect(f.observations).toEqual(observations);
  }, 120000);
test('actual pending pointer publication remains separately authenticated during original prefix reconstruction', async () => {
  const f = await fixture(false, true),
    current = await f.readGraph();
  expect(current.checkpoint.pointerPublication).toBe('pending-revision');
  expect(await f.readPrefix()).toEqual(f.original);
  expect(await f.readGraph()).toEqual(current);
}, 60000);
test('original pending revision graph reconstructs after its pointer and later phases publish', async () => {
  const f = await fixture(false, true),
    pending = await f.readGraph();
  await f.run();
  expect(await f.readPrefix(pending)).toEqual(pending);
  expect((await f.readGraph()).nodes[0].phase).toBe('accepted');
}, 60000);
for (const malformed of [
  'missing-graph',
  'extra-key',
  'foreign-source',
  'wrong-checkpoint',
  'wrong-snapshot',
  'wrong-pointer',
  'changed-packet',
  'missing-packet',
  'duplicate-absence',
  'foreign-absence',
  'false-qualifier',
] as const)
  test(`${malformed} original witness cannot be substituted for retained ancestry`, async () => {
    const f = await fixture(),
      original = structuredClone(f.original);
    if (malformed === 'extra-key') Object.assign(original, { future: true });
    if (malformed === 'foreign-source') original.original.binding.planSha256 = 'a'.repeat(64);
    if (malformed === 'wrong-checkpoint') {
      if (!original.checkpoint.snapshot) throw Error('fixture snapshot missing');
      original.checkpoint.snapshot.checkpoint.revision = 100;
    }
    if (malformed === 'wrong-snapshot') {
      if (!original.checkpoint.snapshot) throw Error('fixture snapshot missing');
      original.checkpoint.snapshot.nodeSource += ' ';
    }
    const pointer = `${f.plan.planId}-terraform-network-driver-checkpoint.json`;
    const packet = `${f.plan.planId}-terraform-network-node-1-deallocate-final-plan.json`;
    if (malformed === 'wrong-pointer') original.packetSha256ByName[pointer] = 'a'.repeat(64);
    if (malformed === 'changed-packet') original.packetSha256ByName[packet] = 'b'.repeat(64);
    if (malformed === 'missing-packet') delete original.packetSha256ByName[packet];
    if (malformed === 'duplicate-absence') original.absentPackets.push(original.absentPackets[0]);
    if (malformed === 'foreign-absence') original.absentPackets.push('foreign.json');
    if (malformed === 'false-qualifier') Object.assign(original, { parentRetirementQualified: true });
    await expect(f.readPrefix(malformed === 'missing-graph' ? null : original)).rejects.toThrow();
    expect((await f.readGraph()).checkpoint.snapshot?.phase).toBe('deallocated');
  }, 60000);
test('missing original immutable revision cannot be replaced by a later valid pointer', async () => {
  const f = await fixture();
  await f.store.remove(`${f.plan.planId}-terraform-network-driver-revision-0.json`);
  await expect(f.readPrefix()).rejects.toThrow();
}, 60000);
test('unrecognized current publication is never hidden through historical inventory', async () => {
  const f = await fixture();
  await f.store.write(`${f.plan.planId}-terraform-network-node-1-foreign.json`, {});
  await expect(f.readPrefix()).rejects.toThrow('unrecognized');
}, 60000);
test('pre-aborted original prefix read neither observes nor publishes storage', async () => {
  const f = await fixture(),
    calls = [...f.calls],
    names = (await readdir(f.store.directory)).sort();
  await expect(f.readPrefix(f.original, AbortSignal.abort(Error('synthetic prefix abort')))).rejects.toThrow(
    'prefix abort',
  );
  expect(f.calls).toEqual(calls);
  expect((await readdir(f.store.directory)).sort()).toEqual(names);
}, 60000);

for (const race of ['original-witness', 'plan', 'verify', 'namespace', 'loader'] as const)
  test(`original prefix rejects cross-read ${race} change without mutations or commands`, async () => {
    const f = await fixture(),
      read = f.store.read;
    let changed = false;
    f.store.read = async (name) => {
      const value = await read.call(f.store, name);
      if (!changed) {
        changed = true;
        if (race === 'original-witness') f.original.packetSha256ByName[name] = 'e'.repeat(64);
        else if (race === 'plan') f.plan.planSha256 = 'e'.repeat(64);
        else if (race === 'verify') f.store.verify = async () => {};
        else if (race === 'namespace') await f.store.write(`${f.plan.planId}-terraform-network-foreign.json`, {});
        else
          f.loaders.loadOutcome = async () => {
            throw Error('synthetic changed loader');
          };
      }
      return value;
    };
    const calls = [...f.calls];
    await expect(f.readPrefix()).rejects.toThrow();
    expect(changed).toBe(true);
    expect(f.calls).toEqual(calls);
  }, 60000);
test('original prefix abort races a storage read that ignores its signal', async () => {
  const f = await fixture(),
    read = f.store.read,
    controller = new AbortController(),
    started = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<unknown>();
  f.store.read = async (name) => {
    started.resolve();
    return gate.promise.then(() => read.call(f.store, name));
  };
  const calls = [...f.calls],
    names = (await readdir(f.store.directory)).sort(),
    attempt = f.readPrefix(f.original, controller.signal);
  try {
    await started.promise;
    controller.abort(Error('synthetic stalled prefix abort'));
    await expect(attempt).rejects.toThrow('stalled prefix abort');
    expect(f.calls).toEqual(calls);
    expect((await readdir(f.store.directory)).sort()).toEqual(names);
  } finally {
    gate.resolve(undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}, 60000);
