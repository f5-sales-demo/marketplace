import { expect, test } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('replacement refresh rejects a missing middle descriptor even when the caller updates the inventory digest', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    let outcome = f.result;
    const load = f.loaders.loadOutcome.bind(f.loaders);
    f.loaders.loadOutcome = async (plan) =>
      plan.planSha256 === f.first.planSha256 ? structuredClone(outcome) : load(plan);
    for (let i = 0; i < 3; i++) outcome = await f.f.run();
    expect(outcome.status).toBe('complete');
    const pointerName = `${f.first.planId}-terraform-replacement-refresh-inventory.json`;
    const pointer = (await f.f.store.read(pointerName)) as { inventorySha256: string },
      inventory = (await f.f.store.read(`replacement-refresh-inventory-${pointer.inventorySha256}.json`)) as {
        receipts: unknown[];
      };
    expect(inventory.receipts).toHaveLength(3);
    const altered = structuredClone(inventory);
    altered.receipts.splice(1, 1);
    const changedDigest = canonicalSha256(altered);
    await writeFile(
      join(f.f.store.directory, `replacement-refresh-inventory-${changedDigest}.json`),
      JSON.stringify(altered),
      { mode: 0o600, flag: 'wx' },
    );
    await f.f.store.write(pointerName, { schemaVersion: 1, inventorySha256: changedDigest });
    outcome = { ...outcome, networkReplacementRefreshInventorySha256: changedDigest } as typeof outcome;
    const commands = [...f.commands],
      applies = f.f.state.applies;
    await expect(
      readAzureTerraformNetworkReplacementReceiptProvenance(
        f.first,
        f.f.store,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        f.f.dependencies.qualifyCompletedOperational,
      ),
    ).rejects.toThrow('prefix');
    expect(f.commands).toEqual(commands);
    expect(f.f.state.applies).toBe(applies);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);
