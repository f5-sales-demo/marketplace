import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

// The inventory harness and plugin dependencies use different native SDK builds.
// Keep their native modules in separate processes, as in the installed runtime.
test('Marketplace terms guidance is readable through the declared plugin resource', async () => {
  const root = resolve(import.meta.dir, '..');
  const script = `
    import { parseInternalUrl } from './node_modules/@f5-sales-demo/xcsh/src/internal-urls/parse';
    import { createPluginResolver } from './node_modules/@f5-sales-demo/xcsh/src/internal-urls/plugin-resolve';
    const resolver = createPluginResolver(async () => [{ plugin: 'azure', version: 'test', path: process.cwd() }]);
    const resource = await resolver.resolve(parseInternalUrl('xcsh://plugin/azure/marketplace-terms'));
    const parsed = Bun.YAML.parse(resource.content.split('---')[1]);
    const index = await resolver.resolve(parseInternalUrl('xcsh://plugin/azure/skills'));
    process.stdout.write(JSON.stringify({ name: parsed.name, contentType: resource.contentType, sourcePath: resource.sourcePath, directory: JSON.parse(index.content).directory }));
  `;
  const child = Bun.spawn(['bun', '-e', script], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Resource reader process failed: ${stderr}`);
  const result = JSON.parse(stdout);
  expect(result.name).toBe('azure-marketplace-terms');
  expect(result.contentType).toBe('text/markdown');
  expect(result.sourcePath).toBe(resolve(root, 'skills/azure-marketplace-terms/SKILL.md'));
  expect(result.directory).toBe(true);
}, 30000);
