import { afterEach, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import {
  compileAzureTerraformNetworkUpdatePlan,
  verifyAzureTerraformNetworkProfile,
} from '../../src/ce/terraform-network-plan';
import { terraformNetworkMainRunnerFixture as actualMainFixture } from './terraform-network-main-runner-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

async function terraformNetworkMainRunnerFixture(ha = false) {
  const original = await terraformNetworkSourceFixture(ha);
  const plan = compileAzureTerraformNetworkUpdatePlan(original.plan, original.original);
  const inventory = await captureAzureNetworkUpdateInventory(plan, original.api);
  const f = await actualMainFixture(ha, {
    plan,
    inventory,
    source: original.source,
    sources: original.sources,
    outcomes: original.outcomes,
  });
  const publicSession: SessionManagerLike = {
    getSessionId: () => `${f.store.directory}-public-plans`,
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  for (const plan of [...original.sources.values(), f.plan])
    await savePlanArtifact(publicSession, plan, original.current);
  return { ...f, publicSession };
}

import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});

import { prepareAzureTerraformNetworkMainRetirementHistory } from '../../src/ce/terraform-network-main-retirement-preparation';

for (const ha of [false, true])
  test(`immutable ${ha ? 'HA' : 'single'} main preparation retains exact original and terminal custody`, async () => {
    const f = await terraformNetworkMainRunnerFixture(ha);
    const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
    const commands = [...f.commands],
      calls = [...f.calls];
    const run = () =>
      prepareAzureTerraformNetworkMainRetirementHistory(
        original,
        f.plan,
        f.publicSession,
        f.store,
        f.service,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
      );
    const result = await run(),
      packet = await f.store.read(result.name);
    expect(result.status).toBe('prepared');
    expect(result.preparationSha256).toBe(canonicalSha256(packet));
    expect(result.originalJournalCustodyQualified).toBe(true);
    expect(result.childRetirementQualified).toBe(false);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(JSON.stringify(packet)).not.toContain(f.graph.original.binding.source);
    expect(await run()).toEqual(result);
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
  }, 180000);
for (const fault of [
  'foreign-original',
  'foreign-owner',
  'private-directory',
  'missing-main',
  'retired-main',
  'missing-terminal',
  'changing-history',
  'changing-input',
  'changed-preparation',
  'ignored-loader',
  'pre-aborted',
] as const)
  test(`main preparation rejects ${fault} without granting cleanup or fabricating custody`, async () => {
    const f = await terraformNetworkMainRunnerFixture();
    const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
    const name = `azure-network-main-retirement-${f.plan.planSha256.slice(0, 24)}.json`;
    let writes = 0,
      opens = 0;
    const write = f.store.write,
      open = f.service.open;
    f.store.write = async (...args) => {
      writes++;
      return write.apply(f.store, args);
    };
    f.service.open = async (...args) => {
      opens++;
      return open(...args);
    };
    const terminals = new Set<string>();
    for (const key of Object.keys(f.graph.checkpoint.completionSha256ByName)) {
      const row = (await f.store.read(key)) as { receipt: { planSha256: string } };
      terminals.add(row.receipt.planSha256);
    }
    if (fault === 'foreign-original') original.siteName = 'foreign';
    if (fault === 'foreign-owner') f.store.owner.deploymentId = 'foreign';
    if (fault === 'private-directory') await chmod(f.store.directory, 0o755);
    if (fault === 'missing-main') await rm(f.runnerDirectory, { recursive: true });
    if (fault === 'retired-main') {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(f.runnerDirectory, 'artifact-retirement.json'), '{}', { mode: 0o600 });
    }
    if (fault === 'changed-preparation') await write.call(f.store, name, { schemaVersion: 1, scope: 'foreign' });
    if (['missing-terminal', 'changing-history', 'changing-input'].includes(fault)) {
      const tracked = f.service.open;
      let inspected = 0;
      f.service.open = async (...args) => {
        const session = await tracked(...args);
        const read = session.readPlanApplicationHistory;
        if (!read) throw Error('actual main history reader missing');
        session.readPlanApplicationHistory = async (receipt, signal) => {
          const result = await read.call(session, receipt, signal);
          if (fault === 'missing-terminal' && terminals.has(receipt.planSha256)) result.matches = [];
          if (fault === 'changing-history' && ++inspected > 1) result.incompleteArchives++;
          if (fault === 'changing-input') original.siteName = 'foreign';
          return result;
        };
        return session;
      };
    }
    if (fault === 'ignored-loader') f.loaders.loadSource = () => new Promise(() => {});
    const controller = new AbortController();
    if (fault === 'pre-aborted') controller.abort(Error('synthetic preparation abort'));
    const signal = fault === 'ignored-loader' ? AbortSignal.timeout(25) : controller.signal;
    const commands = [...f.commands],
      calls = [...f.calls],
      start = Date.now();
    await expect(
      prepareAzureTerraformNetworkMainRetirementHistory(
        original,
        f.plan,
        f.publicSession,
        f.store,
        f.service,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
        signal,
      ),
    ).rejects.toThrow();
    expect(writes).toBe(0);
    expect(f.commands).toEqual(commands);
    expect(f.calls).toEqual(calls);
    if (fault === 'ignored-loader' || fault === 'pre-aborted') {
      expect(Date.now() - start).toBeLessThan(1000);
      expect(opens).toBe(0);
    }
  }, 120000);
test('exact preparation resumes response loss without repeating its publication', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
  const write = f.store.write;
  let writes = 0;
  f.store.write = async (...args) => {
    writes++;
    await write.apply(f.store, args);
    throw Error('synthetic preparation response lost');
  };
  const run = () =>
    prepareAzureTerraformNetworkMainRetirementHistory(
      original,
      f.plan,
      f.publicSession,
      f.store,
      f.service,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    );
  await expect(run()).rejects.toThrow('response lost');
  f.store.write = async (...args) => {
    writes++;
    return write.apply(f.store, args);
  };
  const result = await run();
  expect(result.status).toBe('prepared');
  expect(writes).toBe(1);
  expect(result.preparationSha256).toBe(canonicalSha256(await f.store.read(result.name)));
}, 180000);

test('main preparation rejects public inventory changed during actual main history inspection', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
  const open = f.service.open;
  let changed = false;
  f.service.open = async (...args) => {
    const session = await open(...args),
      read = session.readPlanApplicationHistory;
    if (!read) throw Error('Actual main journal reader missing');
    session.readPlanApplicationHistory = async (...input) => {
      const result = await read.apply(session, input);
      if (!changed) {
        changed = true;
        await savePlanArtifact(f.publicSession, successor(f.plan, original), (await import('./fixtures')).observation);
      }
      return result;
    };
    return session;
  };
  await expect(
    prepareAzureTerraformNetworkMainRetirementHistory(
      original,
      f.plan,
      f.publicSession,
      f.store,
      f.service,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow(/inventory changed/);
}, 180000);

function successor(
  plan: Parameters<typeof compileAzureTerraformNetworkUpdatePlan>[0],
  original: Parameters<typeof compileAzureTerraformNetworkUpdatePlan>[0],
) {
  const { planId: _id, planSha256: _sha, terraformNetworkProfile: _profile, ...draft } = structuredClone(plan);
  const sha = canonicalSha256(draft);
  return compileAzureTerraformNetworkUpdatePlan(
    { ...draft, planId: `azure-ce-${sha.slice(0, 24)}`, planSha256: sha },
    plan,
    original,
  );
}
test('selected main preparation retains an unstaged successor without granting its execution or cleanup', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
  const next = successor(f.plan, original);
  await savePlanArtifact(f.publicSession, next, (await import('./fixtures')).observation);
  const result = await prepareAzureTerraformNetworkMainRetirementHistory(
    original,
    f.plan,
    f.publicSession,
    f.store,
    f.service,
    f.loaders,
    f.site,
    f.dependencies.qualifyAcceptance,
  );
  const packet = (await f.store.read(result.name)) as {
    publicRequestInventory: {
      requests: Array<{ planSha256: string; execution: string }>;
      executionHistoryQualified: boolean;
    };
  };
  expect(packet.publicRequestInventory.requests.map((row) => row.planSha256).sort()).toEqual(
    [f.plan.planSha256, next.planSha256].sort(),
  );
  expect(packet.publicRequestInventory.requests.every((row) => row.execution === 'unclassified')).toBe(true);
  expect(packet.publicRequestInventory.executionHistoryQualified).toBe(false);
  expect(result.otherRequestExecutionHistoriesQualified).toBe(false);
  expect(result.parentRetirementQualified).toBe(false);
}, 180000);
test('main preparation rejects a missing selected public plan before runner inspection', async () => {
  const f = await terraformNetworkMainRunnerFixture();
  const original = await f.loaders.loadSource(verifyAzureTerraformNetworkProfile(f.plan).originalPlanSha256);
  const empty: SessionManagerLike = {
    getSessionId: () => `${f.store.directory}-incomplete-plans`,
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  await savePlanArtifact(empty, original, (await import('./fixtures')).observation);
  let opens = 0;
  const open = f.service.open;
  f.service.open = async (...args) => {
    opens++;
    return open(...args);
  };
  await expect(
    prepareAzureTerraformNetworkMainRetirementHistory(
      original,
      f.plan,
      empty,
      f.store,
      f.service,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow(/selected network request missing/);
  expect(opens).toBe(0);
}, 180000);
