import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyCeRuntimeAssets } from './check-ce-runtime-assets';

async function generatedModes(directory: string, prefix = ''): Promise<Record<string, number>> {
  const modes: Record<string, number> = {};
  for (const name of (await readdir(directory)).sort()) {
    const path = resolve(directory, name);
    const relative = prefix + name;
    const info = await lstat(path);
    modes[relative] = info.mode & 0o777;
    if (info.isDirectory()) Object.assign(modes, await generatedModes(path, relative + '/'));
  }
  return modes;
}

for (const rebuild of [false, true]) {
  test(`normalizes ${rebuild ? 'rebuilt' : 'fresh'} runtime permissions despite restrictive umask and hostile PATH`, async () => {
    const repository = await mkdtemp(resolve(tmpdir(), 'ce-builder-executable-'));
    try {
      const scripts = resolve(repository, 'scripts');
      const plugin = resolve(repository, 'plugins/platform');
      const shadow = resolve(repository, 'shadow-bin');
      const marker = resolve(repository, 'shadow-invocations');
      const sourceDirectory = resolve(plugin, 'src/nested');
      const sourceAsset = resolve(sourceDirectory, 'asset.txt');
      const assetBytes = Buffer.from('owned CE fixture asset\n');
      await Promise.all([mkdir(scripts), mkdir(sourceDirectory, { recursive: true }), mkdir(shadow)]);
      await copyFile(resolve(import.meta.dir, 'build-ce-runtime.ts'), resolve(scripts, 'build-ce-runtime.ts'));
      await writeFile(sourceAsset, assetBytes);
      await chmod(sourceAsset, 0o400);
      await chmod(sourceDirectory, 0o700);
      await writeFile(
        resolve(plugin, 'src/index.ts'),
        "import { readFile } from 'node:fs/promises';\n" +
          "export async function readOwnedAsset() { return readFile(new URL('./nested/asset.txt', import.meta.url), 'utf8'); }\n",
      );
      for (const name of ['bun', 'bunx']) {
        await writeFile(
          resolve(shadow, name),
          '#!/bin/sh\nprintf \'%s\\n\' "$0" >> "$CE_TEST_SHADOW_MARKER"\nexit 97\n',
          { mode: 0o700 },
        );
      }
      const env = {
        ...process.env,
        PATH: `${shadow}${delimiter}${process.env.PATH ?? ''}`,
        CE_TEST_SHADOW_MARKER: marker,
      };
      const dist = resolve(plugin, 'dist');
      if (rebuild) {
        await mkdir(resolve(dist, 'assets/plugins/platform/src/nested'), { recursive: true });
        await writeFile(resolve(dist, 'runtime.js'), 'old runtime\n', { mode: 0o400 });
        await writeFile(resolve(dist, 'runtime-12345678.js'), 'old chunk\n', { mode: 0o400 });
        await writeFile(resolve(dist, 'runtime-assets.json'), '{}\n', { mode: 0o600 });
        await writeFile(resolve(dist, 'assets/plugins/platform/src/nested/old.txt'), 'old asset\n', { mode: 0o400 });
        await writeFile(resolve(dist, 'unrelated.txt'), 'preserved\n', { mode: 0o600 });
        for (const directory of [
          '',
          'assets',
          'assets/plugins',
          'assets/plugins/platform',
          'assets/plugins/platform/src',
          'assets/plugins/platform/src/nested',
        ]) {
          await chmod(resolve(dist, directory), 0o700);
        }
      }
      const wrapper = resolve(scripts, 'restrictive-build.ts');
      await writeFile(wrapper, "process.umask(0o077);\nawait import('./build-ce-runtime.ts');\n");
      const parentUmask = process.umask();
      execFileSync(process.execPath, [wrapper, 'platform'], {
        cwd: repository,
        env,
        timeout: 45_000,
        stdio: 'pipe',
      });
      expect(process.umask()).toBe(parentUmask);
      expect((await lstat(dist)).mode & 0o777).toBe(0o755);
      expect(await generatedModes(dist)).toEqual({
        assets: 0o755,
        'assets/plugins': 0o755,
        'assets/plugins/platform': 0o755,
        'assets/plugins/platform/src': 0o755,
        'assets/plugins/platform/src/nested': 0o755,
        'assets/plugins/platform/src/nested/asset.txt': 0o644,
        'runtime-assets.json': 0o644,
        'runtime.js': 0o644,
        ...(rebuild ? { 'unrelated.txt': 0o600 } : {}),
      });
      expect(await readFile(sourceAsset)).toEqual(assetBytes);
      expect((await lstat(sourceAsset)).mode & 0o777).toBe(0o400);
      expect((await lstat(sourceDirectory)).mode & 0o777).toBe(0o700);
      expect(await verifyCeRuntimeAssets(plugin)).toEqual({ assets: 1, references: 1, bundles: 1, imports: 0 });
      const manifest = JSON.parse(await readFile(resolve(dist, 'runtime-assets.json'), 'utf8'));
      expect(manifest.plugin).toBe('platform');
      expect(manifest.assets[0].sourcePath).toBe('plugins/platform/src/nested/asset.txt');
      expect(manifest.assets[0].runtimePath).toBe('assets/plugins/platform/src/nested/asset.txt');
      const runner = resolve(repository, 'exercise-runtime.ts');
      await writeFile(
        runner,
        `import { readOwnedAsset } from ${JSON.stringify(pathToFileURL(resolve(dist, 'runtime.js')).href)};\n` +
          'process.stdout.write(await readOwnedAsset());\n',
      );
      expect(execFileSync(process.execPath, [runner], { cwd: repository, env, timeout: 5_000, encoding: 'utf8' })).toBe(
        assetBytes.toString(),
      );
      await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
      if (rebuild) expect(await readFile(resolve(dist, 'unrelated.txt'), 'utf8')).toBe('preserved\n');
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  }, 60_000);
}
