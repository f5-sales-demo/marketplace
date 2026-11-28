import './content-workflows.test';
import './suite-workflows.test';
import './salesforce-workflows.test';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type TUI, visibleWidth } from './node_modules/@f5-sales-demo/pi-tui/src/index.ts';
import { clearXcshPluginRootsCache } from './node_modules/@f5-sales-demo/xcsh/src/discovery/helpers';
import { discoverAndLoadExtensions } from './node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/loader';
import type { ExtensionRunner } from './node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/runner';
import { wrapRegisteredTool } from './node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/wrapper';
import { CustomMessageComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/custom-message';
import { ToolExecutionComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import { initTheme, setTheme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

// Exercise this catalog through the exact published runtime, never a source-worktree dependency.
const root = resolve(import.meta.dir, '../..');
const runtime = await Bun.file(join(import.meta.dir, 'node_modules/@f5-sales-demo/xcsh/package.json')).json();
describe('full marketplace presentation through installed-plugin discovery', () => {
  let home: string;
  test('a future minimum refuses installed discovery before loading plugin code', async () => {
    home = await mkdtemp(join(tmpdir(), 'xcsh-future-minimum-'));
    await mkdir(join(home, '.xcsh/plugins'), { recursive: true });
    const pluginRoot = join(home, 'future-plugin');
    await mkdir(join(pluginRoot, '.xcsh-plugin'), { recursive: true });
    const parts = runtime.version.split('.').map(Number);
    expect(parts).toHaveLength(3);
    const futureMinimum = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    const marker = join(pluginRoot, 'code-loaded.private.txt');
    const manifest = await Bun.file(join(root, 'plugins/salesforce/.xcsh-plugin/plugin.json')).json();
    await writeFile(
      join(pluginRoot, '.xcsh-plugin/plugin.json'),
      JSON.stringify({
        ...manifest,
        name: 'future-runtime-fixture',
        version: '1.0.0',
        minimumRuntimeVersion: futureMinimum,
        extensions: ['probe.ts'],
      }),
    );
    await writeFile(
      join(pluginRoot, 'probe.ts'),
      `import {writeFileSync} from 'node:fs'; export default function () {writeFileSync(${JSON.stringify(marker)}, 'unexpected import');}`,
    );
    await writeFile(
      join(home, '.xcsh/plugins/installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: { 'future-runtime-fixture@fixture': [{ scope: 'user', installPath: pluginRoot, version: '1.0.0' }] },
      }),
    );
    const result = await discoverAndLoadExtensions([], home, undefined, [], home);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe(pluginRoot);
    expect(result.errors[0].error).toContain(`requires xcsh ${futureMinimum} or later`);
    expect(result.extensions.filter((extension) => extension.path.startsWith(pluginRoot))).toHaveLength(0);
    expect(await Bun.file(marker).exists()).toBe(false);
  });

  const originalPath = process.env.PATH;
  afterEach(async () => {
    clearXcshPluginRootsCache({ rewarm: false });
    process.env.PATH = originalPath;
    if (home) await rm(home, { recursive: true, force: true });
  });
  test('current published runtime preserves presentation data for every admitted catalog plugin', async () => {
    home = await mkdtemp(join(tmpdir(), 'xcsh-plugin-view-'));
    await mkdir(join(home, '.xcsh', 'plugins'), { recursive: true });
    const catalog = await Bun.file(join(root, '.xcsh-plugin', 'marketplace.json')).json();
    expect(catalog.plugins).toHaveLength(22);
    const plugins = Object.fromEntries(
      catalog.plugins.map((plugin: { name: string; source: string; version: string }) => [
        `${plugin.name}@fixture`,
        [{ scope: 'user', installPath: resolve(root, plugin.source), version: plugin.version }],
      ]),
    );
    await writeFile(join(home, '.xcsh', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
    // No tool or integration probe may launch a real cloud/host command in this gate.
    const which = spyOn(Bun, 'which').mockImplementation((name) => `/synthetic/${name}`);
    const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({
      exitCode: 0,
      stdout: new TextEncoder().encode('{}'),
      stderr: new Uint8Array(),
    } as never);
    try {
      const result = await discoverAndLoadExtensions([], home, undefined, [], home);
      const higherMinimums = catalog.plugins.filter(
        (plugin: { minimumRuntimeVersion: string }) =>
          !Bun.semver.satisfies(runtime.version, `>=${plugin.minimumRuntimeVersion}`),
      );
      expect(higherMinimums.map((plugin: { name: string }) => plugin.name)).toEqual([]);
      expect(result.errors).toHaveLength(higherMinimums.length);
      for (const failure of result.errors) {
        const plugin = higherMinimums.find((entry: { source: string }) => failure.path === resolve(root, entry.source));
        expect(plugin).toBeDefined();
        expect(failure.error).toContain(`requires xcsh ${plugin.minimumRuntimeVersion} or later`);
      }
      const tools = result.extensions
        .filter((extension) => extension.path.startsWith(root))
        .flatMap((extension) => [...extension.tools.values()]);
      expect(tools.length).toBeGreaterThan(40);
      expect(tools.filter((tool) => tool.definition.name.startsWith('sf_'))).toHaveLength(6);
      for (const registered of tools) {
        expect(registered.definition.presentation).toBeDefined();
        const output = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ records: [{ total: 0, enabled: false, missing: null }], done: false }),
            },
          ],
        };
        const options = { expanded: false, isPartial: false };
        const descriptor = registered.definition.presentation;
        if (!descriptor) throw new Error(`Missing presentation for ${registered.definition.name}`);
        expect(descriptor.call?.({ count: 0, enabled: false }, options)).toBeDefined();
        const view = descriptor.result?.(output, options, {});
        const data = JSON.stringify(view);
        const opaqueZoom = registered.definition.name === 'zoom_meeting';
        if (opaqueZoom) {
          expect(view?.expandedEvidence).not.toBe('provided');
          expect(view?.warnings?.join(' ')).toContain('readiness is unverified');
        } else {
          expect(data).toContain('total');
          expect(data).toContain('false');
          expect(data).toContain('null');
        }
        expect(output.content[0].text).toContain('"total":0');
        const tool = wrapRegisteredTool(registered, { createContext: () => ({}) } as ExtensionRunner);
        for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
          await initTheme(false, preset);
          for (const name of ['xcsh-dark', 'xcsh-light']) {
            expect((await setTheme(name)).success).toBe(true);
            const component = new ToolExecutionComponent(tool.name, { count: 0, enabled: false }, {}, tool, {
              requestRender() {},
            } as TUI);
            component.updateResult(output);
            for (const expanded of [false, true]) {
              component.setExpanded(expanded);
              for (const width of [40, 76, 120, 153]) {
                const lines = component.render(width);
                expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
                if (expanded || !opaqueZoom) {
                  expect(lines.join('\n')).toContain('total');
                  expect(lines.join('\n')).toContain('false');
                  expect(lines.join('\n')).toContain('null');
                } else {
                  expect(Bun.stripANSI(lines.join('\n'))).toContain('unverified');
                }
              }
            }
            component.stopAnimation();
          }
        }
      }
      // Execute every advertised tool with unavailable dependencies. Required inputs remain
      // absent deliberately; writes, cloud access, meetings and desktop input cannot run.
      const failedSpawn = spyOn(Bun, 'spawn').mockImplementation(() => {
        throw new Error('Synthetic dependency unavailable');
      });
      const failedSync = spyOn(Bun, 'spawnSync').mockReturnValue({
        exitCode: 1,
        stdout: new Uint8Array(),
        stderr: new TextEncoder().encode('Synthetic dependency unavailable'),
      } as never);
      const unavailableFetch = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Synthetic network unavailable'));
      const executed = new Set<string>();
      try {
        for (const registered of tools) {
          const tool = wrapRegisteredTool(registered, {
            createContext: () => ({ cwd: home, hasUI: false, ui: { notify() {}, confirm: async () => false } }),
          } as never);
          let result: any;
          try {
            result = await tool.execute('suite-unavailable', {}, undefined);
          } catch (error) {
            result = {
              isError: true,
              content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
            };
          }
          expect(result.content?.length, tool.name).toBeGreaterThan(0);
          executed.add(tool.name);
          const component = new ToolExecutionComponent(tool.name, {}, {}, tool, { requestRender() {} } as never);
          component.updateResult(result);
          component.setExpanded(true);
          expect(
            component.render(40).every((line) => visibleWidth(line) <= 40),
            tool.name,
          ).toBe(true);
        }
      } finally {
        unavailableFetch.mockRestore();
        failedSync.mockRestore();
        failedSpawn.mockRestore();
      }
      expect(executed.size).toBe(tools.length);
      for (const plugin of catalog.plugins) {
        const manifest = await Bun.file(join(root, plugin.source, '.xcsh-plugin', 'plugin.json')).json();
        expect(manifest.lifecycle).toBeDefined();
        const minimumRuntime = manifest.minimumRuntimeVersion;
        expect(manifest.minimumRuntimeVersion).toBe(minimumRuntime);
        expect(plugin.minimumRuntimeVersion).toBe(minimumRuntime);
        const qualifiedRuntime =
          plugin.name === 'salesforce'
            ? (await Bun.file(join(root, 'plugins/salesforce/node_modules/@f5-sales-demo/xcsh/package.json')).json())
                .version
            : runtime.version;
        expect(Bun.semver.satisfies(qualifiedRuntime, `>=${minimumRuntime}`)).toBe(true);
        const message = new CustomMessageComponent({
          customType: plugin.name,
          content: `**${plugin.name}**\n\n| Status | Total |\n| --- | ---: |\n| ready | 0 |`,
          display: true,
        } as never);
        expect(message.render(40).every((line) => visibleWidth(line) <= 40)).toBe(true);
      }
    } finally {
      which.mockRestore();
      spawn.mockRestore();
    }
  }, 30_000);
});
