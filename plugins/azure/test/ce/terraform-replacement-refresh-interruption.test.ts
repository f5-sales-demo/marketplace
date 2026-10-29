import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { readAzureTerraformNetworkReplacementReceiptProvenance } from '../../src/ce/terraform-network-replacement-receipt-provenance';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('replacement resumes interruption after durable refresh descriptor and before current final publication', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    const finalName = `${f.first.planId}-terraform-replacement-final-plan.json`,
      completionName = `${f.first.planId}-terraform-network-replacement-complete.json`,
      pointerName = `${f.first.planId}-terraform-replacement-refresh-inventory.json`;
    const originalFinal = await f.f.store.read(finalName),
      originalCompletion = await f.f.store.read(completionName);
    const write = f.f.store.write;
    f.f.store.write = async (name, record) => {
      if (name === finalName) throw Error('simulated interruption before current final publication');
      return write.call(f.f.store, name, record);
    };
    await expect(f.f.run()).rejects.toThrow('simulated interruption');
    f.f.store.write = write;
    const pointer = (await f.f.store.read(pointerName)) as { inventorySha256: string },
      inventory = (await f.f.store.read(`replacement-refresh-inventory-${pointer.inventorySha256}.json`)) as {
        receipts: Array<{ receipt: PlanReceipt }>;
      };
    expect(inventory.receipts).toHaveLength(1);
    await f.archive(inventory.receipts[0].receipt);
    expect(await f.f.store.read(finalName)).toEqual(originalFinal);
    expect(await f.f.store.read(completionName)).toEqual(originalCompletion);
    await expect(
      readAzureTerraformNetworkReplacementReceiptProvenance(
        f.first,
        f.f.store,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        f.f.dependencies.qualifyCompletedOperational,
      ),
    ).rejects.toThrow('inventory differs');
    const applies = f.f.state.applies,
      counter = f.f.state.counter;
    const recovered = await f.f.run();
    expect(recovered.status).toBe('complete');
    expect(f.f.state.applies).toBe(applies);
    expect(f.f.state.counter).toBe(counter);
    expect(await f.f.store.read(finalName)).toEqual(inventory.receipts[0].receipt);
    expect(await f.f.store.read(pointerName)).toEqual(pointer);
    expect(await f.f.store.read(completionName)).toEqual(originalCompletion);
    const loadOutcome = f.loaders.loadOutcome.bind(f.loaders);
    let outcome = recovered;
    f.loaders.loadOutcome = async (plan) =>
      plan.planSha256 === f.first.planSha256 ? structuredClone(outcome) : loadOutcome(plan);
    const recoveredProof = await readAzureTerraformNetworkReplacementReceiptProvenance(
      f.first,
      f.f.store,
      f.loaders,
      f.f.birth.site,
      f.f.dependencies.qualifyHistorical,
      f.f.dependencies.qualifyCompletedOperational,
    );
    expect(recoveredProof.receipts).toHaveLength(4);
    // A separately requested normal refresh must append a distinct receipt while retaining recovery.
    const next = await f.f.run();
    outcome = next;
    expect(f.f.state.counter).toBe(counter + 1);
    expect(next.status).toBe('complete');
    expect(f.f.state.applies).toBe(applies);
    expect(await f.f.store.read(completionName)).toEqual(originalCompletion);
    const nextPointer = (await f.f.store.read(pointerName)) as { inventorySha256: string },
      nextInventory = (await f.f.store.read(`replacement-refresh-inventory-${nextPointer.inventorySha256}.json`)) as {
        receipts: Array<{ receipt: PlanReceipt }>;
      };
    expect(nextInventory.receipts).toHaveLength(2);
    expect(nextInventory.receipts[0]).toEqual(inventory.receipts[0]);
    await f.archive(nextInventory.receipts[1].receipt);
    const commands = [...f.commands];
    const proof = await readAzureTerraformNetworkReplacementReceiptProvenance(
      f.first,
      f.f.store,
      f.loaders,
      f.f.birth.site,
      f.f.dependencies.qualifyHistorical,
      f.f.dependencies.qualifyCompletedOperational,
    );
    expect(proof.receipts).toHaveLength(5);
    expect(f.commands).toEqual(commands);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);
