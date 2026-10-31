import { expect } from 'bun:test';
import {
  readAzureTerraformNetworkRetirementGraph,
  recheckAzureTerraformNetworkRetirementGraph,
} from '../../src/ce/terraform-network-retirement-graph';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import { test } from './owned-fixture-test';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';

test('graph mint bounds repeated native reads while rechecking every present packet', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    read = f.store.read,
    counts = new Map<string, number>();
  f.store.read = async (name) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return read.call(f.store, name);
  };
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const selected = Object.keys(graph.packetSha256ByName).map((name) => counts.get(name) ?? 0);
  expect(Math.min(...selected)).toBeGreaterThanOrEqual(2);
  expect(Math.max(...selected)).toBeLessThanOrEqual(2);
}, 60000);
test('packet snapshots cannot hide a changed native packet at final authentication', async () => {
  const f = await terraformNetworkMainRunnerFixture(),
    read = f.store.read,
    target = `${f.plan.planId}-terraform-network-driver-complete.json`;
  let count = 0;
  f.store.read = async (name) => {
    const value = await read.call(f.store, name);
    if (name === target && ++count === 2) return { ...(value as Record<string, unknown>), planSha256: 'e'.repeat(64) };
    return value;
  };
  await expect(
    readAzureTerraformNetworkRetirementGraph(f.plan, f.store, f.loaders, f.site, f.dependencies.qualifyAcceptance),
  ).rejects.toThrow();
  expect(count).toBeGreaterThanOrEqual(2);
}, 60000);
test('witness rechecks read native absence rather than cached ENOENT', async () => {
  const f = await terraformNetworkDriverFixture();
  await bindAzureTerraformNetworkUpdateSource(
    f.plan,
    f.terraform,
    f.store,
    f.api,
    {},
    f.loaders,
    f.site,
    undefined,
    f.dependencies.qualifyAcceptance,
  );
  const read = f.store.read;
  let inject = false,
    target = '';
  f.store.read = async (name) => {
    if (inject && name === target) return {};
    return read.call(f.store, name);
  };
  const graph = await readAzureTerraformNetworkRetirementGraph(
    f.plan,
    f.store,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  expect(graph.absentPackets.length).toBeGreaterThan(0);
  target = graph.absentPackets[0];
  inject = true;
  await expect(
    recheckAzureTerraformNetworkRetirementGraph(
      graph,
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow();
}, 60000);
