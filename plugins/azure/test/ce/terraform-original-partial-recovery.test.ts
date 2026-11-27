import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAzureTerraformOriginalReceiptInventory } from '../../src/ce/terraform-original-receipt-inventory';
import { readAzureTerraformOriginalReceiptProvenance } from '../../src/ce/terraform-original-receipt-provenance';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

async function fixture() {
  const f = await originalNativeWorkflowFixture(),
    write = f.storage.write.bind(f.storage);
  f.storage.write = async (name, value) => {
    if (name === 'terraform-foundation-plan.json') throw Error('selected original publication interruption');
    await write(name, value);
  };
  await expect(f.run()).rejects.toThrow('publication interruption');
  f.storage.write = write;
  const inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, {}, f.storage),
    row = inventory.records[0],
    directory = join(f.storage.directory, 'terraform-original-deployment-receipts'),
    path = join(directory, row.name),
    pending = path.replace('.json', '-00000000-0000-4000-8000-000000000099.pending'),
    whole = await readFile(path),
    fragment = whole.subarray(0, 83);
  await rename(path, pending);
  await writeFile(pending, fragment, { mode: 0o600 });
  return { ...f, pending, fragment, whole, record: row.record };
}
test('owning original workflow resumes genuine truncated publication using exact native saved-plan evidence and retains raw fragment', async () => {
  const f = await fixture();
  try {
    expect((await f.run()).status).toBe('registered');
    expect(f.counts().applies).toBe(2);
    const audit = join(f.storage.directory, 'terraform-original-deployment-publication-fragments'),
      names = await readdir(audit);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain(createHash('sha256').update(f.fragment).digest('hex'));
    expect(await readFile(join(audit, names[0]))).toEqual(f.fragment);
    const checkpoint = (await f.storage.read('terraform-workflow.json')) as { bootstrapByNode: Record<string, string> },
      inventory = await readAzureTerraformOriginalReceiptInventory(f.plan, checkpoint.bootstrapByNode, f.storage);
    expect(inventory.status).toBe('complete');
    expect(inventory.records.some((row) => row.record.receipt.planSha256 === f.record.receipt.planSha256)).toBe(true);
  } finally {
    await f.close();
  }
});
test('corrupt original pending prefix remains retained and cannot be fabricated from a native receipt', async () => {
  const f = await fixture();
  try {
    await writeFile(f.pending, '{"foreign":true}', { mode: 0o600 });
    const commands = [...f.commands];
    await expect(f.run()).rejects.toThrow();
    expect(f.commands).toEqual(commands);
    expect(await readFile(f.pending, 'utf8')).toBe('{"foreign":true}');
    expect(f.counts().applies).toBe(0);
  } finally {
    await f.close();
  }
});

for (const phase of ['linked', 'preserved', 'published'])
  test(`truncated original publication resumes loss after fragment ${phase} boundary`, async () => {
    const f = await fixture();
    try {
      const verify = f.storage.verify.bind(f.storage),
        audit = join(f.storage.directory, 'terraform-original-deployment-publication-fragments');
      let lose = true;
      const publication = (await import('../../src/ce/canonical')).canonicalSha256(f.record),
        finalPath = join(f.storage.directory, 'terraform-original-deployment-receipts', `${publication}.json`);
      f.storage.verify = async () => {
        await verify();
        const auditStat = await lstat(audit).catch(() => undefined),
          pendingStat = await lstat(f.pending).catch(() => undefined),
          finalStat = await lstat(finalPath).catch(() => undefined);
        if (
          lose &&
          auditStat &&
          ((phase === 'linked' && pendingStat?.nlink === 2) ||
            (phase === 'preserved' && !pendingStat && !finalStat) ||
            (phase === 'published' && !pendingStat && finalStat?.nlink === 1))
        ) {
          lose = false;
          throw Error(`selected ${phase} fragment recovery response loss`);
        }
      };
      await expect(f.run()).rejects.toThrow('fragment recovery response loss');
      f.storage.verify = verify;
      const result = await f.run();
      expect(result.status).toBe('registered');
      expect(f.counts().applies).toBe(2);
      const names = await readdir(audit);
      expect(names).toHaveLength(1);
      expect(await readFile(join(audit, names[0]))).toEqual(f.fragment);
      const proof = await readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
        loadSource: async () => f.plan,
        loadOutcome: async () => result,
      });
      expect(proof.publicationFragments).toHaveLength(1);
      expect(proof.publicationFragments[0].fragmentBytes).toBe(f.fragment.length);
    } finally {
      await f.close();
    }
  });
test('missing native current journal reader leaves truncated original publication unresolved without replanning', async () => {
  const f = await fixture();
  try {
    Object.defineProperty(f.runner, 'readCurrentPlanJournal', { value: undefined, configurable: true });
    const commands = [...f.commands];
    await expect(f.run()).rejects.toThrow('recovery readers unavailable');
    expect(f.commands).toEqual(commands);
    expect(await readFile(f.pending)).toEqual(f.fragment);
  } finally {
    await f.close();
  }
});
test('changed genuine native receipt cannot reconstruct a prior original publication', async () => {
  const f = await fixture();
  try {
    await f.runner.plan({});
    const commands = [...f.commands];
    await expect(f.run()).rejects.toThrow('unique original publication');
    expect(f.commands).toEqual(commands);
    expect(await readFile(f.pending)).toEqual(f.fragment);
  } finally {
    await f.close();
  }
});
test('submitted native receipt cannot authorize rebuilding a truncated original publication', async () => {
  const f = await fixture();
  try {
    await f.runner.apply(f.record.receipt, {});
    const commands = [...f.commands],
      applies = f.counts().applies;
    await expect(f.run()).rejects.toThrow('requires reconciliation');
    expect(f.commands).toEqual(commands);
    expect(f.counts().applies).toBe(applies);
    expect(await readFile(f.pending)).toEqual(f.fragment);
  } finally {
    await f.close();
  }
});
test('native callback mutation of the original fragment is detected before preservation or rebuilding', async () => {
  const f = await fixture();
  try {
    const read = f.runner.readCurrentPlanJournal.bind(f.runner);
    let count = 0;
    f.runner.readCurrentPlanJournal = async (...args) => {
      const value = await read(...args);
      if (++count === 2) await writeFile(f.pending, ' ', { mode: 0o600 });
      return value;
    };
    const commands = [...f.commands];
    await expect(f.run()).rejects.toThrow('changed during recovery');
    expect(f.commands).toEqual(commands);
    expect(await readFile(f.pending, 'utf8')).toBe(' ');
    expect(f.counts().applies).toBe(0);
  } finally {
    await f.close();
  }
});
test('preserved fragment mutation invalidates original public outcome provenance', async () => {
  const f = await fixture();
  try {
    const result = await f.run(),
      audit = join(f.storage.directory, 'terraform-original-deployment-publication-fragments'),
      names = await readdir(audit);
    await writeFile(join(audit, names[0]), ' ', { mode: 0o600 });
    await expect(
      readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
        loadSource: async () => f.plan,
        loadOutcome: async () => result,
      }),
    ).rejects.toThrow('fragment digest or publication prefix differs');
  } finally {
    await f.close();
  }
});

test('last native completion callback cannot hide changed preserved fragment after immutable publication', async () => {
  const f = await fixture();
  try {
    const read = f.runner.readCurrentPlanJournal.bind(f.runner);
    let count = 0;
    f.runner.readCurrentPlanJournal = async (...args) => {
      const value = await read(...args);
      if (++count === 4) {
        const audit = join(f.storage.directory, 'terraform-original-deployment-publication-fragments'),
          names = await readdir(audit);
        await writeFile(join(audit, names[0]), ' ', { mode: 0o600 });
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow('preserved publication fragment changed');
    expect(f.counts().applies).toBe(0);
  } finally {
    await f.close();
  }
});
