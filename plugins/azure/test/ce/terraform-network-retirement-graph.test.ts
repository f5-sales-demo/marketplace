import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AzureTerraformNetworkCheckpoint } from '../../src/ce/terraform-network-checkpoint';
import { readAzureTerraformNetworkRetirementGraph } from '../../src/ce/terraform-network-retirement-graph';
import { buildAzureTerraformNetworkPinnedNicStage } from '../../src/ce/terraform-network-routing';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import { test } from './owned-fixture-test';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

async function fixture(ha = false) {
  const f = await terraformNetworkDriverFixture(ha);
  const { binding } = await bindAzureTerraformNetworkUpdateSource(
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
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementGraph(
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, binding, runDriver: f.run, run };
}
for (const ha of [false, true])
  test(`complete ${ha ? 'three-node HA' : 'single'} graph authenticates actual packet union without runner or cleanup admission`, async () => {
    const f = await fixture(ha);
    await f.runDriver();
    const calls = [...f.calls],
      observations = [...f.observations];
    const row = await f.run();
    expect(row.nodes).toHaveLength(ha ? 3 : 1);
    expect(row.nodes.every((node) => node.phase === 'accepted')).toBe(true);
    expect(row.powerDeployments).toHaveLength(ha ? 6 : 2);
    expect(row.submittedRunnerJournalsQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
    expect(row.parentRetirementQualified).toBe(false);
    expect(f.calls).toEqual(calls);
    expect(f.observations).toEqual(observations);
    for (const [name, digest] of Object.entries(row.packetSha256ByName))
      expect(canonicalSha256(await f.store.read(name))).toBe(digest);
  }, 120000);
for (const stage of ['deallocate', 'nic', 'start', 'routing'])
  test(`lost actual ${stage} stage response remains authenticated ahead of serial transition`, async () => {
    const f = await fixture();
    f.state.lostStage = stage;
    await expect(f.runDriver()).rejects.toThrow('synthetic lost completed stage response');
    const calls = [...f.calls],
      row = await f.run();
    expect(row.nodes).toHaveLength(1);
    expect(row.nodes[0].phase).toBe(
      stage === 'deallocate'
        ? 'prepared'
        : stage === 'nic'
          ? 'deallocated'
          : stage === 'start'
            ? 'nic-complete'
            : 'restarted',
    );
    expect(row.retirementQualified).toBe(false);
    expect(f.calls).toEqual(calls);
  }, 60000);
for (const boundary of ['source-only', 'root-only', 'pending-initial'] as const)
  test(`${boundary} graph retains no authorized power runner`, async () => {
    const f = await fixture();
    if (boundary !== 'source-only') {
      const write = f.store.write.bind(f.store);
      f.store.write = async (name, value) => {
        if (boundary === 'root-only' && name.endsWith('-driver-revision-0.json')) throw Error('synthetic initial loss');
        if (boundary === 'pending-initial' && name.endsWith('-driver-checkpoint.json'))
          throw Error('synthetic initial loss');
        return write(name, value);
      };
      await expect(
        AzureTerraformNetworkCheckpoint.open(f.plan, f.binding, f.store, f.dependencies.qualifyAcceptance),
      ).rejects.toThrow('synthetic initial loss');
    }
    const row = await f.run();
    expect(row.checkpoint.pointerPublication).toBe(boundary);
    expect(row.powerDeployments).toHaveLength(0);
    expect(row.nodes).toHaveLength(boundary === 'pending-initial' ? 1 : 0);
    expect(row.retirementQualified).toBe(false);
  });
for (const suffix of [
  'prepared',
  'mutation-plan',
  'nic-binding',
  'mutation-outcome',
  'mutation-complete',
  'final-plan',
  'current-no-change-plan',
])
  test(`actual lost NIC ${suffix} publication preserves exact interrupted graph`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    const target = `${f.plan.planId}-terraform-network-node-1-${suffix}.json`;
    f.store.write = async (name, value) => {
      if (name === target) throw Error('synthetic partial NIC graph');
      return write(name, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic partial NIC graph');
    const row = await f.run();
    expect(row.nodes[0].phase).toBe('deallocated');
    expect(row.nodes[0].nic.allPacketsPresent).toBe(false);
    expect(row.submittedRunnerJournalsQualified).toBe(false);
    expect(row.retirementQualified).toBe(false);
  }, 60000);
for (const part of [
  'preflight-missing',
  'preflight-foreign',
  'future-node',
  'unknown-packet',
  'missing-power-final',
  'foreign-mac',
  'verifier-scope',
])
  test(`graph rejects ${part} without cleanup admission`, async () => {
    const f = await fixture();
    await f.runDriver();
    const prefix = `${f.plan.planId}-terraform-network-node-1`;
    if (part === 'preflight-missing') await f.store.remove(`${prefix}-preflight.json`);
    if (part === 'preflight-foreign') {
      const packet = (await f.store.read(`${prefix}-preflight.json`)) as Record<string, unknown>;
      packet.sourceBindingSha256 = 'a'.repeat(64);
      await f.store.write(`${prefix}-preflight.json`, packet);
    }
    if (part === 'future-node') await f.store.write(`${f.plan.planId}-terraform-network-node-4-preflight.json`, {});
    if (part === 'unknown-packet') await f.store.write(`${prefix}-future.json`, {});
    if (part === 'missing-power-final') await f.store.remove(`${prefix}-deallocate-final-plan.json`);
    if (part === 'foreign-mac') f.binding.before.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    if (part === 'foreign-mac') await f.store.write(`${f.plan.planId}-terraform-network-source.json`, f.binding);
    if (part === 'verifier-scope') f.state.wrongScope = true;
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  }, 60000);
test('qualified NIC prepared packet cannot skip the serial deallocate publication', async () => {
  const f = await fixture();
  f.state.lostStage = 'deallocate';
  await expect(f.runDriver()).rejects.toThrow();
  const stage = buildAzureTerraformNetworkPinnedNicStage(f.plan, f.binding.source, f.binding.before, 1);
  await f.store.write(`${f.plan.planId}-terraform-network-node-1-prepared.json`, {
    schemaVersion: 1,
    planSha256: f.plan.planSha256,
    inventorySha256: canonicalSha256(f.binding.before),
    appliedNics: [],
    stage,
  });
  await expect(f.run()).rejects.toThrow('serial deallocate prerequisite');
}, 60000);
for (const part of ['plan', 'site', 'read', 'verify', 'loadSource'])
  test(`graph rejects changed ${part} dependency before further reads`, async () => {
    const f = await fixture(),
      read = f.store.read.bind(f.store);
    let fired = false;
    f.store.read = async (name) => {
      const value = await read(name);
      if (!fired) {
        fired = true;
        if (part === 'plan') f.plan.siteName = 'changed';
        if (part === 'site') f.site.siteUid = 'foreign';
        if (part === 'read') f.store.read = async () => value;
        if (part === 'verify') f.store.verify = async () => {};
        if (part === 'loadSource') f.loaders.loadSource = async () => f.plan;
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('changed');
  });
for (const part of ['read', 'verify', 'historical-verifier'])
  test(`graph abort races ignored ${part}`, async () => {
    const f = await fixture();
    if (part === 'historical-verifier') await f.runDriver();
    const never = async (): Promise<never> => new Promise(() => {});
    if (part === 'read') f.store.read = never;
    if (part === 'verify') f.store.verify = never;
    if (part === 'historical-verifier') f.dependencies.qualifyAcceptance = never;
    const abort = new AbortController(),
      pending = f.run(abort.signal);
    setTimeout(() => abort.abort(Error('synthetic graph cancellation')), 20);
    await expect(pending).rejects.toThrow('synthetic graph cancellation');
  }, 60000);
for (const suffix of [
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
])
  test(`actual deallocate ${suffix} lost publication remains an interrupted graph`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    const name = `${f.plan.planId}-terraform-network-node-1-deallocate-${suffix}.json`;
    f.store.write = async (packet, value) => {
      if (packet === name) throw Error('synthetic partial power graph');
      return write(packet, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic partial power graph');
    const row = await f.run();
    expect(row.nodes[0].phase).toBe('prepared');
    expect(row.nodes[0].deallocate.allPacketsPresent).toBe(false);
    expect(row.nodes[0].nic.lastPacket).toBe(null);
    expect(row.submittedRunnerJournalsQualified).toBe(false);
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
  'current-no-change-plan',
])
  test(`actual routing ${suffix} lost publication remains an interrupted graph`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    const name = `${f.plan.planId}-terraform-network-node-1-routing-${suffix}.json`;
    f.store.write = async (packet, value) => {
      if (packet === name) throw Error('synthetic partial routing graph');
      return write(packet, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic partial routing graph');
    const row = await f.run();
    expect(row.nodes[0].phase).toBe('restarted');
    expect(row.nodes[0].routing?.allPacketsPresent).toBe(false);
    expect(row.nodes[0].start.receipts.final?.noChanges).toBe(true);
    expect(row.submittedRunnerJournalsQualified).toBe(false);
  }, 60000);
for (const phase of ['deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'] as const)
  test(`graph authenticates actual pending ${phase} immutable revision with original pointer retained`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store),
      name = `${f.plan.planId}-terraform-network-driver-checkpoint.json`;
    f.store.write = async (packet, value) => {
      const checkpoint = value as { nodes?: Array<{ phase: string }> };
      if (packet === name && checkpoint.nodes?.at(-1)?.phase === phase) throw Error('synthetic pending graph revision');
      return write(packet, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic pending graph revision');
    const row = await f.run();
    expect(row.checkpoint.pointerPublication).toBe('pending-revision');
    expect(row.nodes[0].phase).toBe(phase);
    expect(row.retirementQualified).toBe(false);
  }, 60000);
test('graph rechecks original loader result after composed current-packet reads', async () => {
  const f = await fixture();
  await f.runDriver();
  const read = f.store.read.bind(f.store),
    load = f.loaders.loadSource.bind(f.loaders);
  let finalPacket = false;
  f.store.read = async (name) => {
    const value = await read(name);
    if (name.endsWith('-routing-current-no-change-plan.json')) finalPacket = true;
    return value;
  };
  f.loaders.loadSource = async (digest) => {
    const value = await load(digest);
    return finalPacket ? { ...value, siteName: 'foreign' } : value;
  };
  await expect(f.run()).rejects.toThrow('original source changed');
}, 60000);
