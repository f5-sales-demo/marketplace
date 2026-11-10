import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAzureTerraformOriginalReceiptProvenance } from '../../src/ce/terraform-original-receipt-provenance';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

for (const ha of [false, true])
  test(`owning ${ha ? 'three-node' : 'single'} public outcome authenticates original receipt descriptors without exposing enrollment`, async () => {
    const f = await originalNativeWorkflowFixture(ha);
    try {
      const result = await f.run(),
        commands = [...f.commands],
        proof = await readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
          loadSource: async () => structuredClone(f.plan),
          loadOutcome: async () => structuredClone(result),
        });
      expect(proof.owningPublicOutcomeAuthenticated).toBe(true);
      expect(proof.receipts).toHaveLength(f.plan.topology.nodeCount + 1);
      expect(proof.receiptInventorySha256).toBe(result.originalReceiptInventorySha256);
      expect(proof.nativeJournalsQualified).toBe(false);
      expect(f.commands).toEqual(commands);
      expect(JSON.stringify(proof)).not.toContain('fixture-material');
    } finally {
      await f.close();
    }
  });
for (const field of ['digest', 'status', 'source'])
  test(`original descriptor qualification rejects foreign public outcome ${field}`, async () => {
    const f = await originalNativeWorkflowFixture();
    try {
      const result = await f.run();
      const outcome = {
        ...result,
        ...(field === 'digest'
          ? { originalReceiptInventorySha256: 'f'.repeat(64) }
          : field === 'status'
            ? { status: 'pending-registration' }
            : { planSha256: 'f'.repeat(64) }),
      };
      await expect(
        readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
          loadSource: async () => f.plan,
          loadOutcome: async () => outcome,
        }),
      ).rejects.toThrow();
    } finally {
      await f.close();
    }
  });
test('last outcome callback cannot hide changed earlier original descriptor bytes', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const result = await f.run();
    let reads = 0;
    await expect(
      readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
        loadSource: async () => f.plan,
        loadOutcome: async () => {
          if (++reads === 2) {
            const names = await import('node:fs/promises').then((fs) =>
                fs.readdir(join(f.storage.directory, 'terraform-original-deployment-receipts')),
              ),
              path = join(f.storage.directory, 'terraform-original-deployment-receipts', names.sort()[0]);
            await writeFile(path, Buffer.concat([Buffer.from(' '), await readFile(path)]), { mode: 0o600 });
          }
          return result;
        },
      }),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
test('changed owning outcome dependency is rejected', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const result = await f.run(),
      loaders = { loadSource: async () => f.plan, loadOutcome: async () => result };
    loaders.loadSource = async () => {
      loaders.loadOutcome = async () => ({ ...result });
      return f.plan;
    };
    await expect(readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, loaders)).rejects.toThrow(
      'dependency changed',
    );
  } finally {
    await f.close();
  }
});
test('original public outcome absence stays unresolved and cannot be inferred from descriptors', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    await f.run();
    await expect(
      readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
        loadSource: async () => f.plan,
        loadOutcome: async () => {
          throw Error('public outcome unavailable');
        },
      }),
    ).rejects.toThrow('public outcome unavailable');
  } finally {
    await f.close();
  }
});

test('an outcome callback cannot mutate the caller and its private plan copy together', async () => {
  const f = await originalNativeWorkflowFixture();
  try {
    const result = await f.run();
    let mutated = false;
    await expect(
      readAzureTerraformOriginalReceiptProvenance(f.plan, f.storage, {
        loadSource: async () => structuredClone(f.plan),
        loadOutcome: async (plan) => {
          mutated = true;
          f.plan.siteName = 'changed-after-admission';
          plan.siteName = 'changed-after-admission';
          return structuredClone(result);
        },
      }),
    ).rejects.toThrow('owning request or dependency changed');
    expect(mutated).toBe(true);
  } finally {
    await f.close();
  }
});
