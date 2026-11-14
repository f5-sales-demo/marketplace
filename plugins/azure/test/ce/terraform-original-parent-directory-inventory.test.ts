import { expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readAzureTerraformOriginalParentDirectoryInventory,
  recheckAzureTerraformOriginalParentDirectoryInventory,
} from '../../src/ce/terraform-original-parent-directory-inventory';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

for (const ha of [false, true])
  test(`original ${ha ? 'three-node' : 'single'} parent directories bind exact public metadata, fragments and native custody`, async () => {
    const f = await originalNativeWorkflowFixture(ha);
    try {
      const result = await f.run(),
        commands = [...f.commands];
      const loaders = {
        loadSource: async () => structuredClone(f.plan),
        loadOutcome: async () => structuredClone(result),
      };
      const receiptDirectory = join(f.storage.directory, 'terraform-original-deployment-receipts');
      const names = await import('node:fs/promises').then((fs) => fs.readdir(receiptDirectory));
      const receiptName = names.sort()[0];
      if (!receiptName) throw Error('actual original receipt metadata required');
      const path = join(receiptDirectory, receiptName),
        bytes = await readFile(path),
        fragment = bytes.subarray(0, 10);
      const fragmentDirectory = join(f.storage.directory, 'terraform-original-deployment-publication-fragments');
      await mkdir(fragmentDirectory, { mode: 0o700 });
      const fragmentName = `${receiptName.slice(0, 64)}-${randomUUID()}.pending.${createHash('sha256').update(fragment).digest('hex')}.fragment`;
      await writeFile(join(fragmentDirectory, fragmentName), fragment, { mode: 0o600 });
      const witness = await readAzureTerraformOriginalParentDirectoryInventory(f.plan, f.storage, loaders);
      expect(witness.originalReceiptMetadataQualified).toBe(true);
      expect(witness.parentRetirementQualified).toBe(false);
      expect(witness.completeParentInventoryQualified).toBe(false);
      expect(witness.nativeJournalsQualified).toBe(false);
      expect(witness.currentOperationalAcceptanceQualified).toBe(false);
      expect(witness.directories.map((row) => row.path)).toEqual([
        'terraform-original-deployment-receipts',
        'terraform-original-deployment-publication-fragments',
      ]);
      expect(witness.files).toHaveLength(f.plan.topology.nodeCount + 2);
      expect(JSON.stringify(witness)).not.toContain('fixture-material');
      const recheck = (value: unknown = witness, signal?: AbortSignal) =>
        recheckAzureTerraformOriginalParentDirectoryInventory(value, f.plan, f.storage, loaders, signal);
      await recheck();
      expect(f.commands).toEqual(commands);
      await expect(recheck(structuredClone(witness))).rejects.toThrow('owning original directory witness');
      await expect(
        recheckAzureTerraformOriginalParentDirectoryInventory(witness, f.plan, f.storage, { ...loaders }),
      ).rejects.toThrow('owning original directory witness');
      const controller = new AbortController();
      controller.abort(Error('original directory aborted'));
      await expect(recheck(witness, controller.signal)).rejects.toThrow('original directory aborted');
      const backup = `${f.storage.directory}-original-metadata-backup`;
      await rename(path, backup);
      try {
        await writeFile(path, bytes, { mode: 0o600 });
        await expect(recheck()).rejects.toThrow('bytes, inode or namespace changed');
      } finally {
        await rm(path, { force: true });
        await rename(backup, path);
      }
      const foreign = join(receiptDirectory, `${'a'.repeat(64)}.json`);
      await writeFile(foreign, '{}', { mode: 0o600 });
      await expect(recheck()).rejects.toThrow('namespace changed');
      await expect(readAzureTerraformOriginalParentDirectoryInventory(f.plan, f.storage, loaders)).rejects.toThrow();
      await rm(foreign);
      const outcome = loaders.loadOutcome;
      loaders.loadOutcome = async () => {
        throw Error('original public outcome unavailable');
      };
      await expect(readAzureTerraformOriginalParentDirectoryInventory(f.plan, f.storage, loaders)).rejects.toThrow(
        'original public outcome unavailable',
      );
      loaders.loadOutcome = outcome;
      // A later valid public outcome cannot hide a modified earlier receipt's raw bytes.
      let reads = 0;
      loaders.loadOutcome = async () => {
        if (++reads === 2) await writeFile(path, Buffer.concat([Buffer.from(' '), bytes]), { mode: 0o600 });
        return structuredClone(result);
      };
      await expect(readAzureTerraformOriginalParentDirectoryInventory(f.plan, f.storage, loaders)).rejects.toThrow();
      expect(reads).toBe(2);
      await writeFile(path, bytes, { mode: 0o600 });
      loaders.loadOutcome = outcome;
      // Interrupted metadata fragments are authorized only as exact publication prefixes.
      await writeFile(join(fragmentDirectory, fragmentName), Buffer.from('unrelated!'), { mode: 0o600 });
      await expect(readAzureTerraformOriginalParentDirectoryInventory(f.plan, f.storage, loaders)).rejects.toThrow(
        'fragment digest or publication prefix differs',
      );
    } finally {
      await f.close();
    }
  }, 180000);
