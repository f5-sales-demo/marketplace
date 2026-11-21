import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyCeRuntimeAssets(pluginDirectory: string) {
  const root = resolve(pluginDirectory);
  const bundle = resolve(root, 'dist/runtime.js');
  const source = await readFile(bundle, 'utf8');
  const manifest = JSON.parse(await readFile(resolve(root, 'dist/runtime-assets.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) throw Error('Missing CE runtime asset manifest');
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (
      typeof asset.runtimePath !== 'string' ||
      !asset.runtimePath.startsWith('assets/') ||
      seen.has(asset.runtimePath)
    )
      throw Error('Invalid or duplicate CE runtime asset');
    const target = resolve(root, 'dist', asset.runtimePath);
    if (!target.startsWith(root + sep)) throw Error('CE runtime asset escapes plugin');
    const digest = createHash('sha256')
      .update(await readFile(target))
      .digest('hex');
    if (digest !== asset.sha256) throw Error('CE runtime asset checksum differs');
    seen.add(asset.runtimePath);
  }
  let references = 0;
  for (const match of source.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
    if (/^[a-z]+:\/\//i.test(match[1])) continue;
    const path = match[1].replace(/^\.\//, '');
    if (!seen.has(path)) throw Error('CE runtime references an unbundled or foreign asset');
    references++;
  }
  return { assets: seen.size, references };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const plugin of ['platform', 'aws', 'azure', 'terraform']) {
    const result = await verifyCeRuntimeAssets(resolve(import.meta.dir, '../plugins', plugin));
    console.log(JSON.stringify({ plugin, ...result }));
  }
}
