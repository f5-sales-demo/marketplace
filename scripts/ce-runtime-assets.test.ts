import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { verifyCeRuntimeAssets } from './check-ce-runtime-assets';

test('every built plugin owns and hashes its runtime lock assets', async () => {
  for (const plugin of ['platform', 'aws', 'azure', 'terraform']) {
    const result = await verifyCeRuntimeAssets(resolve(import.meta.dir, '../plugins', plugin));
    expect(result.assets).toBe(plugin === 'platform' ? 0 : plugin === 'azure' ? 3 : plugin === 'aws' ? 2 : 1);
  }
});
test('rejects a flattened bundle that attempts to load another plugin or source checkout', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ce-runtime-assets-'));
  try {
    await mkdir(resolve(root, 'dist'));
    await writeFile(resolve(root, 'dist/runtime-assets.json'), JSON.stringify({ schemaVersion: 1, assets: [] }));
    await writeFile(resolve(root, 'dist/runtime.js'), "new URL('../../terraform/provider-lock.hcl', import.meta.url);");
    await expect(verifyCeRuntimeAssets(root)).rejects.toThrow(/foreign asset/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
