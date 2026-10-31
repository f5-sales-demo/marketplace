import { expect, test } from 'bun:test';
import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

type Fixture = Awaited<ReturnType<typeof terraformNetworkLineageFixture>>;
const collect = (f: Fixture, signal?: AbortSignal) =>
  readAzureTerraformNetworkAllOriginalCustody(
    f.birth.original,
    f.publicSession,
    f.first.store,
    f.second.service,
    f.first.loaders,
    f.first.site,
    f.first.dependencies.qualifyAcceptance,
    signal,
  );
async function cleanup(before: Set<string>) {
  for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
    await rm(root, { recursive: true });
    nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
  }
}

test('exhaustive native inventory accounts both staged generations and retains a valid unrelated owned receipt', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2);
    const commands = [...f.first.commands],
      cloud = f.drivers.flatMap((d) => d.vmPowerActions);
    const result = await collect(f);
    expect(result.sharedMain.status).toBe('complete');
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(new Set(result.sharedMain.rows.flatMap((row) => row.planSha256s))).toEqual(
      new Set(f.plans.map((p) => p.planSha256)),
    );
    expect(
      result.sharedMain.rows.every((row) =>
        ['authenticated-execution-receipt', 'known-empty-configuration'].includes(row.provenance),
      ),
    ).toBe(true);
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(false);
    expect(result.sharedMain.replacementJournalsQualified).toBe(false);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.first.commands).toEqual(commands);
    expect(f.drivers.flatMap((d) => d.vmPowerActions)).toEqual(cloud);
    expect(JSON.stringify(result.sharedMain)).not.toContain(f.first.graph.original.binding.source);
    const session = await f.second.service.open(f.first.store.owner, f.second.deployment, 'current');
    const current = await session.readCurrentPlanJournal?.(await f.second.runner.readConfigurationSha256());
    if (!current?.receipt) throw Error('actual current receipt required');
    const rogue = { ...current.receipt, planSha256: f.first.hash('499') };
    await f.second.appendPlan(rogue);
    const after = [...f.first.commands];
    const unknown = await collect(f);
    expect(unknown.sharedMain.status).toBe('complete');
    expect(unknown.sharedMain.allNativeReceiptsAccounted).toBe(false);
    const actual = unknown.sharedMain.rows.filter((row) => row.receiptSha256 === canonicalSha256(rogue));
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.every((row) => row.provenance === 'unaccounted-receipt' && row.planSha256s.length === 0)).toBe(true);
    expect(unknown.lineage.rows.find((row) => row.planSha256 === f.future.planSha256)?.execution).toBe(
      'unstaged-no-outcome',
    );
    expect(unknown.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(f.first.commands).toEqual(after);
    await writeFile(join(f.first.runnerDirectory, 'unqualified-lifecycle.json'), '{}', { mode: 0o600 });
    const partial = await collect(f);
    expect(partial.sharedMain.status).toBe('partial');
    expect(partial.sharedMain.unrecognizedRootEntrySha256s?.length).toBe(1);
    expect(partial.sharedMain.allNativeReceiptsAccounted).toBe(false);
  } finally {
    await cleanup(before);
  }
}, 300000);

test('malformed, duplicate, foreign and unavailable exhaustive inventory cannot establish custody', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2),
      open = f.second.service.open;
    for (const fault of [
      'unavailable',
      'missing-reader',
      'foreign-manifest',
      'duplicate',
      'missing-current',
      'malformed-sha',
      'false-complete',
      'extra-key',
    ] as const) {
      f.second.service.open = async (...args) => {
        const session = await open(...args),
          read = session.readPlanJournalInventory;
        if (!read) throw Error('native inventory required');
        if (fault === 'missing-reader') delete session.readPlanJournalInventory;
        else
          session.readPlanJournalInventory = async (...args) => {
            const value = structuredClone(await read.apply(session, args));
            if (fault === 'unavailable') throw Error('synthetic exhaustive inventory unavailable');
            if (fault === 'foreign-manifest') value.manifestSha256 = 'f'.repeat(64);
            if (fault === 'duplicate') value.entries.push(structuredClone(value.entries[0]));
            if (fault === 'missing-current') value.entries = value.entries.filter((row) => row.location !== 'current');
            if (fault === 'malformed-sha') value.entries[0].archiveSha256 = 'bad';
            if (fault === 'false-complete') value.unrecognizedRootEntrySha256s = ['f'.repeat(64)];
            if (fault === 'extra-key') Object.assign(value, { callerAllowlist: [] });
            value.entriesSha256 = canonicalSha256(value.entries);
            return value;
          };
        return session;
      };
      await expect(collect(f)).rejects.toThrow();
      f.second.service.open = open;
    }
  } finally {
    await cleanup(before);
  }
}, 300000);

test('a fresh native mutation at final exhaustive read rejects the earlier inventory', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2),
      open = f.second.service.open;
    let reads = 0,
      fired = false;
    f.second.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanJournalInventory;
      if (!read) throw Error('native inventory required');
      session.readPlanJournalInventory = async (...args) => {
        if (++reads === 2) {
          const current = await session.readCurrentPlanJournal?.(await f.second.runner.readConfigurationSha256());
          if (!current?.receipt) throw Error('current native receipt required');
          await f.second.appendPlan({ ...current.receipt, planSha256: f.first.hash('499') });
          fired = true;
        }
        return read.apply(session, args);
      };
      return session;
    };
    await expect(collect(f)).rejects.toThrow('shared main inventory changed');
    expect(fired).toBe(true);
  } finally {
    await cleanup(before);
  }
}, 180000);

test('stalled exhaustive native reader obeys cancellation without publication or late custody', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2),
      open = f.second.service.open;
    const started = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>(),
      returned = Promise.withResolvers<void>();
    const controller = new AbortController();
    f.second.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanJournalInventory;
      if (!read) throw Error('native inventory required');
      session.readPlanJournalInventory = async (...args) => {
        const value = await read.apply(session, args);
        started.resolve();
        await release.promise;
        returned.resolve();
        return value;
      };
      return session;
    };
    const names = (await readdir(f.first.store.directory)).sort(),
      commands = [...f.first.commands];
    const running = collect(f, controller.signal);
    try {
      await started.promise;
      controller.abort(Error('exhaustive native reader cancelled'));
      await expect(running).rejects.toThrow('exhaustive native reader cancelled');
    } finally {
      release.resolve();
      await returned.promise;
    }
    expect((await readdir(f.first.store.directory)).sort()).toEqual(names);
    expect(f.first.commands).toEqual(commands);
  } finally {
    await cleanup(before);
  }
}, 180000);

test('final native inventory callback cannot alter previously authenticated source packets', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2),
      open = f.second.service.open;
    let reads = 0,
      fired = false;
    f.second.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanJournalInventory;
      if (!read) throw Error('native inventory required');
      session.readPlanJournalInventory = async (...args) => {
        const value = await read.apply(session, args);
        if (++reads === 2) {
          await f.first.store.remove(`${f.plan.planId}-terraform-network-node-1-preflight.json`);
          fired = true;
        }
        return value;
      };
      return session;
    };
    await expect(collect(f)).rejects.toThrow();
    expect(fired).toBe(true);
  } finally {
    await cleanup(before);
  }
}, 180000);
