import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// This is a migration baseline, not a presentation or host-acceptance exemption.
const salesforceLegacyTools = new Set([
  'sf_query',
  'sf_describe',
  'sf_org_display',
  'sf_pipeline_report',
  'sf_help',
  'sf_exec',
]);
export function rendererOwnershipErrors(plugin, tools) {
  const errors = [];
  for (const tool of tools) {
    if (typeof tool.renderCall !== 'function' && typeof tool.renderResult !== 'function') continue;
    if (plugin === 'salesforce' && salesforceLegacyTools.has(tool.name)) continue;
    errors.push(
      `${plugin}.${tool.name}: terminal rendering is runtime-owned${plugin === 'salesforce' ? '; unqualified legacy override' : ''}`,
    );
  }
  return errors;
}
const normalizer = new Bun.Transpiler({ loader: 'ts', minifyWhitespace: true });
const normalized = (source) => normalizer.transformSync(source);
export function sourceOwnershipErrors(root, catalog, registeredEntrypoints = []) {
  const errors = [];
  const presentationRoot = join(root, 'plugins/salesforce/src/presentation');
  const privatePath = join(presentationRoot, 'renderer.ts');
  const baseline = existsSync(privatePath) ? normalized(readFileSync(privatePath, 'utf8')) : '';
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
    if (plugin.name === 'salesforce') continue;
    const files = [];
    const pluginRoot = resolve(root, plugin.source);
    walk(pluginRoot, files);
    files.push(...registeredEntrypoints.filter((file) => file.startsWith(`${pluginRoot}${sep}`)));
    for (const file of new Set(files)) {
      const source = readFileSync(file, 'utf8').replace(/^#![^\n]*(?:\n|$)/, '');
      const path = relative(root, file);
      if (baseline.length >= 40 && normalized(source).includes(baseline))
        errors.push(`${path}: copy of Salesforce private renderer`);
      const imports = new Bun.Transpiler({ loader: file.endsWith('.ts') ? 'ts' : 'js' }).scanImports(source);
      for (const item of imports) {
        const imported = item.path.startsWith('.') ? resolve(dirname(file), item.path) : item.path;
        if (
          imported === presentationRoot ||
          imported.startsWith(`${presentationRoot}/`) ||
          imported === `${presentationRoot}.ts` ||
          /xcsh-salesforce(?:\/src)?\/presentation(?:\/|$)/.test(imported)
        )
          errors.push(`${path}: imports Salesforce private renderer`);
        if (/@f5-sales-demo\/xcsh\/src\//.test(imported) || /node_modules\/@f5-sales-demo\/xcsh\/src\//.test(imported))
          errors.push(`${path}: imports runtime internals instead of the public injected API`);
      }
    }
  }
  return errors;
}
