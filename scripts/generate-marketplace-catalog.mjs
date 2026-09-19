#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pluginsRoot = join(root, 'plugins');
const catalogPath = join(root, '.xcsh-plugin', 'marketplace.json');
const check = process.argv.includes('--check');

const directories = (await readdir(pluginsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const plugins = [];
for (const directory of directories) {
  const manifestPath = join(pluginsRoot, directory, '.xcsh-plugin', 'plugin.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!manifest.marketplace || !manifest.lifecycle) {
    throw new Error(`${directory}: manifest must declare marketplace and lifecycle metadata`);
  }
  const { marketplace, lifecycle, ...identity } = manifest;
  if (!['content', 'on_demand', 'integrated'].includes(lifecycle.mode)) {
    throw new Error(`${directory}: invalid lifecycle mode`);
  }
  if (!Array.isArray(lifecycle.integrations) || !Array.isArray(lifecycle.requirements)) {
    throw new Error(`${directory}: invalid lifecycle declaration`);
  }
  if (lifecycle.mode === 'content' && (lifecycle.integrations.length || lifecycle.setupRequired)) {
    throw new Error(`${directory}: content plugins cannot declare integrations or setup`);
  }
  plugins.push({ order: marketplace.order, entry: { ...identity, ...marketplace.catalog, lifecycle } });
}

plugins.sort((left, right) => left.order - right.order);
const previous = JSON.parse(await readFile(catalogPath, 'utf8'));
const generated = { ...previous, plugins: plugins.map(({ entry }) => entry) };
const output = `${JSON.stringify(generated, null, 2)}\n`;
if (check) {
  const current = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(generated)) {
    throw new Error('marketplace catalog is not generated from plugin manifests');
  }
} else {
  await writeFile(catalogPath, output);
}
