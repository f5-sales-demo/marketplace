import { expect, test } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('refreshed descriptors reject foreign bindings, duplicates, partial histories, stale publication and executor manifest substitution', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    let outcome = f.result;
    const load = f.loaders.loadOutcome.bind(f.loaders);
    f.loaders.loadOutcome = async (plan) =>
      plan.planSha256 === f.first.planSha256 ? structuredClone(outcome) : load(plan);
    for (let i = 0; i < 3; i++) outcome = await f.f.run();
    expect(outcome.status).toBe('complete');
    const pointerName = `${f.first.planId}-terraform-replacement-refresh-inventory.json`,
      pointer = (await f.f.store.read(pointerName)) as { inventorySha256: string };
    type Packet = {
      binding: Record<string, unknown>;
      receipts: Array<{
        receipt: Record<string, unknown>;
        nativeHistory: { manifestSha256: string; matches: Array<{ manifestSha256: string }> };
        nativeHistorySha256: string;
      }>;
      previousInventorySha256: string | null;
      extra?: boolean;
    };
    const original = (await f.f.store.read(`replacement-refresh-inventory-${pointer.inventorySha256}.json`)) as Packet,
      originalOutcome = outcome;
    const qualify = () =>
      readAzureTerraformNetworkReplacementReceiptProvenance(
        f.first,
        f.f.store,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        f.f.dependencies.qualifyCompletedOperational,
      );
    const commands = [...f.commands],
      applies = f.f.state.applies;
    for (const fault of [
      'foreign-owner',
      'foreign-journal',
      'duplicate',
      'partial-prefix',
      'foreign-provider',
      'unknown-field',
      'executor-manifest',
    ] as const) {
      const changed = structuredClone(original);
      if (fault === 'foreign-owner') changed.binding.owner = { foreign: true };
      if (fault === 'foreign-journal') changed.binding.journalSha256 = 'f'.repeat(64);
      if (fault === 'duplicate') changed.receipts.push(structuredClone(changed.receipts[0]));
      if (fault === 'partial-prefix') changed.receipts.splice(1, 1);
      if (fault === 'foreign-provider') changed.binding.providerLockSha256 = 'f'.repeat(64);
      if (fault === 'unknown-field') changed.extra = true;
      if (fault === 'executor-manifest') {
        const row = requirePresent(changed.receipts.at(-1));
        row.nativeHistory.manifestSha256 = 'f'.repeat(64);
        for (const match of row.nativeHistory.matches) match.manifestSha256 = 'f'.repeat(64);
        row.nativeHistorySha256 = canonicalSha256(row.nativeHistory);
      }
      const digest = canonicalSha256(changed),
        path = join(f.f.store.directory, `replacement-refresh-inventory-${digest}.json`);
      await writeFile(path, JSON.stringify(changed), { mode: 0o600, flag: 'wx' });
      await f.f.store.write(pointerName, { schemaVersion: 1, inventorySha256: digest });
      outcome = { ...originalOutcome, networkReplacementRefreshInventorySha256: digest } as typeof outcome;
      await expect(qualify(), fault).rejects.toThrow();
      await f.f.store.write(pointerName, { schemaVersion: 1, inventorySha256: pointer.inventorySha256 });
      outcome = originalOutcome;
      await rm(path);
    }
    await f.f.store.write(pointerName, { schemaVersion: 1, inventorySha256: original.previousInventorySha256 });
    outcome = {
      ...originalOutcome,
      networkReplacementRefreshInventorySha256: original.previousInventorySha256,
    } as typeof outcome;
    await expect(qualify()).rejects.toThrow('stale');
    expect(f.commands).toEqual(commands);
    expect(f.f.state.applies).toBe(applies);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);

function requirePresent<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw Error('Required qualified evidence is missing');
  return value;
}
