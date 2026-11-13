import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { AzureNativeTeardownPlan } from '../../src/ce/native-teardown';
import { prepareAzureNativeUpgrade, runAzureNativeUpgrade } from '../../src/ce/native-upgrade';
import { verifyAzureNativeUpgradeHistoricalArtifacts } from '../../src/ce/native-upgrade-artifact-provenance';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';
import { nativeUpgradeTestContract, nativeUpgradeTestObservation } from './native-upgrade-fixture';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const contract = nativeUpgradeTestContract;
const observed = nativeUpgradeTestObservation;

async function setup(states: Array<'ready' | 'converging' | 'complete'>) {
  const plan = compileAzureCePlan(intent, observation);
  const binding = azureUpgradeBinding(plan);
  const target = 'crt-20260201-0179';
  const upgrade = await prepareAzureNativeUpgrade(
    plan,
    { kind: 'software', version: target },
    { observeUpgrade: async () => observed(binding, target, 'ready') },
    contract,
  );
  const path = await mkdtemp(join(tmpdir(), 'azure-native-upgrade-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let index = 0;
  let submissions = 0;
  let loseResponse = false;
  const runtime = {
    engine: 'native' as const,
    async observeUpgrade() {
      return observed(binding, target, states[Math.min(index++, states.length - 1)]);
    },
    async submitUpgrade(
      _binding: SiteBinding,
      _contract: VerifiedUpgradeContract,
      _target: unknown,
      _siteUid: string,
      boundary: () => Promise<void>,
    ) {
      await boundary();
      submissions++;
      if (loseResponse) throw new Error('response lost');
      return { status: 'submitted' as const } as never;
    },
  } as Pick<CeRuntime, 'engine' | 'observeUpgrade' | 'submitUpgrade'>;
  return {
    plan,
    upgrade,
    runtime,
    storage,
    submissions: () => submissions,
    loseResponse: () => {
      loseResponse = true;
    },
    restoreResponse: () => {
      loseResponse = false;
    },
  };
}

test('runs and idempotently verifies an Azure native upgrade', async () => {
  const f = await setup(['ready', 'complete', 'complete']);
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});

test('reconciles an ambiguous Azure native submission without replay', async () => {
  const f = await setup(['ready', 'converging', 'complete']);
  f.loseResponse();
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-submission-unconfirmed');
  f.restoreResponse();
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-converging');
  expect(
    (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
  ).toBe('upgrade-complete');
  expect(f.submissions()).toBe(1);
});

for (const point of ['receipt', 'checkpoint', 'serial'] as const) {
  for (const afterWrite of [false, true]) {
    test(`native completion publication resumes ${point} ${afterWrite ? 'after' : 'before'} durable write`, async () => {
      const f = await setup(['ready', 'complete', 'complete']);
      const write = f.storage.write.bind(f.storage);
      let interrupted = false;
      f.storage.write = async (name, value) => {
        const row = value as Record<string, unknown>;
        const selected =
          point === 'receipt'
            ? name.endsWith('-receipt.json')
            : point === 'checkpoint'
              ? name.endsWith('-checkpoint.json') && row.phase === 'complete'
              : name === 'native-ce-upgrade-serial.json' && row.lastPlanId === f.upgrade.planId;
        if (!selected || interrupted) return write(name, value);
        interrupted = true;
        if (afterWrite) await write(name, value);
        throw Error('completion publication interrupted');
      };
      await expect(
        runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage),
      ).rejects.toThrow('completion publication interrupted');
      f.storage.write = write;
      const receiptBefore = await f.storage.read(`${f.upgrade.planId}-receipt.json`).catch(() => undefined);
      expect(
        (await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage)).status,
      ).toBe('upgrade-complete');
      expect(f.submissions()).toBe(1);
      if (receiptBefore) expect(await f.storage.read(`${f.upgrade.planId}-receipt.json`)).toEqual(receiptBefore);
      const serial = await f.storage.read('native-ce-upgrade-serial.json');
      expect(serial).toEqual({
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: f.upgrade.planId,
        lastPlanSha256: f.upgrade.planSha256,
      });
      expect(((await f.storage.read(`${f.upgrade.planId}-checkpoint.json`)) as Record<string, unknown>).phase).toBe(
        'complete',
      );
    });
  }
}

for (const point of ['initial', 'completion'] as const) {
  test(`ignored observer cancellation cannot publish native ${point}`, async () => {
    const f = await setup(['ready', 'complete']);
    const controller = new AbortController();
    const observe = f.runtime.observeUpgrade.bind(f.runtime);
    let calls = 0;
    f.runtime.observeUpgrade = async (...args) => {
      const value = await observe(...args);
      if (++calls === (point === 'initial' ? 1 : 2)) controller.abort(Error('cancelled observation'));
      return value;
    };
    await expect(
      runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage, controller.signal),
    ).rejects.toThrow('cancelled observation');
    expect(f.submissions()).toBe(point === 'initial' ? 0 : 1);
    const checkpoint = (await f.storage.read(`${f.upgrade.planId}-checkpoint.json`)) as Record<string, unknown>;
    expect(checkpoint.phase).toBe(point === 'initial' ? 'ready' : 'submitted');
  });
}

for (const corruption of ['future', 'malformed', 'secret', 'serial', 'checkpoint'] as const) {
  test(`native completed history rejects ${corruption}`, async () => {
    const f = await setup(['ready', 'complete', 'complete']);
    await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage);
    const name =
      corruption === 'serial'
        ? 'native-ce-upgrade-serial.json'
        : corruption === 'checkpoint'
          ? `${f.upgrade.planId}-checkpoint.json`
          : `${f.upgrade.planId}-receipt.json`;
    const value = (await f.storage.read(name)) as Record<string, unknown>;
    if (corruption === 'future') value.observedAt = new Date(Date.now() + 60000).toISOString();
    else if (corruption === 'malformed') value.observedAt = 'not-a-date';
    else if (corruption === 'secret' || corruption === 'checkpoint') value.token = 'synthetic-secret';
    else {
      value.lastPlanId = 'foreign-upgrade';
      value.lastPlanSha256 = 'f'.repeat(64);
    }
    await f.storage.write(name, value);
    await expect(
      runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage),
    ).rejects.toThrow();
    expect(f.submissions()).toBe(1);
  });
}

for (const phase of ['prepared', 'authorized', 'ready', 'submitted', 'receipt-first', 'complete'] as const) {
  test(`qualifies real native upgrade history ${phase}`, async () => {
    const f = await setup(['ready', 'complete']);
    const records = new Map<string, unknown>([[`${f.upgrade.planId}.json`, f.upgrade]]);
    if (phase !== 'prepared')
      records.set(`${f.upgrade.planId}-authorization.json`, {
        schemaVersion: 2,
        engine: 'native',
        sourcePlanSha256: f.plan.planSha256,
        upgradePlanSha256: f.upgrade.planSha256,
        mutations: true,
      });
    if (!['prepared', 'authorized'].includes(phase)) {
      await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage);
      for (const name of [
        `${f.upgrade.planId}-checkpoint.json`,
        `${f.upgrade.planId}-receipt.json`,
        'native-ce-upgrade-serial.json',
      ])
        records.set(name, await f.storage.read(name));
      const checkpoint = records.get(`${f.upgrade.planId}-checkpoint.json`) as Record<string, unknown>;
      if (phase !== 'complete') {
        checkpoint.phase = phase === 'ready' ? 'ready' : 'submitted';
        records.set('native-ce-upgrade-serial.json', {
          schemaVersion: 1,
          engine: 'native',
          status: 'active',
          activePlanId: f.upgrade.planId,
          activePlanSha256: f.upgrade.planSha256,
        });
        if (phase !== 'receipt-first') records.delete(`${f.upgrade.planId}-receipt.json`);
      }
    }
    const teardown = {
      retirement: [{ siteUid: f.upgrade.expectation.siteUid, physicalSiteUid: f.upgrade.expectation.physicalSiteUid }],
      drain: { siteContractFingerprint: f.upgrade.expectation.siteContractFingerprint },
    } as AzureNativeTeardownPlan;
    expect(() => verifyAzureNativeUpgradeHistoricalArtifacts(f.plan, teardown, contract, records)).not.toThrow();
  });
}

for (const corruption of [
  'missing-contract',
  'missing-source',
  'foreign-site',
  'foreign-physical',
  'missing-auth',
  'foreign-auth',
  'missing-checkpoint',
  'missing-receipt',
  'missing-serial',
  'foreign-serial',
  'secret-receipt',
  'future',
  'missing-state',
  'orphan',
  'receipt-ready',
] as const) {
  test(`upgrade retirement provenance rejects ${corruption}`, async () => {
    const f = await setup(['ready', 'complete']);
    await runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage);
    const records = new Map<string, unknown>();
    for (const name of [
      `${f.upgrade.planId}.json`,
      `${f.upgrade.planId}-checkpoint.json`,
      `${f.upgrade.planId}-receipt.json`,
      'native-ce-upgrade-serial.json',
    ])
      records.set(name, await f.storage.read(name));
    const auth = {
      schemaVersion: 2,
      engine: 'native',
      sourcePlanSha256: f.plan.planSha256,
      upgradePlanSha256: f.upgrade.planSha256,
      mutations: true,
    };
    records.set(`${f.upgrade.planId}-authorization.json`, auth);
    const teardown = {
      retirement: [{ siteUid: f.upgrade.expectation.siteUid, physicalSiteUid: f.upgrade.expectation.physicalSiteUid }],
      drain: { siteContractFingerprint: f.upgrade.expectation.siteContractFingerprint },
    } as AzureNativeTeardownPlan;
    if (corruption === 'missing-source') records.delete(`${f.upgrade.planId}.json`);
    if (corruption === 'foreign-site') teardown.retirement[0].siteUid = 'foreign';
    if (corruption === 'foreign-physical') teardown.retirement[0].physicalSiteUid = 'foreign';
    if (corruption === 'missing-auth') records.delete(`${f.upgrade.planId}-authorization.json`);
    if (corruption === 'foreign-auth') auth.sourcePlanSha256 = 'f'.repeat(64);
    if (corruption === 'missing-checkpoint') records.delete(`${f.upgrade.planId}-checkpoint.json`);
    if (corruption === 'missing-receipt') records.delete(`${f.upgrade.planId}-receipt.json`);
    if (corruption === 'missing-serial') records.delete('native-ce-upgrade-serial.json');
    if (corruption === 'foreign-serial')
      (records.get('native-ce-upgrade-serial.json') as Record<string, unknown>).lastPlanSha256 = 'f'.repeat(64);
    if (corruption === 'secret-receipt')
      (records.get(`${f.upgrade.planId}-receipt.json`) as Record<string, unknown>).token = 'synthetic-secret';
    if (corruption === 'future')
      (records.get(`${f.upgrade.planId}-receipt.json`) as Record<string, unknown>).observedAt = new Date(
        Date.now() + 60000,
      ).toISOString();
    if (corruption === 'missing-state')
      delete (records.get(`${f.upgrade.planId}-checkpoint.json`) as Record<string, unknown>).phase;
    if (corruption === 'orphan')
      records.set(
        `azure-ce-native-upgrade-${'f'.repeat(24)}-receipt.json`,
        records.get(`${f.upgrade.planId}-receipt.json`),
      );
    if (corruption === 'receipt-ready')
      (records.get(`${f.upgrade.planId}-checkpoint.json`) as Record<string, unknown>).phase = 'ready';
    expect(() =>
      verifyAzureNativeUpgradeHistoricalArtifacts(
        f.plan,
        teardown,
        corruption === 'missing-contract' ? undefined : contract,
        records,
      ),
    ).toThrow();
  });
}

test('native submission cannot complete without its durable boundary', async () => {
  const f = await setup(['ready', 'complete']);
  f.runtime.submitUpgrade = async () => ({ status: 'submitted' }) as never;
  await expect(
    runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage),
  ).rejects.toThrow('submission boundary missing');
  expect(((await f.storage.read(`${f.upgrade.planId}-checkpoint.json`)) as Record<string, unknown>).phase).toBe(
    'ready',
  );
  await expect(f.storage.read(`${f.upgrade.planId}-receipt.json`)).rejects.toThrow();
});

test('terminal native lifecycle blocks upgrade before observing or staging', async () => {
  const f = await setup(['ready', 'complete']);
  await f.storage.write('azure-native-lifecycle-retirement.json', { schemaVersion: 1, engine: 'native' });
  f.runtime.observeUpgrade = async () => {
    throw Error('must not observe retired deployment');
  };
  await expect(
    runAzureNativeUpgrade(f.plan, f.upgrade, f.upgrade.planSha256, f.runtime, contract, f.storage),
  ).rejects.toThrow('lifecycle is retired');
  expect(f.submissions()).toBe(0);
  await expect(f.storage.read(`${f.upgrade.planId}.json`)).rejects.toThrow();
});
