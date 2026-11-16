import { expect, mock, test } from 'bun:test';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const runtime = await import('../../src/installed-runtime');
const originalRead = runtime.readOwnedInstalledInput;
let intercept: ((path: string) => Promise<void>) | undefined;
mock.module('../../src/installed-runtime', () => ({
  ...runtime,
  readOwnedInstalledInput: async (path: string, maximum?: number) => {
    const result = await originalRead(path, maximum);
    await intercept?.(path);
    return result;
  },
}));
const inventories = await import('../../src/installed-initial-inventory');
const fixturePath = new URL(
  '../test/fixtures/original-apply-inventory.fixture.ts',
  import.meta.resolve('../../src/installed-initial-inventory'),
).href;
const { withApplyInventory } = await import(fixturePath);

for (const kind of ['complete', 'apply-bound', 'platform'] as const) {
  test(`late ${kind} baseline mutation refuses and cannot be restored`, async () => {
    await withApplyInventory(
      async ({
        packet,
        before,
      }: {
        packet: unknown;
        before: import('../../src/installed-apply-controller').OriginalApplyCallbackContext;
      }) => {
        const view = await inventories.readOriginalApplyGcpInventory(packet);
        const directory = dirname(before.original.inputs['workspace:gcp-terraform-input-identity.json'].path);
        const names = await readdir(directory);
        const complete = names.find((name) => /^gcp-initial-inventory-.*-complete.private.json$/.test(name));
        const bound = names.find((name) => /^gcp-initial-inventory-.*-apply-bound.private.json$/.test(name));
        if (!complete || !bound) throw new Error('Original fixture receipts missing');
        const receipt = JSON.parse(await readFile(join(directory, complete), 'utf8'));
        const platform = receipt.resources.find((row: { type: string }) => row.type.startsWith('xcsh_'));
        if (!platform) throw new Error('Original fixture Platform baseline missing');
        const target =
          kind === 'platform' ? platform.bodyPath : join(directory, kind === 'complete' ? complete : bound);
        const bytes = await readFile(target);
        const replacement = `${target}.late-replacement`;
        const trigger = view.cloud.at(-1)?.evidence.path;
        if (!trigger) throw new Error('Original cloud baseline missing');
        let reads = 0;
        intercept = async (path) => {
          if (path !== trigger || ++reads !== 2) return;
          await writeFile(replacement, Buffer.concat([bytes, Buffer.from('\n')]), { flag: 'wx', mode: 0o400 });
          await rename(replacement, target);
        };
        try {
          await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow();
          expect(reads).toBeGreaterThanOrEqual(2);
        } finally {
          intercept = undefined;
          await writeFile(replacement, bytes, { flag: 'wx', mode: 0o400 });
          await rename(replacement, target);
        }
        await expect(inventories.readOriginalApplyGcpInventory(packet)).rejects.toThrow('retired');
      },
    );
  });
}
