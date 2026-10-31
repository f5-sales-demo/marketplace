import { expect } from 'bun:test';
import { observeAzureTerraformNetworkReplacementEnrollment } from '../../src/ce/terraform-network-replacement-enrollment';
import { openAzureTerraformNetworkReplacementExecution } from '../../src/ce/terraform-network-replacement-execution';
import { test } from './owned-fixture-test';

import { networkReplacementExecutorFixture as fixture } from './terraform-network-replacement-executor-fixture';

for (const ha of [false, true])
  test(`actual network-bound ${ha ? 'HA' : 'single'} executor unknown preflight preserves all resources without bootstrap`, async () => {
    const f = await fixture(ha);
    f.state.unknown = 'preflight';
    const result = await f.run();
    expect(result.status).toBe('operational-acceptance-pending');
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(0);
  }, 30000);
for (const ha of [false, true])
  for (const loss of ['none', 'quiesced', 'launched', 'revision'] as const)
    test(`actual network-bound ${ha ? 'HA' : 'single'} executor stages ${loss}`, async () => {
      const f = await fixture(ha);
      f.state.loss = loss;
      if (loss === 'revision') await expect(f.run()).rejects.toThrow('lost revision');
      const result = await f.run();
      expect(result.status).toBe('complete');
      expect(f.state.applies).toBe(2);
      expect(f.state.reconciles).toBe(loss === 'quiesced' || loss === 'launched' ? 1 : 0);
      expect(f.state.bootstraps).toBe(1);
      expect(f.state.phase).toBe('launched');
      expect(f.state.collected).toContain('final');
      const again = await f.run();
      expect(again.status).toBe('complete');
      expect(f.state.applies).toBe(2);
    }, 60000);
for (const mode of ['primary', 'callback-journal', 'after-apply-journal', 'wrong-scope', 'foreign-digest'] as const)
  test(`actual executor rejects or stays pending for ${mode}`, async () => {
    const f = await fixture();
    f.state.tamper = mode;
    if (mode === 'wrong-scope') f.state.wrongScope = true;
    if (mode === 'foreign-digest') f.dependencies.journalSha256 = 'a'.repeat(64);
    if (mode === 'wrong-scope') expect((await f.run()).status).toBe('operational-acceptance-pending');
    else await expect(f.run()).rejects.toThrow();
    expect(f.state.applies).toBe(mode === 'after-apply-journal' ? 1 : 0);
    expect(f.state.reconciles).toBe(0);
  }, 30000);
test('final unknown retains launched checkpoint and resumes without repeated VM mutation', async () => {
  const f = await fixture();
  f.state.unknown = 'final';
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  expect(f.state.applies).toBe(2);
  expect(((await f.store.read(`${f.input.plan.planId}-terraform-replacement.json`)) as { phase: string }).phase).toBe(
    'launched',
  );
  f.state.unknown = '';
  expect((await f.run()).status).toBe('complete');
  expect(f.state.applies).toBe(2);
}, 60000);

for (const phase of ['quiesced', 'launched'] as const)
  for (const ha of [false, true])
    test(`actual executor lost ${phase} checkpoint (${ha ? 'HA' : 'single'}) resumes consumed stage`, async () => {
      const f = await fixture(ha),
        write = f.store.write.bind(f.store);
      let lost = false;
      f.store.write = async (name, value) => {
        if (
          !lost &&
          name === `${f.input.plan.planId}-terraform-replacement.json` &&
          (value as { phase?: string }).phase === phase
        ) {
          lost = true;
          throw Error('lost checkpoint publication');
        }
        return write(name, value);
      };
      await expect(f.run()).rejects.toThrow('lost checkpoint publication');
      f.store.write = write;
      expect((await f.run()).status).toBe('complete');
      expect(f.state.applies).toBe(2);
      expect(f.state.bootstraps).toBe(1);
    }, 60000);
test('unavailable operational evidence after private revision cannot authorize first VM apply and resumes', async () => {
  const f = await fixture();
  f.state.unknownAfterRevision = true;
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(1);
  f.state.unknownAfterRevision = false;
  expect((await f.run()).status).toBe('complete');
  expect(f.state.applies).toBe(2);
  expect(f.state.bootstraps).toBe(1);
}, 60000);
test('missing original executor source after enrollment rejects reconstruction', async () => {
  const f = await fixture();
  f.state.unknownAfterRevision = true;
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  await f.store.remove(`${f.input.plan.planId}-terraform-replacement.json`);
  await f.store.remove(`${f.input.plan.planId}-terraform-replacement-source.json`);
  f.state.configuration = f.binding.source;
  f.state.unknownAfterRevision = false;
  await expect(f.run()).rejects.toThrow(/original execution source missing/);
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(1);
}, 30000);
test('unresolved saved application state rejects before VM apply', async () => {
  const f = await fixture();
  f.state.wrongState = true;
  await expect(f.run()).rejects.toThrow(/not unsubmitted/);
  expect(f.state.applies).toBe(0);
  expect(f.state.reconciles).toBe(0);
}, 30000);
for (const field of ['networkExecutionJournalSha256', 'networkSourceBindingSha256'] as const)
  test(`owning executor rejects missing checkpoint ${field}`, async () => {
    const f = await fixture();
    f.state.unknownAfterRevision = true;
    expect((await f.run()).status).toBe('operational-acceptance-pending');
    const name = `${f.input.plan.planId}-terraform-replacement.json`,
      cp = (await f.store.read(name)) as Record<string, unknown>;
    delete cp[field];
    await f.store.write(name, cp);
    f.state.unknownAfterRevision = false;
    await expect(f.run()).rejects.toThrow(/checkpoint differs/);
    expect(f.state.applies).toBe(0);
  }, 30000);

test('final operational callback cannot change private execution material before completion', async () => {
  const f = await fixture();
  f.state.tamper = 'final-source';
  await expect(f.run()).rejects.toThrow(/private source snapshot differs/);
  expect(f.state.applies).toBe(2);
  expect(((await f.store.read(`${f.input.plan.planId}-terraform-replacement.json`)) as { phase: string }).phase).toBe(
    'launched',
  );
}, 30000);

for (const phase of ['quiesced', 'launched'] as const)
  test(`missing consumed ${phase} saved plan cannot be reconstructed from no-change evidence`, async () => {
    const f = await fixture(),
      write = f.store.write.bind(f.store);
    let lost = false;
    f.store.write = async (name, value) => {
      if (
        !lost &&
        name === `${f.input.plan.planId}-terraform-replacement.json` &&
        (value as { phase?: string }).phase === phase
      ) {
        lost = true;
        throw Error('lost checkpoint publication');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('lost checkpoint publication');
    f.store.write = write;
    await f.store.remove(`${f.input.plan.planId}-terraform-${phase === 'quiesced' ? 'quiesce' : 'launch'}-plan.json`);
    await expect(f.run()).rejects.toThrow();
    expect(f.state.applies).toBe(phase === 'quiesced' ? 1 : 2);
  }, 30000);
test('fixed execution boundary seals private configuration after all provenance callbacks', async () => {
  const f = await fixture(),
    guard = await openAzureTerraformNetworkReplacementExecution(
      f.input.plan,
      f.store,
      f.session,
      f.executionApi,
      f.dependencies,
    );
  f.state.tamper = 'late-config';
  await expect(guard.check(f.binding.sourceConfigurationSha256, 'intact')).rejects.toThrow(
    /private configuration revision differs/,
  );
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(0);
}, 30000);

for (const ha of [false, true])
  test(`current saved enrollment expired prevents unsubmitted VM apply (${ha ? 'HA' : 'single'})`, async () => {
    const f = await fixture(ha);
    f.state.tokenMode = 'expired';
    expect((await f.run()).status).toBe('enrollment-pending');
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(1);
  }, 30000);
test('current token service loss before launch stays pending and resumes without repeating quiesce', async () => {
  const f = await fixture();
  f.state.tokenMode = 'unavailable-on-launch';
  expect((await f.run()).status).toBe('enrollment-pending');
  expect(f.state.applies).toBe(1);
  f.state.tokenMode = '';
  expect((await f.run()).status).toBe('complete');
  expect(f.state.applies).toBe(2);
  expect(f.state.bootstraps).toBe(1);
}, 30000);
test('current API token change cannot authorize saved bootstrap', async () => {
  const f = await fixture();
  f.state.tokenMode = 'changed-api-token';
  expect((await f.run()).status).toBe('enrollment-pending');
  expect(f.state.applies).toBe(0);
}, 30000);
test('renewed private JWT cannot silently alter frozen unsubmitted bootstrap', async () => {
  const f = await fixture();
  f.state.unknownAfterRevision = true;
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  const token = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`,
    saved = (await f.store.read(`${token}.json`)) as { jwt: string };
  saved.jwt = 'e30.e30.Zm9yZWlnbg';
  await f.store.write(`${token}.json`, saved);
  f.state.unknownAfterRevision = false;
  await expect(f.run()).rejects.toThrow(/issued site-bound JWT/);
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(1);
}, 30000);

test('current enrollment callback cannot change private JWT before unsubmitted apply', async () => {
  const f = await fixture();
  f.state.tokenMode = 'late-private-race';
  await expect(f.run()).rejects.toThrow(/private token changed/);
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(1);
}, 30000);
test('ignored enrollment observer respects external cancellation without VM mutation', async () => {
  const f = await fixture();
  f.state.unknownAfterRevision = true;
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  const packet = (await f.store.read(`${f.input.plan.planId}-terraform-replacement-source.json`)) as {
    bootstrap: string;
    preparedCheckpoint: { bootstrapSha256: string };
  };
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(Error('enrollment cancelled')), 10);
  try {
    await expect(
      observeAzureTerraformNetworkReplacementEnrollment(
        f.input.plan,
        packet.bootstrap,
        packet.preparedCheckpoint.bootstrapSha256,
        f.store,
        { engine: 'terraform', observeIssuedBootstrapToken: async () => new Promise(() => {}) },
        controller.signal,
      ),
    ).rejects.toThrow(/enrollment cancelled/);
  } finally {
    clearTimeout(timer);
  }
  expect(f.state.applies).toBe(0);
}, 30000);

test('last saved application-state callback cannot renew private enrollment before apply', async () => {
  const f = await fixture(),
    original = f.session.readPlanApplicationState.bind(f.session),
    tokenName = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`;
  let changed = false;
  f.session.readPlanApplicationState = async (receipt) => {
    const result = await original(receipt);
    if (!changed) {
      changed = true;
      const saved = (await f.store.read(`${tokenName}.json`)) as { jwt: string };
      await f.store.write(`${tokenName}.json`, { ...saved, jwt: 'e30.e30.Zm9yZWlnbg' });
    }
    return result;
  };
  await expect(f.run()).rejects.toThrow(/issued site-bound JWT|private JWT|private token changed/);
  expect(changed).toBe(true);
  expect(f.state.applies).toBe(0);
}, 30000);

test('last saved application-state callback cannot outlive current enrollment before apply', async () => {
  const f = await fixture(),
    original = f.session.readPlanApplicationState.bind(f.session),
    clock = Date.now,
    tokenName = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`;
  let advanced = false;
  f.session.readPlanApplicationState = async (receipt) => {
    const result = await original(receipt);
    if (!advanced) {
      advanced = true;
      const saved = (await f.store.read(`${tokenName}.json`)) as { jwt: string };
      const expiry = JSON.parse(Buffer.from(saved.jwt.split('.')[1], 'base64url').toString()).exp * 1000;
      Date.now = () => expiry - 30000;
    }
    return result;
  };
  try {
    expect((await f.run()).status).toBe('enrollment-pending');
    expect(advanced).toBe(true);
    expect(f.state.applies).toBe(0);
  } finally {
    Date.now = clock;
  }
}, 30000);

for (const mode of ['owner', 'request', 'engine', 'missing-owner'] as const)
  test(`final private enrollment read rejects changed context (${mode})`, async () => {
    const f = await fixture();
    f.state.unknownAfterRevision = true;
    expect((await f.run()).status).toBe('operational-acceptance-pending');
    const packet = (await f.store.read(`${f.input.plan.planId}-terraform-replacement-source.json`)) as {
        bootstrap: string;
        preparedCheckpoint: { bootstrapSha256: string };
      },
      tokenName = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`,
      original = f.store.read.bind(f.store);
    const runtime = {
      engine: 'terraform' as 'terraform' | 'native',
      async observeIssuedBootstrapToken(
        binding: { owner: typeof f.store.owner },
        node: string,
        name: string,
        tokenSha256: string,
      ) {
        return {
          schemaVersion: 1 as const,
          kind: 'ce-issued-bootstrap-current' as const,
          owner: binding.owner,
          node,
          tokenName: name,
          siteName: f.input.plan.siteName,
          tokenSha256,
          expiresAt: Date.now() + 3600000,
        };
      },
    };
    let reads = 0;
    f.store.read = async (name) => {
      const value = await original(name);
      if (name === `${tokenName}.json` && ++reads === (mode === 'missing-owner' ? 1 : 2)) {
        if (mode === 'engine') runtime.engine = 'native';
        else if (mode === 'request') f.input.plan.siteName = 'foreign-site';
        else f.store.owner.account = 'example-foreign';
        if (mode === 'missing-owner') throw Object.assign(Error('missing token'), { code: 'ENOENT' });
      }
      return value;
    };
    await expect(
      observeAzureTerraformNetworkReplacementEnrollment(
        f.input.plan,
        packet.bootstrap,
        packet.preparedCheckpoint.bootstrapSha256,
        f.store,
        runtime,
      ),
    ).rejects.toThrow(/context changed/);
    expect(f.state.applies).toBe(0);
  }, 30000);

test('final apply private token read rejects changed owner before mutation', async () => {
  const f = await fixture(),
    original = f.store.read.bind(f.store),
    tokenName = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`;
  let reads = 0,
    changed = false;
  f.store.read = async (name) => {
    const value = await original(name);
    if (name === `${tokenName}.json` && ++reads === 4) {
      changed = true;
      f.store.owner.account = 'example-foreign';
    }
    return value;
  };
  await expect(f.run()).rejects.toThrow();
  expect(changed).toBe(true);
  expect(f.state.applies).toBe(0);
}, 30000);

test('missing saved private enrollment stays pending without token creation or VM mutation', async () => {
  const f = await fixture();
  f.state.unknownAfterRevision = true;
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  const tokenName = `${f.input.plan.deploymentName.slice(0, 40)}-${f.selected}-${f.input.plan.planSha256.slice(0, 12)}`;
  await f.store.remove(`${tokenName}.json`);
  f.state.unknownAfterRevision = false;
  expect((await f.run()).status).toBe('enrollment-pending');
  expect(f.state.bootstraps).toBe(1);
  expect(f.state.applies).toBe(0);
}, 30000);

test('consumed launch retains historical enrollment when current token is expired', async () => {
  const f = await fixture();
  f.state.unknown = 'final';
  expect((await f.run()).status).toBe('operational-acceptance-pending');
  expect(f.state.applies).toBe(2);
  f.state.unknown = '';
  f.state.tokenMode = 'expired';
  expect((await f.run()).status).toBe('complete');
  expect(f.state.applies).toBe(2);
  expect(f.state.bootstraps).toBe(1);
}, 30000);
