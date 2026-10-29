import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkReplacementSourceBinding } from '../../src/ce/terraform-network-replacement-binding-reader';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false, restore = false) {
  const f = await terraformNetworkBoundReplacementFixture(ha, restore);
  const prepared = await bindAzureTerraformNetworkReplacementSource(
    f.input.plan,
    f.terraform,
    f.store,
    f.api,
    {},
    f.loaders,
    f.input.site,
    f.dependencies.qualifyAcceptance,
  );
  const digest = canonicalSha256(prepared.binding),
    name = `${f.input.plan.planId}-terraform-network-replacement-source.json`;
  const read = (signal?: AbortSignal, expected = digest) =>
    readAzureTerraformNetworkReplacementSourceBinding(
      f.input.plan,
      f.store,
      f.loaders,
      f.input.site,
      expected,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, prepared, digest, name, read };
}
for (const ha of [false, true])
  test(`owning historical reader authenticates ${ha ? 'HA' : 'single'} prepared source with executor lock held`, async () => {
    const f = await fixture(ha),
      release = await acquireProcessLock(`${f.store.directory}/.terraform-replacement-lock`);
    const calls = f.calls.slice(),
      prior = await f.store.read(f.name);
    try {
      const result = await f.read();
      expect(result.binding).toEqual(f.prepared.binding);
      expect(result.sourceBindingSha256).toBe(f.digest);
      expect(result.currentOperationalAcceptanceQualified).toBe(false);
      expect(await f.store.read(f.name)).toEqual(prior);
      expect(f.calls).toEqual(calls);
    } finally {
      await release();
    }
  }, 20000);
test('reader authenticates exact restored private source and both completed network predecessors', async () => {
  const f = await fixture(false, true),
    result = await f.read();
  expect(result.binding.source).toBe(f.h.finalSource);
  expect(result.binding.qualification.networkHistory).toHaveLength(2);
  expect(result.binding.qualification.networkHistory[1].planSha256).toBe(f.network.planSha256);
  expect(result.currentOperationalAcceptanceQualified).toBe(false);
}, 20000);
test('reading consumed selected-VM state does not open Terraform or query unavailable cloud', async () => {
  const f = await fixture();
  f.state.cloudUnavailable = true;
  f.terraform.open = async () => {
    throw Error('historical reader must not open Terraform');
  };
  f.api.exec = async () => {
    throw Error('historical reader must not observe cloud');
  };
  await f.store.write(`${f.input.plan.planId}-terraform-replacement.json`, { phase: 'quiesced' });
  const result = await f.read();
  expect(result.binding).toEqual(f.prepared.binding);
  expect(result.currentOperationalAcceptanceQualified).toBe(false);
});
for (const digest of ['__UNRESOLVED__', 'a'.repeat(64), '', 'A'.repeat(64)])
  test(`reader rejects unresolved or foreign journal digest ${digest.slice(0, 12)}`, async () => {
    const f = await fixture();
    await expect(f.read(undefined, digest)).rejects.toThrow();
  });
test('missing original binding is never reconstructed from prepared stages', async () => {
  const f = await fixture();
  await f.store.remove(f.name);
  await expect(f.read()).rejects.toMatchObject({ code: 'ENOENT' });
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
for (const kind of ['source', 'uuid', 'ip-config', 'outputs', 'qualification', 'extra'])
  test(`binding reader rejects internally changed ${kind} even with an updated caller digest`, async () => {
    const f = await fixture(),
      row = structuredClone(f.prepared.binding);
    if (kind === 'source') {
      row.source += ' ';
      row.sourceConfigurationSha256 = f.hash(row.source);
    }
    if (kind === 'uuid') row.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
    if (kind === 'ip-config') row.before.nodes['1'].nics['1'].ipConfigurationName = 'foreign';
    if (kind === 'outputs') row.outputs.unverified = true;
    if (kind === 'qualification') row.qualification.networkHistory[0].completionSha256 = 'a'.repeat(64);
    if (kind === 'extra') Object.assign(row, { unverified: true });
    await f.store.write(f.name, row);
    await expect(f.read(undefined, canonicalSha256(row))).rejects.toThrow();
  });
for (const kind of ['binding', 'history', 'source', 'outcome'])
  test(`reader rejects cross-read ${kind} race`, async () => {
    const f = await fixture();
    const verify = f.dependencies.qualifyAcceptance.bind(f.dependencies);
    const load = f.loaders.loadSource.bind(f.loaders),
      outcome = f.loaders.loadOutcome.bind(f.loaders);
    let changed = false;
    f.dependencies.qualifyAcceptance = async (...args) => {
      const result = await verify(...args);
      changed = true;
      if (kind === 'binding' || kind === 'history') {
        const name = kind === 'binding' ? f.name : `${f.network.planId}-terraform-network-driver-complete.json`;
        const row = (await f.store.read(name)) as Record<string, unknown>;
        await f.store.write(name, { ...row, unverified: true });
      }
      return result;
    };
    f.loaders.loadSource = async (d) => {
      const row = await load(d);
      return changed && kind === 'source' ? { ...row, warnings: ['foreign'] } : row;
    };
    f.loaders.loadOutcome = async (p) => {
      const row = await outcome(p);
      return changed && kind === 'outcome' ? { ...row, unverified: true } : row;
    };
    await expect(f.read()).rejects.toThrow();
  });
for (const ignored of ['verify', 'store', 'loader', 'outcome', 'verifier'])
  test(`binding reader bounds ignored ${ignored} without holding an execution lock`, async () => {
    const f = await fixture(),
      abort = new AbortController();
    let enteredAt = 0;
    const hang = () => {
      enteredAt = Date.now();
      setTimeout(() => abort.abort(Error('synthetic reading deadline')), 20);
      return new Promise<never>(() => {});
    };
    if (ignored === 'verify') f.store.verify = hang;
    if (ignored === 'store') f.store.read = hang;
    if (ignored === 'loader') f.loaders.loadSource = hang;
    if (ignored === 'outcome') f.loaders.loadOutcome = hang;
    if (ignored === 'verifier') f.dependencies.qualifyAcceptance = hang;
    await expect(f.read(abort.signal)).rejects.toThrow('synthetic reading deadline');
    expect(enteredAt).toBeGreaterThan(0);
    expect(Date.now() - enteredAt).toBeLessThan(1000);
    const release = await acquireProcessLock(`${f.store.directory}/.terraform-replacement-lock`);
    await release();
  });
test('reader rejects mutated requested site across historical qualification', async () => {
  const f = await fixture(),
    verify = f.dependencies.qualifyAcceptance.bind(f.dependencies);
  f.dependencies.qualifyAcceptance = async (...args) => {
    const result = await verify(...args);
    f.input.site.siteUid = 'foreign';
    return result;
  };
  await expect(f.read()).rejects.toThrow();
});
test('pre-cancelled reader reads no storage or loader', async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  f.store.read = async () => {
    throw Error('must not read');
  };
  f.loaders.loadSource = async () => {
    throw Error('must not load');
  };
  await expect(f.read(abort.signal)).rejects.toThrow('synthetic cancelled');
});

for (const kind of ['source', 'outcome'])
  test(`last ${kind} callback cannot change an already-rechecked packet without rejection`, async () => {
    const f = await fixture();
    let calls = 0,
      target = 0,
      changed = false;
    const mutate = async () => {
      const name = kind === 'source' ? f.name : `${f.network.planId}-terraform-network-driver-complete.json`;
      const row = (await f.store.read(name)) as Record<string, unknown>;
      await f.store.write(name, { ...row, unverified: true });
      changed = true;
    };
    if (kind === 'source') {
      const load = f.loaders.loadSource.bind(f.loaders);
      f.loaders.loadSource = async (d) => {
        const value = await load(d);
        if (++calls === target) await mutate();
        return value;
      };
    } else {
      const load = f.loaders.loadOutcome.bind(f.loaders);
      f.loaders.loadOutcome = async (p) => {
        const value = await load(p);
        if (++calls === target) await mutate();
        return value;
      };
    }
    // Count the complete production read, then race exactly its final external callback while
    // returning unchanged loader bytes. The persisted packet must be rechecked afterward.
    await f.read();
    target = calls;
    calls = 0;
    expect(target).toBeGreaterThan(0);
    await expect(f.read()).rejects.toThrow();
    expect(changed).toBe(true);
  });
