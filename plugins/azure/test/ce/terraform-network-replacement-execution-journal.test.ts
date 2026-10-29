import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  bindAzureTerraformNetworkReplacementExecutionJournal,
  readAzureTerraformNetworkReplacementExecutionJournal,
} from '../../src/ce/terraform-network-replacement-execution-journal';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false) {
  const f = await terraformNetworkBoundReplacementFixture(ha);
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
  const sourceDigest = canonicalSha256(prepared.binding);
  const name = `${f.input.plan.planId}-terraform-network-replacement-execution.json`;
  const args = [
    f.input.plan,
    f.store,
    f.loaders,
    f.input.site,
    sourceDigest,
    f.dependencies.qualifyAcceptance,
  ] as const;
  const bind = (signal?: AbortSignal) => bindAzureTerraformNetworkReplacementExecutionJournal(...args, signal);
  const read = (journalDigest: string, signal?: AbortSignal) =>
    readAzureTerraformNetworkReplacementExecutionJournal(
      f.input.plan,
      f.store,
      f.loaders,
      f.input.site,
      journalDigest,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, prepared, sourceDigest, name, bind, read };
}
for (const ha of [false, true])
  test(`journal freezes ${ha ? 'HA' : 'single'} owning binding before enrollment and reads with executor lock held`, async () => {
    const f = await fixture(ha),
      calls = f.calls.slice(),
      result = await f.bind();
    expect(result.journal.sourceBindingSha256).toBe(f.sourceDigest);
    expect(result.journal.sourceConfigurationSha256).toBe(f.prepared.binding.sourceConfigurationSha256);
    expect(result.journal.owner).toEqual(f.store.owner);
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(await f.bind()).toEqual(result);
    const release = await acquireProcessLock(`${f.store.directory}/.terraform-replacement-lock`);
    try {
      expect(await f.read(result.journalSha256)).toEqual(result);
    } finally {
      await release();
    }
    expect(f.calls).toEqual(calls);
    expect(JSON.stringify(result)).not.toContain('#cloud-config');
  }, 20000);
for (const later of [
  'replacement',
  'replacement-source',
  'quiesce-plan',
  'launch-plan',
  'quiesce-recovery',
  'launch-recovery',
  'replacement-registration',
  'replacement-final-plan',
  'network-replacement-complete',
])
  test(`missing original journal rejects published ${later}`, async () => {
    const f = await fixture();
    await f.store.write(`${f.input.plan.planId}-terraform-${later}.json`, {});
    await expect(f.bind()).rejects.toThrow('missing after enrollment or stage publication');
    await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
  });
test('missing original journal rejects enrollment evidence', async () => {
  const f = await fixture(),
    p = f.input.plan;
  await f.store.write(
    `${p.deploymentName.slice(0, 40)}-${p.intent.replacementNode}-${p.planSha256.slice(0, 12)}.json`,
    {},
  );
  await expect(f.bind()).rejects.toThrow('missing after enrollment or stage publication');
});
for (const field of [
  'owner',
  'sourceBindingSha256',
  'sourceConfigurationSha256',
  'retainedPlanSha256',
  'site',
  'node',
  'extra',
])
  test(`journal read rejects changed ${field}`, async () => {
    const f = await fixture(),
      result = await f.bind(),
      row = structuredClone(result.journal) as unknown as Record<string, unknown>;
    if (field === 'owner') row.owner = { ...f.store.owner, account: 'example-foreign' };
    else if (field === 'site') row.site = { ...f.input.site, siteUid: 'foreign' };
    else if (field === 'node') row.node = 99;
    else if (field === 'extra') row.unverified = true;
    else row[field] = 'a'.repeat(64);
    await f.store.write(f.name, row);
    await expect(f.read(result.journalSha256)).rejects.toThrow();
    await expect(f.read(canonicalSha256(row))).rejects.toThrow();
  });
for (const timing of ['before', 'after'])
  test(`lost ${timing} journal publication resumes exact digest`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    let fail = true;
    f.store.write = async (name, value) => {
      if (name === f.name && fail) {
        fail = false;
        if (timing === 'after') await write(name, value);
        throw Error('synthetic lost response');
      }
      await write(name, value);
    };
    await expect(f.bind()).rejects.toThrow('synthetic lost response');
    const done = await f.bind();
    expect(await f.read(done.journalSha256)).toEqual(done);
  });
test('saved journal resumes after selected VM is absent without opening Terraform or cloud', async () => {
  const f = await fixture(),
    done = await f.bind();
  await f.store.write(`${f.input.plan.planId}-terraform-replacement.json`, { phase: 'quiesced' });
  f.api.exec = async () => {
    throw Error('must not query cloud');
  };
  f.terraform.open = async () => {
    throw Error('must not open Terraform');
  };
  expect(await f.bind()).toEqual(done);
  expect(await f.read(done.journalSha256)).toEqual(done);
});
test('journal creation rejects late enrollment publication by unchanged source loader', async () => {
  const f = await fixture(),
    load = f.loaders.loadSource.bind(f.loaders);
  f.loaders.loadSource = async (d) => {
    const row = await load(d);
    await f.store.write(`${f.input.plan.planId}-terraform-launch-plan.json`, {});
    return row;
  };
  await expect(f.bind()).rejects.toThrow('missing after enrollment or stage publication');
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('journal read rejects a final loader callback changing persisted journal', async () => {
  const f = await fixture(),
    done = await f.bind(),
    load = f.loaders.loadSource.bind(f.loaders);
  let calls = 0,
    target = 0,
    changed = false;
  f.loaders.loadSource = async (d) => {
    const value = await load(d);
    if (++calls === target) {
      await f.store.write(f.name, { ...done.journal, unverified: true });
      changed = true;
    }
    return value;
  };
  await f.read(done.journalSha256);
  target = calls;
  calls = 0;
  expect(target).toBeGreaterThan(0);
  await expect(f.read(done.journalSha256)).rejects.toThrow();
  expect(changed).toBe(true);
});
test('pre-cancelled journal initialization publishes nothing', async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  await expect(f.bind(abort.signal)).rejects.toThrow('synthetic cancelled');
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('unresolved journal digest rejects without loading historical source', async () => {
  const f = await fixture();
  f.loaders.loadSource = async () => {
    throw Error('must not load');
  };
  await expect(f.read('__UNRESOLVED__')).rejects.toThrow('resolved owning journal digest');
});

test('missing original source cannot be rebuilt after execution journal publication', async () => {
  const f = await fixture();
  await f.bind();
  await f.store.remove(`${f.input.plan.planId}-terraform-network-replacement-source.json`);
  await expect(
    bindAzureTerraformNetworkReplacementSource(
      f.input.plan,
      f.terraform,
      f.store,
      f.api,
      {},
      f.loaders,
      f.input.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow('original binding missing');
  await expect(f.store.read(`${f.input.plan.planId}-terraform-network-replacement-source.json`)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
test('journal initializer respects live owning execution exclusion', async () => {
  const f = await fixture(),
    release = await acquireProcessLock(`${f.store.directory}/.terraform-replacement-lock`);
  try {
    await expect(f.bind()).rejects.toThrow('Operation lock is held by a live process');
  } finally {
    await release();
  }
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('ignored historical loader is cancellation bounded and releases journal lock', async () => {
  const f = await fixture(),
    abort = new AbortController();
  f.loaders.loadSource = () => {
    setTimeout(() => abort.abort(Error('synthetic journal deadline')), 20);
    return new Promise<never>(() => {});
  };
  const started = Date.now();
  await expect(f.bind(abort.signal)).rejects.toThrow('synthetic journal deadline');
  expect(Date.now() - started).toBeLessThan(1000);
  const release = await acquireProcessLock(`${f.store.directory}/.terraform-replacement-lock`);
  await release();
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
test('journal initializer rejects foreign resolved source-binding digest', async () => {
  const f = await fixture();
  await expect(
    bindAzureTerraformNetworkReplacementExecutionJournal(
      f.input.plan,
      f.store,
      f.loaders,
      f.input.site,
      'a'.repeat(64),
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow('owning journal digest');
  await expect(f.store.read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
});
