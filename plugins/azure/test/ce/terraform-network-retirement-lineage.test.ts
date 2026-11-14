import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { readAzureTerraformNetworkMainRunnerHistory } from '../../src/ce/terraform-network-main-runner-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  readAzureTerraformNetworkRetirementLineage,
  recheckAzureTerraformNetworkRetirementLineage,
} from '../../src/ce/terraform-network-retirement-lineage';
import { test } from './owned-fixture-test';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';

import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

async function fixture() {
  const birth = await terraformNetworkSourceFixture(false);
  const plan = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
  const sources = new Map(birth.sources);
  sources.set(plan.planSha256, plan);
  const seed = {
    plan,
    inventory: await captureAzureNetworkUpdateInventory(plan, birth.api),
    source: birth.source,
    sources,
    outcomes: birth.outcomes,
  };
  const firstDriver = await terraformNetworkSerialPowerFixture(
    false,
    async (request) => evidence(request, '1.17.1'),
    seed,
  );
  const first = await terraformNetworkMainRunnerFixture(false, seed, firstDriver);
  const completed = await readAzureTerraformNetworkCompletionHistory(
    plan,
    first.store,
    first.loaders,
    first.dependencies.qualifyAcceptance,
  );
  const next = compileAzureTerraformNetworkUpdatePlan(
    compileAzureCePlan({ ...birth.original.intent, operation: 'update-network' }, birth.current),
    plan,
    birth.original,
  );
  sources.set(next.planSha256, next);
  const inventory = structuredClone(completed.inventory);
  inventory.planSha256 = next.planSha256;
  for (const vm of Object.values(inventory.nodes))
    for (const [i, nic] of Object.entries(vm.nics)) {
      const desired = next.nics[Number(i)].subnet;
      nic.targetSubnetId = `${birth.vnet.id}/subnets/${desired.name}`;
      nic.targetSubnetCidr = desired.cidr as string;
    }
  const nextSeed = { ...seed, plan: next, inventory, source: completed.finalSource, store: first.store };
  const secondDriver = await terraformNetworkSerialPowerFixture(
    false,
    async (request) => evidence(request, '1.17.1'),
    nextSeed,
  );
  const second = await terraformNetworkMainRunnerFixture(false, nextSeed, secondDriver, true, first);
  const future = compileAzureTerraformNetworkUpdatePlan(birth.plan, next, birth.original);
  sources.set(future.planSha256, future);
  first.loaders.loadOutcome = async (request) => {
    const outcome = birth.outcomes.get(request.planSha256);
    if (outcome === undefined) throw Object.assign(Error('explicit synthetic outcome absence'), { code: 'ENOENT' });
    return outcome;
  };
  const publicSession: SessionManagerLike = {
    getSessionId: () => `${first.store.directory}-lineage-public`,
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  for (const p of [birth.original, plan, next, future]) await savePlanArtifact(publicSession, p, birth.current);
  const read = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementLineage(
      birth.original,
      publicSession,
      first.store,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      signal,
    );
  const recheck = (witness: unknown, signal?: AbortSignal) =>
    recheckAzureTerraformNetworkRetirementLineage(
      witness,
      plan,
      first.store,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      signal,
    );
  const main = (witness?: unknown) =>
    readAzureTerraformNetworkMainRunnerHistory(
      plan,
      first.store,
      second.service,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      undefined,
      undefined,
      witness,
    );
  return { birth, first, second, plan, next, future, sources, publicSession, read, recheck, main };
}
test('lineage joins two actual main generations and retains an unqualified unstaged request', async () => {
  const f = await fixture();
  await expect(f.main()).rejects.toThrow('outside original graph');
  const commands = [...f.first.commands],
    actions = [...f.first.vmPowerActions, ...f.second.vmPowerActions];
  const witness = await f.read();
  expect(
    witness.rows
      .filter((row) => row.execution === 'staged-network')
      .map((row) => row.planSha256)
      .sort(),
  ).toEqual([f.plan.planSha256, f.next.planSha256].sort());
  expect(witness.rows.find((row) => row.planSha256 === f.future.planSha256)?.execution).toBe('unstaged-no-outcome');
  expect(witness.unstagedMainJournalAbsenceQualified).toBe(false);
  expect(witness.allPublicExecutionGraphsQualified).toBe(false);
  const history = await f.main(witness);
  expect(history.lineageSha256).toBe(canonicalSha256(witness));
  expect(history.originalPublishedJournalsQualified).toBe(true);
  expect(history.terminalPublishedJournalsQualified).toBe(true);
  expect(history.parentRetirementQualified).toBe(false);
  expect(history.retirementQualified).toBe(false);
  expect(f.first.commands).toEqual(commands);
  expect([...f.first.vmPowerActions, ...f.second.vmPowerActions]).toEqual(actions);
}, 180000);
for (const fault of [
  'serialized',
  'mutated',
  'foreign-context',
  'late-public-plan',
  'late-planned-packet',
  'missing-earlier-packet',
  'ignored-loader',
  'pre-aborted',
  'foreign-current-configuration',
] as const)
  test(`lineage rejects ${fault} without granting main custody`, async () => {
    const f = await fixture();
    const witness = await f.read();
    if (fault === 'serialized') await expect(f.main(structuredClone(witness))).rejects.toThrow('authenticated lineage');
    if (fault === 'mutated') {
      witness.configurationSha256s.push('a'.repeat(64));
      await expect(f.main(witness)).rejects.toThrow();
    }
    if (fault === 'foreign-context')
      await expect(
        recheckAzureTerraformNetworkRetirementLineage(
          witness,
          f.plan,
          f.first.store,
          { ...f.first.loaders },
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
        ),
      ).rejects.toThrow();
    if (fault === 'late-public-plan') {
      const extra = compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.future, f.birth.original);
      await savePlanArtifact(f.publicSession, extra, f.birth.current);
      await expect(f.main(witness)).rejects.toThrow();
    }
    if (fault === 'late-planned-packet') {
      await f.first.store.write(`${f.future.planId}-terraform-network-driver-checkpoint.json`, {});
      await expect(f.recheck(witness)).rejects.toThrow();
    }
    if (fault === 'missing-earlier-packet') {
      await f.first.store.remove(`${f.plan.planId}-terraform-network-node-1-preflight.json`);
      await expect(f.recheck(witness)).rejects.toThrow();
    }
    if (fault === 'ignored-loader') {
      const loaders = { ...f.first.loaders, loadSource: async () => new Promise<never>(() => {}) };
      const start = performance.now();
      await expect(
        readAzureTerraformNetworkRetirementLineage(
          f.birth.original,
          f.publicSession,
          f.first.store,
          loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          AbortSignal.timeout(20),
        ),
      ).rejects.toThrow();
      expect(performance.now() - start).toBeLessThan(1000);
    }
    if (fault === 'pre-aborted') await expect(f.read(AbortSignal.abort())).rejects.toThrow();
    if (fault === 'foreign-current-configuration') {
      const configuration = JSON.parse(await readFile(join(f.second.runnerDirectory, 'main.tf.json'), 'utf8'));
      configuration.locals = { ...configuration.locals, synthetic_unbound_lineage: true };
      await f.first.runner.reviseConfiguration(
        await f.first.runner.readConfigurationSha256(),
        JSON.stringify(configuration),
      );
      await expect(f.main(witness)).rejects.toThrow('outside original graph');
    }
    expect(witness.parentRetirementQualified).toBe(false);
  }, 180000);
test('unstaged outcomes preserve service failure, malformed evidence and an unresolved published outcome', async () => {
  const f = await fixture();
  const originalLoader = f.first.loaders.loadOutcome;
  f.first.loaders.loadOutcome = async (request) =>
    request.planSha256 === f.future.planSha256 ? (undefined as never) : originalLoader(request);
  await expect(f.read()).rejects.toThrow('complete outcome object or explicit absence');
  f.first.loaders.loadOutcome = async (request) => {
    if (request.planSha256 === f.future.planSha256) throw Error('synthetic service unauthorized');
    return originalLoader(request);
  };
  await expect(f.read()).rejects.toThrow('synthetic service unauthorized');
  f.first.loaders.loadOutcome = async (request) =>
    request.planSha256 === f.future.planSha256 ? { status: 'failed' } : originalLoader(request);
  const witness = await f.read();
  expect(witness.rows.find((row) => row.planSha256 === f.future.planSha256)?.execution).toBe(
    'unstaged-outcome-present',
  );
  expect(witness.allPublicExecutionGraphsQualified).toBe(false);
  expect(witness.unstagedMainJournalAbsenceQualified).toBe(false);
  expect(witness.parentRetirementQualified).toBe(false);
}, 180000);
function evidence(request: CleanupRequest, version: string): IndependentCleanupEvidence {
  return {
    schemaVersion: 1,
    status: 'independently-verified',
    nonce: request.nonce,
    requestSha256: hash(encode(request)),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    executorPid: process.pid + 1,
    parentPid: process.pid,
    manifestSha256: request.manifestSha256,
    evidenceSha256: request.evidenceSha256,
    finalPlanSha256: request.finalPlanSha256,
    planReceiptSha256: request.planReceiptSha256,
    inputInventorySha256: hash(encode(request.inputs)),
    terraformExecutableSha256: request.terraform.sha256,
    terraformExecutablePathSha256: hash(request.terraform.path),
    interpreterSha256: request.interpreter.sha256,
    workerSha256: request.workerSha256,
    terraformVersion: version,
    stateJsonSha256: 'a'.repeat(64),
    originalPlanJsonSha256: 'b'.repeat(64),
    refreshedPlanSha256: 'c'.repeat(64),
    refreshedPlanJsonSha256: 'd'.repeat(64),
    commands: [
      ['version', '-json'],
      ['show', '-json', 'saved.tfplan'],
      ['show', '-json'],
      [
        'plan',
        '-input=false',
        '-lock=true',
        '-lock-timeout=60s',
        '-refresh=true',
        `-out=independent-cleanup-${request.nonce}.tfplan`,
      ],
      ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
    ],
  };
}

test('authenticated lineage recheck returns isolated lineage and graph snapshots', async () => {
  const f = await fixture();
  const witness = await f.read(),
    digest = canonicalSha256(witness);
  const snapshot = await f.recheck(witness);
  snapshot.lineage.configurationSha256s.push('e'.repeat(64));
  expect(canonicalSha256(witness)).toBe(digest);
  snapshot.graph.nodes[0].node = 99;
  const again = await f.recheck(witness);
  expect(again.graph.nodes[0].node).toBe(1);
  expect(again.lineage.configurationSha256s).not.toContain('e'.repeat(64));
  expect(again.graph).not.toBe(snapshot.graph);
}, 180000);
test('shared main fixture appendPlan selects the exact requested successor receipt', async () => {
  const f = await fixture();
  const receipt = structuredClone(f.second.original[f.second.original.length - 1]);
  receipt.planSha256 = f.first.hash('499');
  expect(await f.second.appendPlan(receipt)).toEqual(receipt);
}, 180000);
test('main custody rejects transient caller injection of a foreign configuration hash', async () => {
  {
    const f = await fixture();
    const configuration = JSON.parse(await readFile(join(f.second.runnerDirectory, 'main.tf.json'), 'utf8'));
    configuration.locals = { ...configuration.locals, synthetic_foreign_lineage: true };
    const foreign = JSON.stringify(configuration),
      foreignHash = f.first.hash(foreign);
    await f.first.runner.reviseConfiguration(await f.first.runner.readConfigurationSha256(), foreign);
    const receipt = structuredClone(f.second.original[f.second.original.length - 1]);
    receipt.configurationSha256 = foreignHash;
    receipt.planSha256 = f.first.hash('499');
    expect(await f.first.appendPlan(receipt)).toEqual(receipt);
    const witness = await f.read(),
      digest = canonicalSha256(witness),
      list = [...witness.configurationSha256s];
    const open = f.second.service.open;
    let injected = 0;
    f.second.service.open = async (...args) => {
      const session = await open(...args),
        readConfig = session.readConfigurationSha256,
        readCurrent = session.readCurrentPlanJournal;
      if (!readConfig || !readCurrent) throw Error('actual fixture journal readers missing');
      session.readConfigurationSha256 = async () => {
        const value = await readConfig.call(session);
        witness.configurationSha256s.push(foreignHash);
        injected++;
        return value;
      };
      session.readCurrentPlanJournal = async (...args) => {
        witness.configurationSha256s.splice(0, witness.configurationSha256s.length, ...list);
        return readCurrent.apply(session, args);
      };
      return session;
    };
    try {
      await expect(f.main(witness)).rejects.toThrow('outside original graph');
    } finally {
      witness.configurationSha256s.splice(0, witness.configurationSha256s.length, ...list);
    }
    expect(injected).toBeGreaterThan(0);
    expect(canonicalSha256(witness)).toBe(digest);
  }
}, 180000);
