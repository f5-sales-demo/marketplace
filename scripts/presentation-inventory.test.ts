import { expect, spyOn, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { clearXcshPluginRootsCache } from './agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/discovery/helpers';
import { discoverAndLoadExtensions } from './agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/loader';
import {
  parseTasks,
  reconcileTasks,
  renderTracker,
  seedTasks,
  shippedFiles,
  stableName,
  validateTasks,
} from './presentation-tracker.mjs';

interface Surface {
  id: string;
  scope: string;
  fingerprint: string;
}
interface CatalogPlugin {
  name: string;
  source: string;
  version: string;
  lifecycle: { mode: string };
}
interface InventoryPlugin {
  name: string;
  source: string;
  version: string;
  mode: string;
  fingerprint: string;
  surfaces: Surface[];
}
const root = resolve(import.meta.dir, '..');
const trackerPath = join(root, 'docs/marketplace-presentation-todo.md');
const hash = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

test('canonical presentation tracker covers actual registrations and every shipped content surface', async () => {
  const catalog = JSON.parse(readFileSync(join(root, '.xcsh-plugin/marketplace.json'), 'utf8')) as {
    plugins: CatalogPlugin[];
  };
  const runtime = JSON.parse(
    readFileSync(
      join(import.meta.dir, 'agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/package.json'),
      'utf8',
    ),
  ).version;
  expect(catalog.plugins).toHaveLength(23);
  expect(new Set(catalog.plugins.map((p) => p.name)).size).toBe(23);
  const inventory: InventoryPlugin[] = catalog.plugins.map((plugin) => {
    const manifest = JSON.parse(readFileSync(join(root, plugin.source, '.xcsh-plugin/plugin.json'), 'utf8'));
    expect(manifest.name).toBe(plugin.name);
    expect(manifest.version).toBe(plugin.version);
    expect(manifest.lifecycle).toEqual(plugin.lifecycle);
    const paths = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', plugin.source],
      { cwd: root },
    )
      .toString()
      .split('\0')
      .filter(Boolean)
      .sort();
    // Include all shipped dependencies/references; changes reopen acceptance conservatively.
    const fingerprint = hash(
      `${runtime}\n${paths.map((path) => `${path}\n${hash(readFileSync(join(root, path)))}`).join('\n')}`,
    );
    const surfaces = shippedFiles(root, plugin).map((surface: Surface) => ({ ...surface, fingerprint }));
    surfaces.push({
      id: `${plugin.name}.lifecycle.status`,
      scope: `marketplace lifecycle status: ${plugin.source}/.xcsh-plugin/plugin.json (mode=${manifest.lifecycle.mode})`,
      fingerprint,
    });
    if (manifest.lifecycle.setupRequired)
      surfaces.push({
        id: `${plugin.name}.lifecycle.setup`,
        scope: `marketplace setup/review/verification: ${plugin.source}/.xcsh-plugin/plugin.json`,
        fingerprint,
      });
    return {
      name: plugin.name,
      source: plugin.source,
      version: plugin.version,
      mode: manifest.lifecycle.mode,
      fingerprint,
      surfaces,
    };
  });
  const home = await mkdtemp(join(tmpdir(), 'marketplace-tracker-inventory-'));
  await mkdir(join(home, '.xcsh/plugins'), { recursive: true });
  await writeFile(
    join(home, '.xcsh/plugins/installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: Object.fromEntries(
        catalog.plugins.map((p) => [
          `${p.name}@fixture`,
          [{ scope: 'user', installPath: resolve(root, p.source), version: p.version }],
        ]),
      ),
    }),
  );
  const which = spyOn(Bun, 'which');
  const sync = spyOn(Bun, 'spawnSync').mockReturnValue({
    exitCode: 0,
    stdout: new TextEncoder().encode('{}'),
    stderr: new Uint8Array(),
  } as never);
  const spawn = spyOn(Bun, 'spawn').mockImplementation(() => {
    throw new Error('Inventory cannot execute commands');
  });
  const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Inventory cannot access services'));
  try {
    for (const available of [true, false]) {
      clearXcshPluginRootsCache({ rewarm: false });
      which.mockImplementation((name) => (available ? `/synthetic/${name}` : null));
      const loaded = await discoverAndLoadExtensions([], home, undefined, [], home);
      expect(loaded.errors).toEqual([]);
      for (const extension of loaded.extensions.filter((e) => e.path.startsWith(`${root}/plugins/`))) {
        const plugin = inventory.find((p) => extension.path.startsWith(`${resolve(root, p.source)}/`));
        if (!plugin) throw new Error(`Unmapped registration: ${extension.path}`);
        const origin = relative(root, extension.path);
        for (const [collection, kind] of [
          ['tools', 'tool'],
          ['commands', 'command'],
          ['handlers', 'lifecycle'],
          ['integrations', 'lifecycle'],
          ['advisories', 'advisory'],
          ['messageRenderers', 'message'],
          ['flags', 'flag'],
          ['shortcuts', 'shortcut'],
        ] as const) {
          for (const name of extension[collection].keys()) {
            const qualifier =
              collection === 'integrations' ? 'integration.' : collection === 'handlers' ? 'event.' : '';
            const id = `${plugin.name}.${kind}.${qualifier}${stableName(name)}`;
            const scope = `registered ${kind} ${qualifier}${name}: ${origin}`;
            const existing = plugin.surfaces.find((s) => s.id === id);
            if (!existing) plugin.surfaces.push({ id, scope, fingerprint: plugin.fingerprint });
            else if (!existing.scope.includes(origin))
              throw new Error(`Ambiguous invocation ID ${id}: ${existing.scope}; ${scope}`);
          }
        }
      }
    }
  } finally {
    which.mockRestore();
    sync.mockRestore();
    spawn.mockRestore();
    fetch.mockRestore();
    clearXcshPluginRootsCache({ rewarm: false });
    await rm(home, { recursive: true, force: true });
  }
  for (const plugin of inventory) {
    plugin.surfaces.sort((a, b) => a.id.localeCompare(b.id));
    expect(new Set(plugin.surfaces.map((s) => s.id)).size).toBe(plugin.surfaces.length);
  }
  expect(
    inventory.find((p) => p.name === 'salesforce')?.surfaces.filter((s) => s.id.startsWith('salesforce.tool.')),
  ).toHaveLength(6);
  const action = process.env.TRACKER_ACTION ?? 'check';
  if (!['check', 'init', 'update'].includes(action)) throw new Error('TRACKER_ACTION must be check, init or update');
  const existing = existsSync(trackerPath) ? readFileSync(trackerPath, 'utf8') : '';
  const metadata =
    action === 'init'
      ? JSON.parse(readFileSync(process.env.TRACKER_METADATA_FILE ?? '', 'utf8'))
      : JSON.parse(existing.match(/<!-- tracker-metadata\n([\s\S]+?)\n-->/)?.[1] ?? 'null');
  expect(metadata).toBeTruthy();
  metadata.startingRuntime ??= metadata.runtime;
  if (action === 'update') metadata.runtime = runtime;
  expect(metadata.runtime).toBe(runtime);
  for (const key of ['umbrella', 'tracking', 'shared', ...inventory.map((p) => p.name)])
    expect(metadata.links[key]).toMatch(/^https:\/\/github.com\/f5-sales-demo\/marketplace\/issues\/\d+$/);
  const expected = seedTasks(inventory, metadata.links);
  const tasks =
    action === 'init'
      ? expected
      : action === 'update'
        ? reconcileTasks(expected, parseTasks(existing))
        : parseTasks(existing);
  expect(validateTasks(tasks, inventory, metadata.links)).toEqual([]);
  if (action !== 'check') {
    if (action === 'init' && existing) throw new Error('Refusing to overwrite existing tracker; use update');
    writeFileSync(trackerPath, renderTracker(inventory, metadata, tasks));
  }
  const final = readFileSync(trackerPath, 'utf8');
  expect(final.match(/^## Plugin /gm)).toHaveLength(23);
  expect(
    final
      .match(/^## Plugin (.+)$/gm)
      ?.map((line) => line.slice(10).toLowerCase())
      .sort(),
  ).toEqual(inventory.map((p) => p.name).sort());
  for (const plugin of inventory) for (const surface of plugin.surfaces) expect(final).toContain(`\`${surface.id}\``);
  console.log(
    `TRACKER_VALID: 23 plugins; ${inventory.reduce((n, p) => n + p.surfaces.length, 0)} surfaces; ${tasks.length} tasks; runtime ${runtime}; action=${action}`,
  );
}, 120000);
