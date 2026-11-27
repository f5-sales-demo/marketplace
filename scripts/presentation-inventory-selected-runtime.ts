import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { rendererOwnershipErrors } from './presentation-ownership.mjs';

// One SDK per process avoids loading incompatible native runtime versions together.
const [runtimeRoot, home, pluginName] = process.argv.slice(2);
const { discoverAndLoadExtensions } = await import(
  pathToFileURL(join(runtimeRoot, 'src/extensibility/extensions/loader.ts')).href
);
const { clearXcshPluginRootsCache } = await import(pathToFileURL(join(runtimeRoot, 'src/discovery/helpers.ts')).href);
Object.defineProperty(Bun, 'spawnSync', {
  value: () => ({ exitCode: 0, stdout: new TextEncoder().encode('{}'), stderr: new Uint8Array() }),
});
Object.defineProperty(Bun, 'spawn', {
  value: () => {
    throw new Error('Inventory cannot execute commands');
  },
});
globalThis.fetch = async () => {
  throw new Error('Inventory cannot access services');
};
const snapshots = [];
for (const available of [true, false]) {
  Object.defineProperty(Bun, 'which', { value: (name: string) => (available ? `/synthetic/${name}` : null) });
  clearXcshPluginRootsCache({ rewarm: false });
  const loaded = await discoverAndLoadExtensions([], home, undefined, [], home);
  snapshots.push({
    available,
    errors: loaded.errors,
    extensions: loaded.extensions.map((extension: any) => ({
      path: extension.path,
      rendererErrors: rendererOwnershipErrors(
        pluginName,
        [...extension.tools.values()].map((tool: any) => tool.definition),
      ),
      collections: Object.fromEntries(
        ['tools', 'commands', 'handlers', 'integrations', 'advisories', 'messageRenderers', 'flags', 'shortcuts'].map(
          (key) => [key, [...extension[key].keys()]],
        ),
      ),
    })),
  });
}
process.stdout.write(JSON.stringify(snapshots));
