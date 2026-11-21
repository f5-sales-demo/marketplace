import { expect, test } from 'bun:test';
import { link, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAzureTerraformOriginalReceiptInventory } from '../../src/ce/terraform-original-receipt-inventory';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

test('actual production admission publishes exact original native receipt inventory and resumes without replacing receipts', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const result = await f.run();
    expect(result.status).toBe('registered');
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
        bootstrapByNode: Record<string, string>;
        originalReceiptInventorySha256: string;
      },
      inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
    expect(inventory.status).toBe('complete');
    expect(inventory.records).toHaveLength(2);
    expect(result.originalReceiptInventorySha256).toBe(canonicalSha256(inventory));
    expect(checkpoint.originalReceiptInventorySha256).toBe(result.originalReceiptInventorySha256);
    expect(inventory.records.map((row) => row.record.stage.kind).sort()).toEqual(['foundation', 'node-admission']);
    for (const row of inventory.records) {
      const actual = await f.runner.readPlanApplicationHistory(row.record.receipt);
      expect(actual.matches.some((match) => match.state === 'applied')).toBe(true);
    }
    expect(f.counts()).toEqual({ applies: 2, revisions: 1, bootstrap: 1, reservations: 1 });
    expect((await f.run()).originalReceiptInventorySha256).toBe(result.originalReceiptInventorySha256);
    expect(f.counts()).toEqual({ applies: 2, revisions: 1, bootstrap: 1, reservations: 1 });
    expect(JSON.stringify(inventory)).not.toContain('fixture-material');
  } finally {
    await f.close();
  }
});
for (const afterWrite of [false, true])
  test(`lost mutable foundation response ${afterWrite ? 'after' : 'before'} write retains every original saved receipt`, async () => {
    const f = await originalNativeWorkflowFixture();
    try {
      const originalWrite = f.storage.write.bind(f.storage);
      let lose = true;
      f.storage.write = async (name, value) => {
        if (lose && name === 'terraform-foundation-plan.json') {
          lose = false;
          if (afterWrite) await originalWrite(name, value);
          throw Error('lost named receipt response');
        }
        await originalWrite(name, value);
      };
      await expect(f.run()).rejects.toThrow('lost named receipt response');
      f.storage.write = originalWrite;
      expect((await f.run()).status).toBe('registered');
      const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
          bootstrapByNode: Record<string, string>;
        },
        inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
      expect(inventory.records).toHaveLength(3);
      expect(new Set(inventory.records.map((row) => row.record.receipt.planSha256)).size).toBe(3);
      let unsubmitted = 0;
      const commands = [...f.commands];
      for (const row of inventory.records) {
        const actual = await f.runner.readPlanApplicationHistory(row.record.receipt);
        expect(actual.matches.length).toBeGreaterThan(0);
        if (!actual.matches.some((match) => match.state === 'applied')) unsubmitted++;
      }
      expect(unsubmitted).toBe(1);
      expect(f.commands).toEqual(commands);
      expect(f.counts().applies).toBe(2);
    } finally {
      await f.close();
    }
  });
for (const afterLink of [false, true])
  test(`owning workflow resumes complete receipt publication ${afterLink ? 'after' : 'before'} immutable link`, async () => {
    const f = await originalNativeWorkflowFixture();
    try {
      const write = f.storage.write.bind(f.storage);
      let lose = true;
      f.storage.write = async (name, value) => {
        if (lose && name === 'terraform-foundation-plan.json') {
          lose = false;
          throw Error('pause after original publication');
        }
        await write(name, value);
      };
      await expect(f.run()).rejects.toThrow('pause after original publication');
      const prior = await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.storage),
        row = prior.records[0],
        path = join(f.storage.directory, 'terraform-original-deployment-receipts', row.name),
        pending = path.replace('.json', '-00000000-0000-4000-8000-000000000099.pending');
      if (afterLink) await link(path, pending);
      else await rename(path, pending);
      f.storage.write = write;
      expect((await f.run()).status).toBe('registered');
      const checkpoint = (await f.storage.read('terraform-workflow.json')) as {
          bootstrapByNode: Record<string, string>;
        },
        current = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
      expect(current.status).toBe('complete');
      expect(current.records).toHaveLength(3);
      expect(current.records.some((value) => value.publicationSha256 === row.publicationSha256)).toBe(true);
      expect(f.counts().applies).toBe(2);
    } finally {
      await f.close();
    }
  });
test('corrupt original publication blocks resume before new planning and retains private evidence', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const write = f.storage.write.bind(f.storage);
    f.storage.write = async (name, value) => {
      if (name === 'terraform-foundation-plan.json') throw Error('pause');
      await write(name, value);
    };
    await expect(f.run()).rejects.toThrow('pause');
    const prior = await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.storage),
      path = join(f.storage.directory, 'terraform-original-deployment-receipts', prior.records[0].name),
      pending = path.replace('.json', '-00000000-0000-4000-8000-000000000099.pending');
    await rename(path, pending);
    await writeFile(pending, '{"foreign":true}', { mode: 0o600 });
    f.storage.write = write;
    const commands = [...f.commands];
    await expect(f.run()).rejects.toThrow('artifact schema differs');
    expect(f.commands).toEqual(commands);
    expect(await readFile(pending, 'utf8')).toBe('{"foreign":true}');
    expect(f.counts().applies).toBe(0);
  } finally {
    await f.close();
  }
});
test('final workflow publication callback cannot conceal changed original descriptor bytes as registered', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const write = f.storage.write.bind(f.storage);
    f.storage.write = async (name, value) => {
      await write(name, value);
      if (
        name === 'terraform-workflow.json' &&
        (value as { originalReceiptInventorySha256?: string }).originalReceiptInventorySha256
      ) {
        const bootstrap = (value as { bootstrapByNode: Record<string, string> }).bootstrapByNode,
          inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, bootstrap, f.storage),
          path = join(f.storage.directory, 'terraform-original-deployment-receipts', inventory.records[0].name);
        await writeFile(path, Buffer.concat([Buffer.from(' '), await readFile(path)]), { mode: 0o600 });
      }
    };
    await expect(f.run()).rejects.toThrow('descriptor provenance differs');
  } finally {
    await f.close();
  }
});
