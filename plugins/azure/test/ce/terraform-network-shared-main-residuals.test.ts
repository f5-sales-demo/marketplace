import { expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

type Fixture = Awaited<ReturnType<typeof terraformNetworkLineageFixture>>;
const collect = (f: Fixture) =>
  readAzureTerraformNetworkAllOriginalCustody(
    f.birth.original,
    f.publicSession,
    f.first.store,
    f.second.service,
    f.first.loaders,
    f.first.site,
    f.first.dependencies.qualifyAcceptance,
  );
async function cleanup(before: Set<string>) {
  for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
    await rm(root, { recursive: true });
    nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
  }
}

test('complete public packet and outcome absence cannot conceal a retained shared-main journal when no request is staged', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2);
    for (const name of await readdir(f.first.store.directory))
      if (f.plans.some((plan) => name.startsWith(`${plan.planId}-terraform-network`))) await f.first.store.remove(name);
    await rm(join(f.first.store.directory, 'terraform-stages'), { recursive: true });
    const commands = [...f.first.commands],
      result = await collect(f);
    expect(result.rows).toHaveLength(0);
    expect(result.lineage.rows.every((row) => row.execution === 'unstaged-no-outcome')).toBe(true);
    expect(result.sharedMain.status).toBe('complete');
    expect(result.sharedMain.rows.length).toBeGreaterThan(0);
    expect(result.sharedMain.rows.some((row) => row.provenance === 'unaccounted-receipt')).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(false);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.first.commands).toEqual(commands);
  } finally {
    await cleanup(before);
  }
}, 180000);

test('complete-shaped partial native evidence remains partial and cannot mint all-receipt custody', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await terraformNetworkLineageFixture(false, 2),
      open = f.second.service.open;
    f.second.service.open = async (...args) => {
      const session = await open(...args),
        read = session.readPlanJournalInventory;
      if (!read) throw Error('native inventory required');
      session.readPlanJournalInventory = async (...args) => {
        const value = structuredClone(await read.apply(session, args));
        const index = value.entries.findIndex((row) => row.state === 'planned' || row.state === 'applied');
        if (index < 0) throw Error('actual saved occurrence required');
        value.entries[index] = { ...value.entries[index], state: 'unknown', receiptSha256: null, journalSha256: null };
        delete value.entries[index].executionSha256;
        delete value.entries[index].ordinaryRefreshEnabled;
        value.status = 'partial';
        value.incompleteArchives = 1;
        value.entriesSha256 = canonicalSha256(value.entries);
        return value;
      };
      return session;
    };
    const result = await collect(f);
    expect(result.sharedMain.status).toBe('partial');
    expect(result.sharedMain.rows.some((row) => row.provenance === 'partial')).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(false);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
  } finally {
    await cleanup(before);
  }
}, 180000);
