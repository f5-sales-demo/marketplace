import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import { buildSiteUpgradeRequest } from '../../../platform/src/ce/wire-upgrade';
import { canonicalSha256 } from '../../src/ce/canonical';

const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex');

import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding, prepareAzureTerraformUpgrade } from '../../src/ce/terraform-upgrade';
import { retireAzureTerraformUpgradeStage } from '../../src/ce/terraform-upgrade-retirement';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const p of roots.splice(0)) await rm(p, { recursive: true, force: true });
});
const contract = {
  fingerprint: `sha256:${'a'.repeat(64)}`,
  build: (input: Parameters<typeof buildSiteUpgradeRequest>[0]) => buildSiteUpgradeRequest(input, () => {}),
} as unknown as VerifiedUpgradeContract;
async function fixture(kind: 'software' | 'os' = 'software', installedSoftware = 'crt-20260201-0178') {
  const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(base);
  const upgrade = await prepareAzureTerraformUpgrade(
    base,
    { kind, version: kind === 'software' ? 'crt-20260201-0179' : '9.2026.17' },
    {
      observeUpgrade: async () => ({
        owner: binding.owner,
        nodes: binding.nodes,
        siteName: binding.siteName,
        source: `/api/config/namespaces/system/sites/${binding.siteName}`,
        siteUid: 'logical-one',
        physicalSiteUid: 'physical-one',
        contractFingerprint: contract.fingerprint,
        siteContractFingerprint: `sha256:${'b'.repeat(64)}`,
        status: 'observed' as const,
        startedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        targetSoftware: kind === 'software' ? 'crt-20260201-0179' : installedSoftware,
        online: true,
        siteState: 'ONLINE',
        software: {
          installed: installedSoftware,
          available: 'crt-20260201-0179',
          phase: 'UPGRADE_COMPLETED',
          result: 'Completed',
        },
        os: { installed: '9.2026.14', available: '9.2026.17', phase: 'UPGRADE_COMPLETED', result: 'success' },
        targets: ['crt-20260201-0179'],
        targetSoftwareListed: true,
        prechecks: { checks: [{ name: 'nodes', status: 'CHECKLIST_PASSED' }], passing: true },
        progress: { status: 'COMPLETED', version: installedSoftware },
        sources: { site: '', targets: '', precheck: '', progress: '' },
        nodeHealth: 'unknown' as const,
        routing: 'unknown' as const,
        traffic: 'unknown' as const,
      }),
    },
    contract,
  );
  const root = await mkdtemp(join(tmpdir(), 'upgrade-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  await store.write(`${upgrade.planId}.json`, upgrade);
  await store.write(`${upgrade.planId}-authorization.json`, {
    schemaVersion: 2,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    mutations: true,
  });
  await store.write(`${upgrade.planId}-checkpoint.json`, {
    schemaVersion: 2,
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    upgradePlanSha256: upgrade.planSha256,
    phase: 'complete',
    actionPlanSha256: 'c'.repeat(64),
  });
  const action = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: base.deploymentName,
    backendIdentity: upgrade.deployment.backendIdentity,
    configurationSha256: sha256Hex(upgrade.deployment.configuration),
    providerLockSha256: sha256Hex(upgrade.deployment.providerLock),
    planSha256: 'c'.repeat(64),
    changes: [],
    noChanges: false,
    actionInvocations: [upgrade.action],
  };
  await store.write(`${upgrade.planId}-action-plan.json`, action);
  await store.write(`${upgrade.planId}-receipt.json`, {
    status: 'upgrade-complete',
    engine: 'terraform',
    planId: upgrade.planId,
    planSha256: upgrade.planSha256,
    siteName: binding.siteName,
    target: upgrade.expectation.target,
    actionPlanSha256: action.planSha256,
    observedAt: new Date().toISOString(),
    nodeHealth: 'unknown',
    routing: 'unknown',
    traffic: 'unknown',
  });
  await store.write('terraform-ce-upgrade-serial.json', {
    schemaVersion: 2,
    engine: 'terraform',
    status: 'idle',
    lastPlanId: upgrade.planId,
    lastPlanSha256: upgrade.planSha256,
  });
  let plans = 0,
    retires = 0,
    opens = 0,
    interrupted = false;
  let state = 'applied',
    changing = false;
  const session = {
    readArtifactRetirement: async (_receipt: unknown, _evidence: string): Promise<unknown> => {
      throw Error('fixture native marker observer not set');
    },
    readPlanApplicationHistory: async (_receipt: unknown): Promise<unknown> => {
      throw Error('fixture observer not set');
    },
    readPlanApplicationState: async () => state,
    readConfigurationSha256: async () => action.configurationSha256,
    plan: async () => {
      plans++;
      return { ...action, planSha256: 'd'.repeat(64), noChanges: !changing, actionInvocations: undefined };
    },
    retireArtifacts: async (receipt: { planSha256: string }, evidence: string) => {
      retires++;
      if (interrupted) {
        interrupted = false;
        throw Error('retirement interrupted');
      }
      return {
        status: 'runner-artifacts-retired',
        evidenceSha256: evidence,
        finalPlanSha256: receipt.planSha256,
        manifestSha256: 'e'.repeat(64),
        inventorySha256: 'f'.repeat(64),
        retiredArtifacts: 3,
      };
    },
  };
  const terraform = {
    open: async () => {
      opens++;
      return session;
    },
  };
  const run = (evidence = 'b'.repeat(64)) =>
    retireAzureTerraformUpgradeStage(base, upgrade, contract, terraform as never, store, evidence, {});
  return {
    base,
    upgrade,
    store,
    session,
    action,
    run,
    counts: () => ({ plans, retires, opens }),
    setState: (s: string) => {
      state = s;
    },
    setChanging: () => {
      changing = true;
    },
    interrupt: () => {
      interrupted = true;
    },
  };
}
async function custodyFixture(
  fault: 'none' | 'partial' | 'response-loss' = 'none',
  kind: 'software' | 'os' = 'software',
  installedSoftware = 'crt-20260201-0178',
) {
  const f = await fixture(kind, installedSoftware);
  const { configuration, providerLock, ...identity } = f.upgrade.deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: sha256Hex(configuration),
    providerLockSha256: sha256Hex(providerLock),
  });
  let historyAvailable = true,
    observed = 0,
    marker: 'absent' | 'retiring' | 'retired' = 'absent';
  let nativeReceipt: Record<string, unknown> | undefined;
  f.session.readPlanApplicationHistory = async (receipt) => {
    if (!historyAvailable) throw Error('fixture journals retired');
    observed++;
    expect(canonicalSha256(receipt)).toBe(canonicalSha256(f.action));
    return {
      schemaVersion: 1,
      scope: 'exact-saved-plan-journal-history',
      receiptSha256: canonicalSha256(f.action),
      manifestSha256,
      matches: [
        {
          location: 'plan-history',
          archiveSha256: '0'.repeat(64),
          state: 'applied',
          journalSha256: '1'.repeat(64),
          savedPlanSha256: f.action.planSha256,
          configurationSha256: f.action.configurationSha256,
          manifestSha256,
        },
      ],
      incompleteArchives: 0,
      applicationOutcomeQualified: false,
      retirementQualified: false,
    };
  };
  const originalRetire = f.session.retireArtifacts;
  let injected = false;
  f.session.retireArtifacts = async (receipt, evidence) => {
    const retired = await originalRetire(receipt, evidence);
    const native = { ...retired, manifestSha256, independentCleanupSha256: '2'.repeat(64) };
    if (!injected && fault === 'partial') {
      injected = true;
      marker = 'retiring';
      throw Error('fixture partial retirement');
    }
    nativeReceipt = native;
    marker = 'retired';
    if (!injected && fault === 'response-loss') {
      injected = true;
      throw Error('fixture retirement response lost');
    }
    return native;
  };
  f.session.readArtifactRetirement = async (receipt, evidence) => {
    if (marker === 'absent') return { status: 'absent' };
    if (marker === 'retiring')
      return {
        status: 'retiring',
        markerSha256: '3'.repeat(64),
        remainingArtifacts: 1,
        independentCleanupSha256: '2'.repeat(64),
      };
    if (!nativeReceipt) throw Error('fixture native receipt missing');
    expect(evidence).toBe(String(nativeReceipt.evidenceSha256));
    expect((receipt as Record<string, unknown>).planSha256).toBe(nativeReceipt.finalPlanSha256);
    return { status: 'runner-artifacts-retired', markerSha256: '3'.repeat(64), receipt: nativeReceipt };
  };
  return {
    ...f,
    disableHistory: () => {
      historyAvailable = false;
    },
    observed: () => observed,
    checkpoint: () => f.store.read(`${f.upgrade.planId}-stage-retirement.json`) as Promise<Record<string, unknown>>,
  };
}
test('upgrade stage binds custody and verifies completed native replay without reopening retired journals', async () => {
  const f = await custodyFixture();
  await f.run();
  const retired = await f.checkpoint();
  expect(retired.schemaVersion).toBe(2);
  expect(retired.externalEvidenceSha256).toBe('b'.repeat(64));
  expect(retired.appliedJournalSha256).toBe(canonicalSha256(retired.appliedJournal));
  expect(retired.evidenceSha256).toBe(canonicalSha256(retired.retirementEvidence));
  expect(retired.evidenceSha256 === retired.externalEvidenceSha256).toBe(false);
  expect((retired.appliedJournal as Record<string, unknown>).applicationOutcomeQualified).toBe(false);
  expect(f.counts()).toEqual({ opens: 1, plans: 1, retires: 1 });
  const reads = f.observed();
  f.disableHistory();
  await f.run();
  expect(f.observed()).toBe(reads);
  expect(f.counts()).toEqual({ opens: 2, plans: 1, retires: 1 });
  expect(await f.checkpoint()).toEqual(retired);
  await expect(f.run('4'.repeat(64))).rejects.toThrow('original stage checkpoint identity differs');
  expect(await f.checkpoint()).toEqual(retired);
  expect(f.counts().retires).toBe(1);
});
for (const fault of ['partial', 'response-loss'] as const) {
  test(`upgrade stage resumes ${fault} through its original native marker and evidence`, async () => {
    const f = await custodyFixture(fault);
    await expect(f.run()).rejects.toThrow(
      fault === 'partial' ? 'fixture partial retirement' : 'fixture retirement response lost',
    );
    const checkpoint = await f.checkpoint();
    expect(checkpoint.status).toBe('retiring');
    const reads = f.observed();
    f.disableHistory();
    await f.run();
    const retired = await f.checkpoint();
    expect(retired.status).toBe('retired');
    expect(retired.evidenceSha256).toBe(checkpoint.evidenceSha256);
    expect(retired.appliedJournalSha256).toBe(checkpoint.appliedJournalSha256);
    expect(retired.retirementEvidence).toEqual(checkpoint.retirementEvidence);
    expect(f.observed()).toBe(reads);
    expect(f.counts().plans).toBe(1);
    expect(f.counts().retires).toBe(fault === 'partial' ? 2 : 1);
  });
}
test('upgrade stage rejects forged retained proofs, contradictory final plans and lost permanent barriers', async () => {
  for (const fault of ['history', 'final', 'field', 'barrier', 'inode'] as const) {
    const f = await custodyFixture();
    await f.run();
    const checkpoint = await f.checkpoint();
    if (fault === 'history') {
      const applied = checkpoint.appliedJournal as Record<string, unknown>,
        history = applied.history as Record<string, unknown>;
      (history.matches as Array<Record<string, unknown>>)[0].state = 'planned';
      applied.historySha256 = canonicalSha256(history);
      checkpoint.appliedJournalSha256 = canonicalSha256(applied);
      (checkpoint.retirementEvidence as Record<string, unknown>).appliedJournalSha256 = checkpoint.appliedJournalSha256;
      checkpoint.evidenceSha256 = canonicalSha256(checkpoint.retirementEvidence);
    }
    if (fault === 'final') {
      (checkpoint.receipt as Record<string, unknown>).changes = [
        { address: 'foreign', type: 'foreign', actions: ['delete'] },
      ];
      checkpoint.receiptSha256 = canonicalSha256(checkpoint.receipt);
      (checkpoint.retirementEvidence as Record<string, unknown>).receiptSha256 = checkpoint.receiptSha256;
      checkpoint.evidenceSha256 = canonicalSha256(checkpoint.retirementEvidence);
    }
    if (fault === 'field') checkpoint.foreign = true;
    if (fault === 'barrier') f.session.readArtifactRetirement = async () => ({ status: 'absent' });
    if (fault === 'inode') {
      const path = join(f.store.directory, `${f.upgrade.planId}.json`),
        backup = join(roots.at(-1) as string, 'original-source.json');
      const bytes = await readFile(path);
      await rename(path, backup);
      await writeFile(path, bytes, { mode: 0o600 });
    }
    if (['history', 'final', 'field'].includes(fault))
      await f.store.write(`${f.upgrade.planId}-stage-retirement.json`, checkpoint);
    const errors = {
      history: 'native applied journal occurrence required',
      final: 'exact ordinary final no-change receipt required',
      field: 'checkpoint fields differ',
      barrier: 'completed stage lost its permanent native barrier',
      inode: 'retained root bytes or inode differ',
    };
    await expect(f.run()).rejects.toThrow(errors[fault]);
    expect(f.counts().retires).toBe(1);
  }
});
test('upgrade stage rejects root mutation during custody publication before any artifact deletion', async () => {
  const f = await custodyFixture();
  const originalWrite = f.store.write;
  f.store.write = async (name, value) => {
    await originalWrite.call(f.store, name, value);
    if (name.endsWith('-stage-retirement.json') && (value as Record<string, unknown>).status === 'retiring')
      await writeFile(
        join(f.store.directory, `${f.upgrade.planId}-action-plan.json`),
        JSON.stringify({ ...f.action, noChanges: true }),
        { mode: 0o600 },
      );
  };
  await expect(f.run()).rejects.toThrow('owning witness or root custody changed');
  expect(f.counts().retires).toBe(0);
});

test('serial software and OS completion retains both original stage envelopes through teardown and replay', async () => {
  const software = await custodyFixture(),
    os = await custodyFixture('none', 'os', 'crt-20260201-0179');
  expect(os.base.planSha256).toBe(software.base.planSha256);
  expect(os.upgrade.planId).not.toBe(software.upgrade.planId);
  expect(os.upgrade.expectation.before.software).toBe(software.upgrade.expectation.target.version);
  for (const suffix of ['', '-authorization', '-checkpoint', '-action-plan', '-receipt'])
    await software.store.write(
      `${os.upgrade.planId}${suffix}.json`,
      await os.store.read(`${os.upgrade.planId}${suffix}.json`),
    );
  // Both public version upgrades finish before parent teardown starts. Stage
  // retirement never grants authority to start an upgrade on a retired parent.
  await software.store.write(
    'terraform-ce-upgrade-serial.json',
    await os.store.read('terraform-ce-upgrade-serial.json'),
  );
  await software.run();
  const first = await software.checkpoint();
  const service = { open: async () => os.session };
  const retireOs = () =>
    retireAzureTerraformUpgradeStage(
      software.base,
      os.upgrade,
      contract,
      service as never,
      software.store,
      'c'.repeat(64),
      {},
    );
  expect((await retireOs()).status).toBe('runner-artifacts-retired');
  const second = await software.store.read(`${os.upgrade.planId}-stage-retirement.json`);
  software.disableHistory();
  os.disableHistory();
  expect((await software.run()).status).toBe('runner-artifacts-retired');
  expect((await retireOs()).status).toBe('runner-artifacts-retired');
  expect(await software.checkpoint()).toEqual(first);
  expect(await software.store.read(`${os.upgrade.planId}-stage-retirement.json`)).toEqual(second);
  expect(software.counts().plans).toBe(1);
  expect(software.counts().retires).toBe(1);
  expect(os.counts().plans).toBe(1);
  expect(os.counts().retires).toBe(1);
});
