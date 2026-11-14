import { expect } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AzureTerraformNetworkCheckpoint } from '../../src/ce/terraform-network-checkpoint';
import { readAzureTerraformNetworkRetirementCheckpoint } from '../../src/ce/terraform-network-retirement-checkpoint';
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
  const modes: string[] = [];
  const verifier: typeof f.dependencies.qualifyAcceptance = async (receipt, identity, mode) => {
    modes.push(mode);
    return f.dependencies.qualifyAcceptance(receipt, identity, mode);
  };
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementCheckpoint(f.plan, f.store, f.loaders, f.site, verifier, signal);
  const open = () => AzureTerraformNetworkCheckpoint.open(f.plan, binding, f.store, verifier);
  const prefix = `${f.plan.planId}-terraform-network-driver-`,
    pointer = `${prefix}checkpoint.json`;
  return { ...f, binding, modes, runDriver: f.run, run, open, prefix, pointer };
}
async function records(f: Awaited<ReturnType<typeof fixture>>) {
  const rows: Record<string, unknown> = {};
  for (const name of (await readdir(f.store.directory)).sort())
    if (name.endsWith('.json')) rows[name] = await f.store.read(name);
  return rows;
}
for (const ha of [false, true])
  for (const boundary of ['source-only', 'root-only', 'pending-initial', 'current'] as const)
    test(`read-only ${ha ? 'HA' : 'single'} ${boundary} retains actual initial publication boundary`, async () => {
      const f = await fixture(ha);
      if (boundary !== 'source-only') {
        const write = f.store.write.bind(f.store);
        f.store.write = async (name, value) => {
          if (boundary === 'root-only' && name === `${f.prefix}revision-0.json`)
            throw Error('synthetic publication loss');
          if (boundary === 'pending-initial' && name === f.pointer) throw Error('synthetic publication loss');
          return write(name, value);
        };
        if (boundary === 'current') await f.open();
        else await expect(f.open()).rejects.toThrow('synthetic publication loss');
      }
      const before = await records(f),
        calls = [...f.calls],
        observations = [...f.observations];
      const row = await f.run();
      expect(row.pointerPublication).toBe(boundary);
      expect(row.snapshot?.checkpoint.revision).toBe(['current', 'pending-initial'].includes(boundary) ? 0 : undefined);
      expect(row.currentOperationalAcceptanceQualified).toBe(false);
      expect(row.retirementQualified).toBe(false);
      expect(row.originalSourceBindingSha256).toBe(canonicalSha256(f.binding));
      expect(await records(f)).toEqual(before);
      expect(f.calls).toEqual(calls);
      expect(f.observations).toEqual(observations);
      expect(f.modes).toEqual([]);
    });
for (const phase of ['deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'] as const)
  test(`authenticates actual durable ${phase} next revision without publishing lost pointer or replaying action`, async () => {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    f.store.write = async (name, value) => {
      const row = value as { nodes?: Array<{ phase: string }> };
      if (name === f.pointer && row.nodes?.at(-1)?.phase === phase) throw Error('synthetic pointer loss');
      return write(name, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic pointer loss');
    const before = await records(f),
      calls = [...f.calls],
      observations = [...f.observations];
    f.modes.length = 0;
    const row = await f.run();
    expect(row.pointerPublication).toBe('pending-revision');
    expect(row.snapshot?.phase).toBe(phase);
    expect(row.snapshot?.checkpoint.revision).toBe(
      ['deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'].indexOf(phase) + 1,
    );
    expect(row.retirementQualified).toBe(false);
    expect(await records(f)).toEqual(before);
    expect(f.calls).toEqual(calls);
    expect(f.observations).toEqual(observations);
    expect(f.modes.every((mode) => mode === 'historical')).toBe(true);
  }, 60000);
for (const ha of [false, true])
  test(`authenticates complete ${ha ? 'three-node HA' : 'single'} serial history using historical acceptance only`, async () => {
    const f = await fixture(ha);
    await f.runDriver();
    const before = await records(f),
      calls = [...f.calls],
      observations = [...f.observations];
    f.modes.length = 0;
    const row = await f.run();
    expect(row.pointerPublication).toBe('current');
    expect(row.snapshot?.allNodesAccepted).toBe(true);
    expect(row.snapshot?.checkpoint.nodes.map((node) => node.phase)).toEqual(Array(ha ? 3 : 1).fill('accepted'));
    expect(f.modes.length).toBeGreaterThan(0);
    expect(f.modes.every((mode) => mode === 'historical')).toBe(true);
    expect(row.retirementQualified).toBe(false);
    expect(await records(f)).toEqual(before);
    expect(f.calls).toEqual(calls);
    expect(f.observations).toEqual(observations);
  }, 120000);
for (const part of [
  'root',
  'revision',
  'revision-extra',
  'revision-leading-zero',
  'revision-later',
  'revision-foreign',
  'pointer-foreign',
  'unknown-driver',
  'missing-pointer-after-stage',
  'root-missing',
])
  test(`retirement checkpoint rejects ${part}`, async () => {
    const f = await fixture();
    await f.open();
    const initial = (await f.store.read(`${f.prefix}revision-0.json`)) as Record<string, unknown>;
    if (part === 'root')
      await f.store.write(`${f.prefix}root.json`, { schemaVersion: 1, initialCheckpointSha256: 'a'.repeat(64) });
    if (part === 'revision') await f.store.remove(`${f.prefix}revision-0.json`);
    if (part === 'revision-extra') await f.store.write(`${f.prefix}revision-0.json`, { ...initial, extra: true });
    if (part === 'revision-leading-zero') await f.store.write(`${f.prefix}revision-01.json`, initial);
    if (part === 'revision-later') await f.store.write(`${f.prefix}revision-2.json`, initial);
    if (part === 'revision-foreign')
      await f.store.write(`${f.prefix}revision-1.json`, {
        ...initial,
        revision: 1,
        previousCheckpointSha256: 'a'.repeat(64),
      });
    if (part === 'pointer-foreign')
      await f.store.write(f.pointer, { ...initial, owner: { ...f.store.owner, account: 'example-foreign' } });
    if (part === 'unknown-driver') await f.store.write(`${f.prefix}future.json`, initial);
    if (part === 'root-missing') await f.store.remove(`${f.prefix}root.json`);
    if (part === 'missing-pointer-after-stage') {
      await f.store.remove(f.pointer);
      await f.store.write(`${f.plan.planId}-terraform-network-node-1-orphan.json`, initial);
    }
    const before = await records(f);
    await expect(f.run()).rejects.toThrow();
    expect(await records(f)).toEqual(before);
    expect(f.calls).toEqual([]);
  });
for (const part of ['request', 'owner', 'directory', 'read', 'verify', 'loadSource', 'loadOutcome', 'site'])
  test(`checkpoint inspection rejects changed ${part} dependency`, async () => {
    const f = await fixture();
    await f.open();
    const read = f.store.read.bind(f.store);
    let fired = false;
    f.store.read = async (name) => {
      const value = await read(name);
      if (name === f.pointer && !fired) {
        fired = true;
        if (part === 'request') f.plan.siteName = 'changed';
        if (part === 'owner') f.store.owner.account = 'example-foreign';
        if (part === 'directory') Object.assign(f.store, { directory: `${f.store.directory}-foreign` });
        if (part === 'read') f.store.read = async () => value;
        if (part === 'verify') f.store.verify = async () => {};
        if (part === 'loadSource') f.loaders.loadSource = async () => f.plan;
        if (part === 'loadOutcome')
          f.loaders.loadOutcome = async () => {
            throw Error('foreign');
          };
        if (part === 'site') f.site.siteUid = 'foreign';
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('changed');
  });
for (const part of [
  'root-rewrite',
  'revision-rewrite',
  'pointer-rewrite',
  'new-directory-packet',
  'new-absent-pointer',
])
  test(`checkpoint final boundary rejects ${part}`, async () => {
    const f = await fixture();
    if (part !== 'new-absent-pointer') await f.open();
    const verify = f.store.verify.bind(f.store),
      read = f.store.read.bind(f.store);
    let observedPointer = false,
      fired = false;
    f.store.read = async (name) => {
      if (name === f.pointer) observedPointer = true;
      return read(name);
    };
    f.store.verify = async () => {
      await verify();
      if (!observedPointer || fired) return;
      fired = true;
      const name =
        part === 'root-rewrite'
          ? `${f.prefix}root.json`
          : part === 'revision-rewrite'
            ? `${f.prefix}revision-0.json`
            : part === 'new-directory-packet'
              ? `${f.prefix}future.json`
              : f.pointer;
      await f.store.write(name, { foreign: true });
    };
    await expect(f.run()).rejects.toThrow();
    expect(fired).toBe(true);
  });
for (const dependency of ['read', 'verify', 'loadSource', 'loadOutcome'])
  test(`checkpoint abort races ignored ${dependency}`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    const never = async (): Promise<never> => new Promise(() => {});
    if (dependency === 'read') f.store.read = never;
    if (dependency === 'verify') f.store.verify = never;
    if (dependency === 'loadSource') f.loaders.loadSource = never;
    if (dependency === 'loadOutcome') f.loaders.loadOutcome = never;
    const pending = f.run(abort.signal);
    setTimeout(() => abort.abort(Error('synthetic checkpoint cancellation')), 20);
    await expect(pending).rejects.toThrow('synthetic checkpoint cancellation');
  });
test('pre-cancelled checkpoint makes no storage call', async () => {
  const f = await fixture(),
    abort = new AbortController();
  f.store.read = async () => {
    throw Error('must not read');
  };
  f.store.verify = async () => {
    throw Error('must not verify');
  };
  abort.abort(Error('synthetic pre-cancelled checkpoint'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic pre-cancelled checkpoint');
});
for (const part of [
  'missing-complete',
  'complete-foreign',
  'current-schema',
  'current-foreign',
  'current-changes',
  'current-evidence',
])
  test(`completed checkpoint rejects ${part} without granting current acceptance`, async () => {
    const f = await fixture();
    await f.runDriver();
    const complete = `${f.prefix}complete.json`,
      current = `${f.prefix}current-final.json`;
    if (part === 'missing-complete') await f.store.remove(complete);
    else {
      const name = part === 'complete-foreign' ? complete : current;
      const value = (await f.store.read(name)) as Record<string, unknown>;
      if (part === 'complete-foreign' || part === 'current-foreign') value.planSha256 = 'a'.repeat(64);
      if (part === 'current-schema') value.schemaVersion = 99;
      if (part === 'current-changes')
        value.receipt = { ...(value.receipt as Record<string, unknown>), noChanges: false };
      if (part === 'current-evidence') value.evidenceByNode = {};
      await f.store.write(name, value);
    }
    const calls = [...f.calls];
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual(calls);
  }, 60000);
for (const phase of ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'] as const)
  test(`authenticates actual HA node-two pending ${phase} revision with accepted predecessor`, async () => {
    const f = await fixture(true),
      write = f.store.write.bind(f.store);
    f.store.write = async (name, value) => {
      const row = value as { nodes?: Array<{ phase: string }> };
      if (name === f.pointer && row.nodes?.length === 2 && row.nodes.at(-1)?.phase === phase)
        throw Error('synthetic second-node pointer loss');
      return write(name, value);
    };
    await expect(f.runDriver()).rejects.toThrow('synthetic second-node pointer loss');
    const calls = [...f.calls],
      before = await records(f);
    const row = await f.run();
    expect(row.pointerPublication).toBe('pending-revision');
    expect(row.snapshot?.currentNode).toBe(2);
    expect(row.snapshot?.checkpoint.nodes[0].phase).toBe('accepted');
    expect(row.snapshot?.phase).toBe(phase);
    expect(row.snapshot?.allNodesAccepted).toBe(false);
    expect(await records(f)).toEqual(before);
    expect(f.calls).toEqual(calls);
  }, 120000);
for (const dependency of ['source-result', 'outcome-result'])
  test(`checkpoint rejects changed original ${dependency} after source-reader boundary`, async () => {
    const f = await fixture();
    await f.open();
    let afterPointer = false;
    const read = f.store.read.bind(f.store),
      source = f.loaders.loadSource.bind(f.loaders),
      outcome = f.loaders.loadOutcome.bind(f.loaders);
    f.store.read = async (name) => {
      const value = await read(name);
      if (name === f.pointer) afterPointer = true;
      return value;
    };
    f.loaders.loadSource = async (digest) => {
      const value = await source(digest);
      return afterPointer && dependency === 'source-result' ? { ...value, siteName: 'foreign' } : value;
    };
    f.loaders.loadOutcome = async (plan) => {
      const value = await outcome(plan);
      return afterPointer && dependency === 'outcome-result' ? { ...value, foreign: true } : value;
    };
    await expect(f.run()).rejects.toThrow('changed');
  });
test('checkpoint abort races ignored historical acceptance verifier', async () => {
  const f = await fixture();
  await f.runDriver();
  f.dependencies.qualifyAcceptance = async () => new Promise(() => {});
  const abort = new AbortController(),
    pending = f.run(abort.signal);
  setTimeout(() => abort.abort(Error('synthetic ignored history cancellation')), 20);
  await expect(pending).rejects.toThrow('synthetic ignored history cancellation');
}, 60000);
