import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { verifyCeRuntimeAssets } from './check-ce-runtime-assets';

test('every built plugin owns and hashes its runtime lock assets', async () => {
  for (const plugin of ['platform', 'aws', 'azure', 'terraform']) {
    const result = await verifyCeRuntimeAssets(resolve(import.meta.dir, '../plugins', plugin));
    expect(result.assets).toBe(plugin === 'platform' ? 0 : plugin === 'azure' ? 5 : plugin === 'aws' ? 4 : 3);
  }
});
test('rejects a flattened bundle that attempts to load another plugin or source checkout', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ce-runtime-assets-'));
  try {
    await mkdir(resolve(root, 'dist'));
    const source = "new URL('../../terraform/provider-lock.hcl', import.meta.url);";
    await writeFile(
      resolve(root, 'dist/runtime-assets.json'),
      JSON.stringify({
        schemaVersion: 2,
        assets: [],
        bundles: [
          { runtimePath: 'runtime.js', kind: 'entry-point', sha256: createHash('sha256').update(source).digest('hex') },
        ],
      }),
    );
    await writeFile(resolve(root, 'dist/runtime.js'), source);
    await expect(verifyCeRuntimeAssets(root)).rejects.toThrow(/foreign asset/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('split runtime validates every owned code chunk and rejects altered chunk bytes', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ce-runtime-chunks-'));
  try {
    await mkdir(resolve(root, 'dist'));
    const entry = 'import "./runtime-deadbeef.js";';
    const chunk = 'export const ready = true;';
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    await writeFile(resolve(root, 'dist/runtime.js'), entry);
    await writeFile(resolve(root, 'dist/runtime-deadbeef.js'), chunk);
    await writeFile(
      resolve(root, 'dist/runtime-assets.json'),
      JSON.stringify({
        schemaVersion: 2,
        assets: [],
        bundles: [
          { runtimePath: 'runtime.js', kind: 'entry-point', sha256: hash(entry) },
          { runtimePath: 'runtime-deadbeef.js', kind: 'chunk', sha256: hash(chunk) },
        ],
      }),
    );
    expect((await verifyCeRuntimeAssets(root)).bundles).toBe(2);
    await writeFile(resolve(root, 'dist/runtime-deadbeef.js'), chunk + ' changed');
    await expect(verifyCeRuntimeAssets(root)).rejects.toThrow(/checksum/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('split runtime rejects missing, extra, duplicate and foreign code or asset references', async () => {
  for (const mode of ['missing', 'extra', 'duplicate', 'foreign-import', 'foreign-asset', 'symlink']) {
    const root = await mkdtemp(resolve(tmpdir(), 'ce-runtime-chunk-rejection-'));
    try {
      await mkdir(resolve(root, 'dist'));
      const entry = 'import "./runtime-deadbeef.js";';
      const chunk =
        mode === 'foreign-import'
          ? 'import "../../foreign.js";'
          : mode === 'foreign-asset'
            ? 'new URL("../../foreign.hcl", import.meta.url);'
            : 'export const ready=true;';
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const bundles = [
        { runtimePath: 'runtime.js', kind: 'entry-point', sha256: hash(entry) },
        { runtimePath: 'runtime-deadbeef.js', kind: 'chunk', sha256: hash(chunk) },
      ];
      await writeFile(resolve(root, 'dist/runtime.js'), entry);
      if (mode !== 'missing') await writeFile(resolve(root, 'dist/runtime-deadbeef.js'), chunk);
      if (mode === 'extra') await writeFile(resolve(root, 'dist/runtime-12345678.js'), chunk);
      if (mode === 'duplicate') bundles.push(bundles[1]);
      if (mode === 'symlink') {
        await writeFile(resolve(root, 'foreign.js'), chunk);
        await rm(resolve(root, 'dist/runtime-deadbeef.js'));
        await (await import('node:fs/promises')).symlink(
          resolve(root, 'foreign.js'),
          resolve(root, 'dist/runtime-deadbeef.js'),
        );
      }
      await writeFile(
        resolve(root, 'dist/runtime-assets.json'),
        JSON.stringify({ schemaVersion: 2, assets: [], bundles }),
      );
      await expect(verifyCeRuntimeAssets(root)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('every runtime code file is tracked for a fresh checkout and archive', async () => {
  const repository = resolve(import.meta.dir, '..');
  const files = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: repository, encoding: 'utf8' }).split('\0'));
  for (const plugin of ['platform', 'aws', 'azure', 'terraform']) {
    const manifest = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        resolve(repository, 'plugins', plugin, 'dist/runtime-assets.json'),
        'utf8',
      ),
    );
    for (const bundle of manifest.bundles) expect(files.has(`plugins/${plugin}/dist/${bundle.runtimePath}`)).toBe(true);
  }
});
