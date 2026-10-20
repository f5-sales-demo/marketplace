import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { visibleWidth } from './node_modules/@f5-sales-demo/pi-tui/src/index';
import { clearXcshPluginRootsCache } from './node_modules/@f5-sales-demo/xcsh/src/discovery/helpers';
import { discoverAndLoadExtensions } from './node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/loader';
import { CustomMessageComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/custom-message';
import { initTheme, setTheme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

test('Firecrawl installed entrypoint and shipped guidance load through the qualification runtime', async () => {
  const home = await mkdtemp(join(tmpdir(), 'firecrawl-runtime-'));
  const root = resolve(import.meta.dir, '../../plugins/firecrawl');
  const manifest = await Bun.file(join(root, '.xcsh-plugin/plugin.json')).json();
  try {
    await mkdir(join(home, '.xcsh/plugins'), { recursive: true });
    await writeFile(
      join(home, '.xcsh/plugins/installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'firecrawl@fixture': [{ scope: 'user', installPath: root, version: manifest.version }],
        },
      }),
    );
    const result = await discoverAndLoadExtensions([], home, undefined, [], home);
    expect(result.errors).toEqual([]);
    const integration = result.extensions.find((extension) => extension.path.startsWith(root));
    expect(integration).toBeDefined();
    expect([...integration!.integrations.keys()]).toEqual(['firecrawl']);
    const paths = [
      ...new Bun.Glob('{commands,agents}/*.md').scanSync(root),
      ...new Bun.Glob('skills/*/SKILL.md').scanSync(root),
    ];
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      const content = await Bun.file(join(root, path)).text();
      for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
        await initTheme(false, preset);
        for (const theme of ['xcsh-dark', 'xcsh-light']) {
          expect((await setTheme(theme)).success).toBe(true);
          const component = new CustomMessageComponent({
            customType: 'firecrawl',
            content,
            display: true,
          } as never);
          for (const expanded of [false, true]) {
            component.setExpanded(expanded);
            for (const width of [40, 76, 120, 153]) {
              const lines = component.render(width);
              expect(lines.length).toBeGreaterThan(0);
              expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
            }
          }
        }
      }
    }
  } finally {
    clearXcshPluginRootsCache({ rewarm: false });
    await rm(home, { recursive: true, force: true });
  }
});
