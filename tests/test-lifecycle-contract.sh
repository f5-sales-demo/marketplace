#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$repo_root/scripts/generate-marketplace-catalog.mjs" --check

node --input-type=module - "$repo_root" <<'NODE'
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
const pluginsRoot = join(root, 'plugins');
const catalog = JSON.parse(await readFile(join(root, '.xcsh-plugin', 'marketplace.json')));
if (catalog.plugins.some((plugin) => Object.hasOwn(plugin, 'prerequisites'))) {
  throw new Error('marketplace catalog contains legacy executable prerequisites');
}
const expected = new Set([
  'asm-migration', 'aws', 'azure', 'cloudstatus', 'devcontainer', 'firecrawl', 'gcloud', 'github',
  'gitlab', 'kvm', 'platform', 'salesforce', 'terraform', 'herdr',
]);
const manifests = new Map();
for (const entry of await readdir(pluginsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const plugin = JSON.parse(await readFile(join(pluginsRoot, entry.name, '.xcsh-plugin', 'plugin.json')));
  const lifecycle = plugin.lifecycle;
  if (!lifecycle || !['content', 'on_demand', 'integrated'].includes(lifecycle.mode)) {
    throw new Error(`${entry.name}: exactly one lifecycle classification is required`);
  }
  const ids = lifecycle.integrations ?? [];
  for (const field of ['integrations', 'requirements', 'collectedData', 'pluginDependencies']) {
    if (!Array.isArray(lifecycle[field]) || lifecycle[field].some((value) => typeof value !== 'string' || !value)) {
      throw new Error(`${entry.name}: lifecycle.${field} must contain non-empty strings`);
    }
  }
  if (Object.hasOwn(plugin, 'prerequisites')) throw new Error(`${entry.name}: legacy prerequisites remain`);
  if (/[;&]|\$\(|\r|\n/.test(JSON.stringify(lifecycle))) {
    throw new Error(`${entry.name}: lifecycle metadata contains executable shell syntax`);
  }
  if (ids.length !== new Set(ids).size) throw new Error(`${entry.name}: duplicate integration id`);
  if (lifecycle.mode === 'content' && (ids.length || lifecycle.collectedData.length || lifecycle.setupRequired)) {
    throw new Error(`${entry.name}: content lifecycle must not collect data or require setup`);
  }
  if (expected.has(entry.name) && lifecycle.mode === 'content') {
    throw new Error(`${entry.name}: runtime plugin cannot be content-only`);
  }
  const sourceFiles = [];
  async function walk(directory) {
    for (const child of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, child.name);
      if (child.isDirectory()) await walk(path);
      else if (child.name.endsWith('.ts')) sourceFiles.push(path);
    }
  }
  for (const directory of ['src', 'extensions']) {
    const path = join(pluginsRoot, entry.name, directory);
    try {
      await access(path);
      await walk(path);
    } catch {}
  }
  const source = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n');
  const registered = [...source.matchAll(/integrations\.register(?:<[^>]+>)?\(\{[\s\S]*?\bid:\s*['"]([a-z][a-z0-9_-]*)['"]/g)]
    .map((match) => match[1]);
  if (JSON.stringify([...registered].sort()) !== JSON.stringify([...ids].sort())) {
    throw new Error(`${entry.name}: manifest integrations ${ids} do not match runtime registrations ${registered}`);
  }
  if (/registerServiceStatus|registerCommand\(['"][^'"]+:setup/.test(source)) {
    throw new Error(`${entry.name}: legacy status or provider setup registration remains`);
  }
  if (/name:\s*['"](?:sf_setup|glab_setup)['"]/.test(source)) {
    throw new Error(`${entry.name}: model-callable authentication tool remains`);
  }
  manifests.set(entry.name, lifecycle);
}

const owners = new Map();
for (const [plugin, lifecycle] of manifests) {
  for (const id of lifecycle.integrations) {
    if (owners.has(id)) throw new Error(`integration ${id} is declared by both ${owners.get(id)} and ${plugin}`);
    owners.set(id, plugin);
  }
  for (const dependency of lifecycle.pluginDependencies) {
    if (!manifests.has(dependency)) throw new Error(`${plugin}: unknown plugin dependency ${dependency}`);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(plugin) {
  if (visiting.has(plugin)) throw new Error(`plugin dependency cycle includes ${plugin}`);
  if (visited.has(plugin)) return;
  visiting.add(plugin);
  for (const dependency of manifests.get(plugin).pluginDependencies) visit(dependency);
  visiting.delete(plugin);
  visited.add(plugin);
}
for (const plugin of manifests.keys()) visit(plugin);
NODE
