import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const runtimeRoot = process.env.XCSH_RELEASE_PACKAGE;
if (!runtimeRoot) throw new Error('XCSH_RELEASE_PACKAGE must identify the released xcsh package');
const {
  MarketplaceManager,
  getMarketplacesRegistryPath,
  getInstalledPluginsRegistryPath,
  getMarketplacesCacheDir,
  getPluginsCacheDir,
} = await import(path.join(runtimeRoot, 'src/extensibility/plugins/marketplace/index.ts'));
const manager = new MarketplaceManager({
  marketplacesRegistryPath: getMarketplacesRegistryPath(),
  installedRegistryPath: getInstalledPluginsRegistryPath(),
  marketplacesCacheDir: getMarketplacesCacheDir(),
  pluginsCacheDir: getPluginsCacheDir(),
});
// Package installation deliberately calls the released manager directly: native setup is a separate authorization.
await manager.refreshMarketplaces();
const names = process.argv.slice(2);
for (const name of names) {
  const entry = await manager.installPlugin(name, 'f5-sales-demo-marketplace', { force: true, scope: 'user' });
  const files: Array<{ path: string; sha256: string }> = [];
  async function walk(dir: string) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      const absolute = path.join(dir, item.name);
      if (item.isDirectory()) await walk(absolute);
      else if (item.isFile())
        files.push({
          path: path.relative(entry.installPath, absolute),
          sha256: createHash('sha256')
            .update(await readFile(absolute))
            .digest('hex'),
        });
    }
  }
  await walk(entry.installPath);
  files.sort((a, b) => a.path.localeCompare(b.path));
  console.log(JSON.stringify({ plugin: name, version: entry.version, setupExecuted: false, files }));
}
