import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformOriginalReceiptInventory } from '../../src/ce/terraform-original-receipt-inventory';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

// Production workflow and genuine native proposals/journals; the external ingress
// and traffic callback is synthetic. This proves final-receipt custody only.
for (const ha of [false, true])
  test(`original ${ha ? 'HA' : 'single'} ingress completion persists exact ordinary final no-change receipt`, async () => {
    const f = await originalNativeWorkflowFixture(ha, true);
    let accepted = 0;
    try {
      const result = await f.run(async (session) => {
        expect(session).toBe(f.runner);
        accepted++;
        return { ingress: { synthetic: true }, traffic: { status: 'healthy' } };
      });
      expect(result.status).toBe('accepted');
      expect(result.terraformNoChanges).toBe(true);
      expect(accepted).toBe(1);
      const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
          bootstrapByNode: Record<string, string>;
        },
        inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage),
        final = inventory.records.filter((row) => row.record.stage.kind === 'ingress-final');
      expect(inventory.status).toBe('complete');
      expect(inventory.records).toHaveLength(f.plan.topology.nodeCount + 2);
      expect(final).toHaveLength(1);
      expect(final[0].record.receipt.noChanges).toBe(true);
      const history = await f.runner.readPlanApplicationHistory(final[0].record.receipt);
      expect(history.matches).toHaveLength(1);
      expect(history.matches[0].state).toBe('planned');
      expect(f.counts().applies).toBe(f.plan.topology.nodeCount + 1);
      expect(result.originalReceiptInventorySha256).toBe(canonicalSha256(inventory));
    } finally {
      await f.close();
    }
  });
test('synthetic ingress callback cannot authorize accepted completion when genuine final native proposal detects external VM loss', async () => {
  const f = await originalNativeWorkflowFixture(false, true);
  try {
    await expect(
      f.run(async () => {
        f.simulateExternalVmLoss(1);
        return { ingress: { synthetic: true }, traffic: { status: 'healthy' } };
      }),
    ).rejects.toThrow('ingress final must be an ordinary no-change receipt');
    expect(f.counts().applies).toBe(2);
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as { bootstrapByNode: Record<string, string> },
      inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
    expect(inventory.records.some((row) => row.record.stage.kind === 'ingress-final')).toBe(false);
  } finally {
    await f.close();
  }
});
for (const after of [false, true])
  test(`final original ingress checkpoint loss ${after ? 'after' : 'before'} publication retains prior final receipt on resume`, async () => {
    const f = await originalNativeWorkflowFixture(false, true);
    try {
      const write = f.storage.write.bind(f.storage);
      let lose = true;
      f.storage.write = async (name, value) => {
        if (
          lose &&
          name === 'terraform-workflow.json' &&
          (value as { originalReceiptInventorySha256?: string }).originalReceiptInventorySha256
        ) {
          lose = false;
          if (after) await write(name, value);
          throw Error('final ingress checkpoint response lost');
        }
        await write(name, value);
      };
      const accept = async () => ({ ingress: { synthetic: true }, traffic: { status: 'healthy' as const } });
      await expect(f.run(accept)).rejects.toThrow('final ingress checkpoint response lost');
      f.storage.write = write;
      expect((await f.run(accept)).status).toBe('accepted');
      const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
          bootstrapByNode: Record<string, string>;
        },
        inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage),
        final = inventory.records.filter((row) => row.record.stage.kind === 'ingress-final');
      expect(final).toHaveLength(2);
      expect(new Set(final.map((row) => row.record.receipt.planSha256)).size).toBe(2);
      expect(f.counts().applies).toBe(2);
      for (const row of final)
        expect((await f.runner.readPlanApplicationHistory(row.record.receipt)).matches.length).toBeGreaterThan(0);
    } finally {
      await f.close();
    }
  });
