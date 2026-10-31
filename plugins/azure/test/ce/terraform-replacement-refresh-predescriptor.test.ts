import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { validateAzureTerraformReplacementCheckpoint } from '../../src/ce/terraform-replacement';
import { planAzureTerraformReplacementFinalRefresh } from '../../src/ce/terraform-replacement-final-refresh';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('owning replacement saved-plan reply loss before descriptor publication resumes with every native receipt accounted', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    let outcome = f.result;
    const loadOutcome = f.loaders.loadOutcome.bind(f.loaders);
    f.loaders.loadOutcome = async (plan) =>
      plan.planSha256 === f.first.planSha256 ? structuredClone(outcome) : loadOutcome(plan);
    const publicSession: SessionManagerLike = {
      getSessionId: () => `${f.f.store.directory}-refreshed-replacement-public`,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => undefined,
    };
    for (const plan of [f.original, f.f.input.networkPlan, f.first])
      await savePlanArtifact(publicSession, plan, f.f.birth.current);
    const collect = () =>
      readAzureTerraformNetworkAllOriginalCustody(
        f.original,
        publicSession,
        f.f.store,
        f.service,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        undefined,
        f.f.dependencies.qualifyCompletedOperational,
      );
    const initial = await collect();
    expect(initial.sharedMain.allNativeReceiptsAccounted).toBe(true);
    const completion = await f.f.store.read(`${f.first.planId}-terraform-network-replacement-complete.json`);
    const plan = f.f.session.plan;
    let lost: PlanReceipt | undefined;
    f.f.session.plan = async (...args) => {
      lost = await plan.apply(f.f.session, args);
      throw Error('saved native final reply lost before descriptor publication');
    };
    await expect(f.f.run()).rejects.toThrow('saved native final reply lost');
    f.f.session.plan = plan;
    expect(lost?.noChanges).toBe(true);
    if (!lost) throw Error('owning saved native receipt must exist');
    await f.archive(lost);
    f.f.session.readCurrentPlanJournal = f.runner.readCurrentPlanJournal.bind(f.runner);
    const checkpoint = validateAzureTerraformReplacementCheckpoint(
      f.first,
      await f.f.store.read(`${f.first.planId}-terraform-replacement.json`),
    );
    const binding = {
      journalSha256: f.f.dependencies.journalSha256,
      sourceBindingSha256: f.f.dependencies.sourceBindingSha256,
      checkpointSha256: canonicalSha256({ ...checkpoint, phase: 'complete' }),
      configurationSha256: checkpoint.launchConfigurationSha256,
      providerLockSha256: lost.providerLockSha256,
    };
    const readCurrent = f.f.session.readCurrentPlanJournal;
    if (!readCurrent) throw Error('actual native refresh reader required');
    const recover = (signal?: AbortSignal) =>
      planAzureTerraformReplacementFinalRefresh(f.first, f.f.store, f.f.session, binding, {}, signal);
    const beforeCounter = f.f.state.counter,
      beforeNativeCommands = [...f.commands];
    for (const mode of [
      'state',
      'scope',
      'semantics',
      'manifest',
      'execution',
      'saved-plan',
      'journal',
      'provider',
      'configuration',
      'changes',
      'deployment',
      'callback-drift',
      'aliased-observation',
    ] as const) {
      let calls = 0;
      let prior: Awaited<ReturnType<typeof readCurrent>> | undefined;
      f.f.session.readCurrentPlanJournal = async (...args) => {
        const row = structuredClone(await readCurrent(...args));
        calls++;
        if (mode === 'aliased-observation' && prior) prior.journalSha256 = 'a'.repeat(64);
        prior = row;
        if (mode === 'state') row.state = 'applying';
        if (mode === 'scope') row.scope = 'foreign' as typeof row.scope;
        if (mode === 'semantics') row.planSemanticsQualified = true as false;
        if (mode === 'manifest') row.manifestSha256 = 'a'.repeat(64);
        if (mode === 'execution') row.executionSha256 = undefined;
        if (mode === 'saved-plan') row.savedPlanSha256 = 'a'.repeat(64);
        if (mode === 'journal') row.journalSha256 = null;
        if (mode === 'provider' && row.receipt) row.receipt.providerLockSha256 = 'a'.repeat(64);
        if (mode === 'configuration' && row.receipt) row.receipt.configurationSha256 = 'a'.repeat(64);
        if (mode === 'changes' && row.receipt) row.receipt.noChanges = false;
        if (mode === 'deployment' && row.receipt) row.receipt.deploymentId = 'foreign';
        if (mode === 'callback-drift' && calls > 1) row.journalSha256 = 'a'.repeat(64);
        return row;
      };
      await expect(recover()).rejects.toThrow(/native evidence differs|journal changed|observation changed/);
      expect(f.f.state.counter).toBe(beforeCounter);
      expect(f.commands).toEqual(beforeNativeCommands);
    }
    f.f.session.readCurrentPlanJournal = async () => await new Promise<never>(() => {});
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(Error('cancel unresolved native reader')), 10);
    try {
      await expect(recover(abort.signal)).rejects.toThrow('cancel unresolved native reader');
    } finally {
      clearTimeout(timer);
    }
    expect(f.f.state.counter).toBe(beforeCounter);
    expect(f.commands).toEqual(beforeNativeCommands);
    f.f.session.readCurrentPlanJournal = readCurrent;
    const storageRead = f.f.store.read.bind(f.f.store);
    f.f.store.read = async (name) => {
      if (name === `${f.first.planId}-terraform-replacement-final-plan.json`)
        throw Object.assign(Error('denied'), { code: 'EACCES' });
      return storageRead(name);
    };
    await expect(recover()).rejects.toThrow('denied');
    f.f.store.read = storageRead;
    expect(await recover()).toEqual(lost);
    const beforeApplies = f.f.state.applies;
    outcome = await f.f.run();
    expect(outcome.status).toBe('complete');
    expect(f.f.state.applies).toBe(beforeApplies);
    const current = (await f.f.store.read(`${f.first.planId}-terraform-replacement-final-plan.json`)) as PlanReceipt;
    expect(current).toEqual(lost);
    const native = await f.runner.readCurrentPlanJournal(lost.configurationSha256);
    expect(native.receipt).toEqual(lost);
    expect(native.receipt?.refreshOriginSha256).toMatch(/^[a-f0-9]{64}$/);
    const commands = [...f.commands],
      applies = f.f.state.applies;
    const refreshed = await collect();
    expect(refreshed.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(refreshed.sharedMain.replacementJournalsQualified).toBe(true);
    expect(await f.f.store.read(`${f.first.planId}-terraform-network-replacement-complete.json`)).toEqual(completion);
    expect(f.commands).toEqual(commands);
    expect(f.f.state.applies).toBe(applies);
    await f.appendUnknown();
    expect((await collect()).sharedMain.allNativeReceiptsAccounted).toBe(false);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);
