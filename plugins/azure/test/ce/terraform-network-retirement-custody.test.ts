import { afterEach, expect, test } from 'bun:test';
import { chmod, rm, writeFile } from 'node:fs/promises';
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
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { prepareAzureTerraformNetworkRetirementCustody } from '../../src/ce/terraform-network-retirement-custody';
import type { AzureCePlan } from '../../src/ce/types';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false, mode: 'completed' | 'source-only' | 'delayed-child' = 'completed') {
  const source = await terraformNetworkSourceFixture(ha);
  const plan = compileAzureTerraformNetworkUpdatePlan(source.plan, source.original);
  const seed = {
    plan,
    inventory: await captureAzureNetworkUpdateInventory(plan, source.api),
    source: source.source,
    sources: source.sources,
    outcomes: source.outcomes,
  };
  const driver = await terraformNetworkSerialPowerFixture(
    ha,
    mode === 'delayed-child'
      ? async () => {
          throw Error('synthetic independent child cleanup delayed');
        }
      : async (request) => evidence(request, '1.16.5'),
    seed,
  );
  if (mode === 'source-only') {
    driver.state.unknown = true;
    await driver.run();
  }
  if (mode === 'delayed-child')
    await expect(driver.run()).rejects.toThrow('synthetic independent child cleanup delayed');
  const f = await terraformNetworkMainRunnerFixture(ha, seed, driver, mode === 'completed');
  const publicSession: SessionManagerLike = {
    getSessionId: () => `${f.store.directory}-custody-public`,
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  await savePlanArtifact(publicSession, source.original, source.current);
  await savePlanArtifact(publicSession, plan, source.current);
  return {
    ...f,
    publicSession,
    originalPlan: source.original,
    observation: source.current,
    prepare: (signal?: AbortSignal) =>
      prepareAzureTerraformNetworkRetirementCustody(
        source.original,
        plan,
        publicSession,
        f.store,
        f.service,
        f.loaders,
        f.site,
        f.dependencies.qualifyAcceptance,
        signal,
      ),
  };
}
function successor(plan: AzureCePlan, original: AzureCePlan) {
  const { planId: _id, planSha256: _sha, terraformNetworkProfile: _profile, ...draft } = structuredClone(plan);
  const sha = canonicalSha256(draft);
  return compileAzureTerraformNetworkUpdatePlan(
    { ...draft, planId: `azure-ce-${sha.slice(0, 24)}`, planSha256: sha },
    plan,
    original,
  );
}
for (const ha of [false, true])
  test(`paired ${ha ? 'HA six-child' : 'single two-child'} custody retains exact independent retired proofs without commands`, async () => {
    const f = await fixture(ha),
      commands = [...f.commands],
      powerCommands = [...f.powerCommands],
      actions = [...f.vmPowerActions];
    const start = performance.now(),
      result = await f.prepare(),
      elapsed = performance.now() - start;
    const packet = (await f.store.read(result.name)) as {
      history: {
        main: { graphSha256: string };
        power: { graphSha256: string; rows: Array<{ status: string; retirement?: unknown }> };
      };
    };
    expect(result.preparationSha256).toBe(canonicalSha256(packet));
    expect(elapsed).toBeLessThanOrEqual(180000);
    expect(packet.history.main.graphSha256).toBe(packet.history.power.graphSha256);
    expect(packet.history.power.rows).toHaveLength(ha ? 6 : 2);
    expect(packet.history.power.rows.every((row) => row.status === 'retired' && row.retirement)).toBe(true);
    expect(result.selectedMainPublishedJournalsQualified).toBe(true);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(JSON.stringify(packet)).not.toContain(JSON.stringify(f.graph.original.binding.source).slice(1, -1));
    expect(f.commands).toEqual(commands);
    expect(f.powerCommands).toEqual(powerCommands);
    expect(f.vmPowerActions).toEqual(actions);
  }, 300000);
for (const mode of ['source-only', 'delayed-child'] as const)
  test(`paired custody preserves actual ${mode} states without completion or retirement admission`, async () => {
    const f = await fixture(false, mode),
      commands = [...f.commands],
      powerCommands = [...f.powerCommands];
    const result = await f.prepare();
    expect(result.selectedMainPublishedJournalsQualified).toBe(false);
    if (mode === 'source-only') {
      expect(result.selectedPowerRows).toEqual([]);
      expect(f.vmPowerActions).toEqual([]);
    } else expect(result.selectedPowerRows.some((row) => row.status === 'inspected')).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.childRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(f.powerCommands).toEqual(powerCommands);
  }, 180000);
test('paired custody retains uninspected public successor as unresolved work', async () => {
  const f = await fixture();
  const next = successor(f.plan, f.originalPlan);
  await savePlanArtifact(f.publicSession, next, f.observation);
  const result = await f.prepare();
  expect(result.uninspectedRequestPlanSha256s).toEqual([next.planSha256]);
  expect(result.otherRequestExecutionHistoriesQualified).toBe(false);
  expect(result.parentRetirementQualified).toBe(false);
}, 180000);
for (const fault of [
  'foreign-owner',
  'public-directory',
  'changed-preparation',
  'changed-public-plans',
  'ignored-source-loader',
  'pre-aborted',
  'main-journal-during-power',
  'power-marker-during-second-main',
] as const)
  test(`paired custody rejects ${fault} before new preparation publication`, async () => {
    const f = await fixture();
    let writes = 0;
    const write = f.store.write;
    const name = `azure-network-custody-${f.plan.planSha256.slice(0, 24)}.json`;
    if (fault === 'changed-preparation') await f.store.write(name, { synthetic: 'foreign' });
    if (fault === 'foreign-owner') f.store.owner.deploymentId = 'foreign';
    if (fault === 'public-directory') await chmod(f.store.directory, 0o755);
    if (fault === 'ignored-source-loader') f.loaders.loadSource = () => new Promise(() => {});
    if (fault === 'changed-public-plans') {
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
            await savePlanArtifact(f.publicSession, successor(f.plan, f.originalPlan), f.observation);
          }
          return result;
        };
        return session;
      };
    }
    if (fault === 'main-journal-during-power' || fault === 'power-marker-during-second-main') {
      const open = f.service.open;
      let mainOpens = 0,
        changed = false;
      f.service.open = async (...args) => {
        const session = await open(...args);
        if (!args[1].stage) mainOpens++;
        if (!changed && (fault === 'main-journal-during-power' ? !!args[1].stage : mainOpens === 2)) {
          changed = true;
          const path =
            fault === 'main-journal-during-power'
              ? join(f.runnerDirectory, 'saved.tfplan')
              : join(
                  f.store.directory,
                  'terraform-stages',
                  `network-${f.plan.planSha256.slice(0, 24)}-node-1-deallocate`,
                  f.plan.deploymentName,
                  'artifact-retirement.json',
                );
          await writeFile(path, 'synthetic changed original custody', { mode: 0o600 });
        }
        return session;
      };
    }
    f.store.write = async (...args) => {
      writes++;
      return write.apply(f.store, args);
    };
    const controller = new AbortController();
    if (fault === 'pre-aborted') controller.abort(Error('synthetic custody abort'));
    const start = performance.now();
    await expect(
      f.prepare(fault === 'ignored-source-loader' ? AbortSignal.timeout(25) : controller.signal),
    ).rejects.toThrow();
    expect(writes).toBe(0);
    if (fault === 'ignored-source-loader' || fault === 'pre-aborted')
      expect(performance.now() - start).toBeLessThan(1000);
  }, 180000);
test('paired custody resumes an exact persisted packet after response loss without republishing', async () => {
  const f = await fixture();
  const write = f.store.write;
  let writes = 0;
  f.store.write = async (...args) => {
    writes++;
    await write.apply(f.store, args);
    throw Error('synthetic custody response loss');
  };
  await expect(f.prepare()).rejects.toThrow('synthetic custody response loss');
  f.store.write = async (...args) => {
    writes++;
    return write.apply(f.store, args);
  };
  expect((await f.prepare()).status).toBe('prepared');
  expect(writes).toBe(1);
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
