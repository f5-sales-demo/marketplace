import { expect } from 'bun:test';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readAzureTerraformNetworkRetirementGraph,
  recheckAzureTerraformNetworkRetirementGraph,
} from '../../src/ce/terraform-network-retirement-graph';
import { test } from './owned-fixture-test';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';

async function fixture(signal?: AbortSignal) {
  const f = await terraformNetworkMainRunnerFixture();
  const verifier = f.dependencies.qualifyAcceptance;
  const mint = () => readAzureTerraformNetworkRetirementGraph(f.plan, f.store, f.loaders, f.site, verifier, signal);
  const graph = await mint();
  const refresh = (parent?: AbortSignal) =>
    recheckAzureTerraformNetworkRetirementGraph(graph, f.plan, f.store, f.loaders, f.site, verifier, parent);
  return { ...f, graph, verifier, refresh };
}
test('a genuine witness rechecks actual custody with stable graph and no runner commands', async () => {
  const f = await fixture();
  const commands = [...f.commands],
    calls = [...f.calls];
  expect(await f.refresh()).toEqual(f.graph);
  expect(f.commands).toEqual(commands);
  expect(f.calls).toEqual(calls);
}, 60000);
for (const foreign of ['object', 'clone', 'store', 'loaders', 'site', 'verifier'] as const)
  test(`foreign ${foreign} cannot borrow graph authentication`, async () => {
    const f = await fixture();
    const witness = foreign === 'object' ? {} : foreign === 'clone' ? structuredClone(f.graph) : f.graph;
    await expect(
      recheckAzureTerraformNetworkRetirementGraph(
        witness,
        f.plan,
        foreign === 'store' ? new Proxy(f.store, {}) : f.store,
        foreign === 'loaders' ? { ...f.loaders } : f.loaders,
        foreign === 'site' ? { ...f.site, siteUid: 'foreign' } : f.site,
        foreign === 'verifier'
          ? async () => ({
              status: 'verified',
              scope: 'node-interfaces-routing-traffic',
              evidenceSha256: 'a'.repeat(64),
            })
          : f.verifier,
      ),
    ).rejects.toThrow('owning authenticated graph witness required');
  }, 60000);
for (const changed of ['owner', 'method', 'packet', 'missing-packet', 'namespace'] as const)
  test(`changed ${changed} invalidates witnessed custody`, async () => {
    const f = await fixture();
    const name = `${f.plan.planId}-terraform-network-driver-complete.json`;
    if (changed === 'owner') f.store.owner.account = 'example-foreign';
    if (changed === 'method') f.loaders.loadOutcome = async () => ({});
    if (changed === 'packet') {
      const packet = (await f.store.read(name)) as { planSha256: string };
      packet.planSha256 = 'a'.repeat(64);
      await f.store.write(name, packet);
    }
    if (changed === 'missing-packet') await rm(join(f.store.directory, name));
    if (changed === 'namespace') await f.store.write(`${f.plan.planId}-terraform-network-foreign.json`, {});
    await expect(f.refresh()).rejects.toThrow();
  }, 60000);
for (const changed of ['source', 'outcome', 'verification'] as const)
  test(`changed ${changed} callback result invalidates a structurally identical graph`, async () => {
    const f = await terraformNetworkMainRunnerFixture();
    let changedNow = false;
    const source = f.loaders.loadSource,
      outcome = f.loaders.loadOutcome,
      verify = f.dependencies.qualifyAcceptance;
    f.loaders.loadSource = async (...args) => {
      const value = structuredClone(await source.apply(f.loaders, args));
      if (changedNow && changed === 'source') value.siteName = 'foreign';
      return value;
    };
    f.loaders.loadOutcome = async (...args) => {
      const value = structuredClone(await outcome.apply(f.loaders, args));
      if (changedNow && changed === 'outcome') Object.assign(value, { foreign: true });
      return value;
    };
    const verifier: typeof verify = async (...args) => {
      const value = structuredClone(await verify(...args));
      if (changedNow && changed === 'verification') value.evidenceSha256 = 'f'.repeat(64);
      return value;
    };
    const graph = await readAzureTerraformNetworkRetirementGraph(f.plan, f.store, f.loaders, f.site, verifier);
    changedNow = true;
    await expect(
      recheckAzureTerraformNetworkRetirementGraph(graph, f.plan, f.store, f.loaders, f.site, verifier),
    ).rejects.toThrow();
  }, 60000);
test('owner abort expires a minted witness even when refresh supplies no new signal', async () => {
  const controller = new AbortController();
  const f = await fixture(controller.signal);
  controller.abort(Error('original witness lifetime ended'));
  await expect(f.refresh()).rejects.toThrow('original witness lifetime ended');
}, 60000);
test('ignored source callback remains cancellation bounded and cannot produce late witnessed success', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const read = f.loaders.loadSource;
  let stall = false;
  const started = Promise.withResolvers<void>(),
    settled = Promise.withResolvers<void>();
  f.loaders.loadSource = async (...args) => {
    const value = await read.apply(f.loaders, args);
    if (stall) {
      started.resolve();
      await settled.promise;
    }
    return value;
  };
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  stall = true;
  const controller = new AbortController();
  const running = recheckAzureTerraformNetworkRetirementGraph(
    graph,
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
    controller.signal,
  );
  await started.promise;
  controller.abort(Error('synthetic witnessed read abort'));
  await expect(running).rejects.toThrow('synthetic witnessed read abort');
  settled.resolve();
}, 60000);

for (const changed of ['request', 'site'] as const)
  test(`caller ${changed} clone changed during witnessed recheck rejects`, async () => {
    const f = await terraformNetworkMainRunnerFixture();
    const request = structuredClone(f.plan),
      site = structuredClone(f.site);
    const source = f.loaders.loadSource;
    let change = false;
    f.loaders.loadSource = async (...args) => {
      const value = await source.apply(f.loaders, args);
      if (change) {
        if (changed === 'request') request.siteName = 'foreign';
        else site.siteUid = 'foreign';
      }
      return value;
    };
    const graph = await readAzureTerraformNetworkRetirementGraph(
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    );
    change = true;
    let accepted = false;
    try {
      await recheckAzureTerraformNetworkRetirementGraph(
        graph,
        request,
        f.store,
        f.loaders,
        site,
        f.dependencies.qualifyAcceptance,
      );
      accepted = true;
    } catch (error) {
      expect(error instanceof Error).toBe(true);
    }
    expect(accepted).toBe(false);
  }, 60000);

test('minted witness blocks deep mutation before custody while fresh native changes still reject', async () => {
  const f = await fixture();
  const name = Object.keys(f.graph.packetSha256ByName)[0];
  expect(Object.isFrozen(f.graph)).toBe(true);
  expect(Object.isFrozen(f.graph.packetSha256ByName)).toBe(true);
  expect(Object.isFrozen(f.graph.nodes)).toBe(true);
  expect(Object.isFrozen(f.graph.original.binding)).toBe(true);
  expect(() => {
    f.graph.packetSha256ByName[name] = 'a'.repeat(64);
  }).toThrow();
  expect(() => {
    f.graph.nodes.push(f.graph.nodes[0]);
  }).toThrow();
  expect(() => {
    f.graph.original.binding.source = '{}';
  }).toThrow();
  expect(() => Object.defineProperty(f.graph, 'schemaVersion', { value: 2 })).toThrow();
  await expect(f.refresh()).resolves.toEqual(f.graph);
  const value = JSON.parse(await readFile(join(f.store.directory, name), 'utf8'));
  await writeFile(join(f.store.directory, name), JSON.stringify({ ...value, foreign: true }), { mode: 0o600 });
  await expect(f.refresh()).rejects.toThrow();
}, 60000);

test('immutable witness isolates caller inputs and still rejects their later mutation', async () => {
  const f = await fixture();
  expect(Object.isFrozen(f.plan)).toBe(false);
  expect(Object.isFrozen(f.site)).toBe(false);
  expect(Object.isFrozen(f.store.owner)).toBe(false);
  f.plan.siteName = 'foreign';
  await expect(f.refresh()).rejects.toThrow();
}, 60000);
