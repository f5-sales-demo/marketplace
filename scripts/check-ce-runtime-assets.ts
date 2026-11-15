import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));
async function ownedFile(path: string): Promise<Buffer> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (await realpath(path)) !== path)
    throw Error('CE runtime file ownership differs');
  return readFile(path);
}
export async function verifyCeRuntimeAssets(pluginDirectory: string) {
  const root = resolve(pluginDirectory);
  const directory = resolve(root, 'dist');
  const manifest = JSON.parse((await ownedFile(resolve(directory, 'runtime-assets.json'))).toString());
  if (
    manifest.schemaVersion !== 2 ||
    !Array.isArray(manifest.assets) ||
    !Array.isArray(manifest.bundles) ||
    !manifest.bundles.length
  )
    throw Error('Missing CE runtime asset manifest');
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (
      typeof asset.runtimePath !== 'string' ||
      !asset.runtimePath.startsWith('assets/') ||
      asset.runtimePath.split('/').some((part: string) => !part || part === '.' || part === '..') ||
      seen.has(asset.runtimePath)
    )
      throw Error('Invalid or duplicate CE runtime asset');
    const target = resolve(directory, asset.runtimePath);
    if (!target.startsWith(resolve(directory, 'assets') + sep)) throw Error('CE runtime asset escapes plugin');
    if (hash(await ownedFile(target)) !== asset.sha256) throw Error('CE runtime asset checksum differs');
    seen.add(asset.runtimePath);
  }
  const code = new Map<string, string>();
  let entries = 0;
  for (const bundle of manifest.bundles) {
    if (
      typeof bundle.runtimePath !== 'string' ||
      !/^runtime(?:-[a-z0-9]{8})?\.js$/.test(bundle.runtimePath) ||
      code.has(bundle.runtimePath) ||
      (bundle.runtimePath === 'runtime.js' ? bundle.kind !== 'entry-point' : bundle.kind !== 'chunk')
    )
      throw Error('Invalid or duplicate CE runtime bundle');
    const bytes = await ownedFile(resolve(directory, bundle.runtimePath));
    if (bytes.length > 1024 * 1024) throw Error('CE runtime bundle exceeds repository file-size limit');
    if (hash(bytes) !== bundle.sha256) throw Error('CE runtime bundle checksum differs');
    if (bundle.kind === 'entry-point') entries++;
    code.set(bundle.runtimePath, bytes.toString());
  }
  const present = (await readdir(directory)).filter((name) => /^runtime.*\.js$/.test(name));
  if (
    entries !== 1 ||
    !code.has('runtime.js') ||
    present.length !== code.size ||
    present.some((name) => !code.has(name))
  )
    throw Error('CE runtime bundle inventory differs');
  const transpiler = new Bun.Transpiler({ loader: 'js' });
  let references = 0;
  let imports = 0;
  for (const source of code.values()) {
    for (const imported of transpiler.scanImports(source)) {
      const path = imported.path;
      if (path.startsWith('node:') || path === 'bun' || path.startsWith('bun:') || builtins.has(path)) continue;
      if (!path.startsWith('./') || !code.has(path.slice(2)))
        throw Error('CE runtime imports an unbundled or foreign module');
      imports++;
    }
    for (const match of source.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)) {
      if (/^[a-z]+:\/\//i.test(match[1])) continue;
      const path = match[1].replace(/^\.\//, '');
      if (!seen.has(path)) throw Error('CE runtime references an unbundled or foreign asset');
      references++;
    }
  }
  return { assets: seen.size, references, bundles: code.size, imports };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const plugin of ['platform', 'aws', 'azure', 'terraform'])
    console.log(
      JSON.stringify({ plugin, ...(await verifyCeRuntimeAssets(resolve(import.meta.dir, '../plugins', plugin))) }),
    );
}
