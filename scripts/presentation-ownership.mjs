import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

export function rendererOwnershipErrors(plugin, tools) {
  const errors = [];
  for (const tool of tools) {
    if (typeof tool.renderCall !== 'function' && typeof tool.renderResult !== 'function') continue;
    errors.push(
      `${plugin}.${tool.name}: terminal rendering is runtime-owned${plugin === 'salesforce' ? '; unqualified legacy override' : ''}`,
    );
  }
  return errors;
}
const normalizer = new Bun.Transpiler({ loader: 'ts', minifyWhitespace: true });
const normalized = (source) => normalizer.transformSync(source);
const pinned = JSON.parse(
  readFileSync(new URL('./salesforce-2.3.11-renderer-signatures.json', import.meta.url), 'utf8'),
);
const signatures = new Set(pinned.signatures);
function copiedRenderer(source) {
  const tokens = normalized(source).match(/\w+|[^\w\s]/g) ?? [];
  const found = new Set();
  for (let i = 0; i + pinned.window <= tokens.length; i++) {
    const digest = createHash('sha256')
      .update(tokens.slice(i, i + pinned.window).join('\0'))
      .digest('hex');
    if (signatures.has(digest)) found.add(digest);
    if (found.size >= 3) return true;
  }
  return false;
}
export function sourceOwnershipErrors(root, catalog, registeredEntrypoints = []) {
  const errors = [];
  const presentationRoot = join(root, 'plugins/salesforce/src/presentation');
  function walk(dir, files) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !['node_modules', 'test', 'tests', 'benchmarks', 'fixtures'].includes(entry.name))
        walk(path, files);
      else if (entry.isFile() && /\.(?:ts|js|mjs|cjs)$/.test(entry.name) && !/\.test\./.test(entry.name))
        files.push(path);
    }
  }
  for (const plugin of catalog.plugins) {
    const files = [];
    const pluginRoot = resolve(root, plugin.source);
    walk(pluginRoot, files);
    files.push(...registeredEntrypoints.filter((file) => file.startsWith(`${pluginRoot}${sep}`)));
    for (const file of new Set(files)) {
      const source = readFileSync(file, 'utf8').replace(/^#![^\n]*(?:\n|$)/, '');
      const path = relative(root, file);
      if (copiedRenderer(source)) errors.push(`${path}: copy of Salesforce private renderer`);
      const imports = new Bun.Transpiler({ loader: file.endsWith('.ts') ? 'ts' : 'js' }).scanImports(source);
      for (const item of imports) {
        const imported = item.path.startsWith('.') ? resolve(dirname(file), item.path) : item.path;
        if (
          plugin.name !== 'salesforce' &&
          (imported === presentationRoot ||
            imported.startsWith(`${presentationRoot}/`) ||
            imported === `${presentationRoot}.ts` ||
            /xcsh-salesforce(?:\/src)?\/presentation(?:\/|$)/.test(imported))
        )
          errors.push(`${path}: imports Salesforce private renderer`);
        if (/@f5-sales-demo\/xcsh\/src\//.test(imported) || /node_modules\/@f5-sales-demo\/xcsh\/src\//.test(imported))
          errors.push(`${path}: imports runtime internals instead of the public injected API`);
      }
    }
  }
  return errors;
}
