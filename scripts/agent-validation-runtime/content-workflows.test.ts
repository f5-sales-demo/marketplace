import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { visibleWidth } from './node_modules/@f5-sales-demo/pi-tui/src/index.ts';
import { parseFrontmatter } from './node_modules/@f5-sales-demo/pi-utils/src/index.ts';
import { CustomMessageComponent } from './node_modules/@f5-sales-demo/xcsh/src/modes/components/custom-message';
import { initTheme, setTheme } from './node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

// Render the shipped invocation content; do not replace it with invented output.
for (const plugin of ['docs-tools', 'sales-engineer', 'docs-pipeline', 'brand', 'meddpicc', 'osint-framework']) {
  test(`${plugin} shipped command and skill content uses the shared themed message surface`, async () => {
    await initTheme();
    const root = join(import.meta.dir, '../../plugins', plugin);
    const files = [
      ...new Bun.Glob('commands/*.md').scanSync(root),
      ...new Bun.Glob('skills/*/SKILL.md').scanSync(root),
    ];
    expect(files.length).toBeGreaterThan(1);
    for (const path of files) {
      const source = await Bun.file(join(root, path)).text();
      const { body } = parseFrontmatter(source);
      expect(body.trim().length).toBeGreaterThan(20);
      const message = { customType: plugin, content: body, display: true };
      const original = structuredClone(message);
      for (const theme of ['xcsh-dark', 'xcsh-light']) {
        expect((await setTheme(theme)).success).toBe(true);
        const component = new CustomMessageComponent(message as never);
        component.setExpanded(true);
        for (const width of [40, 76, 120, 153]) {
          const lines = component.render(width);
          expect(lines.length).toBeGreaterThan(0);
          expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        }
      }
      expect(message).toEqual(original);
    }
  });
}

import regionalEdge from '../../plugins/cloudstatus/extensions/regional-edge-advisories';

test('Cloudstatus actual advisory retains its corrective guidance through themed messages', async () => {
  await initTheme();
  let registration: any;
  regionalEdge({
    integrations: { register() {} },
    advisories: {
      register(value: unknown) {
        registration = value;
        return () => {};
      },
      unregister() {
        return false;
      },
    },
    on() {},
  } as never);
  const advisories = registration.match({
    toolCallId: 'synthetic-collector',
    toolName: 'bash',
    input: {
      command:
        'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"',
      async: true,
    },
  });
  expect(advisories.map((value: any) => value.code)).toContain('cloudstatus.skill_read_recommended');
  expect(advisories.map((value: any) => value.code)).toContain('cloudstatus.foreground_collection_recommended');
  for (const value of advisories) {
    for (const theme of ['xcsh-dark', 'xcsh-light']) {
      await setTheme(theme);
      const component = new CustomMessageComponent({
        customType: value.code,
        content: value.message,
        display: true,
      } as never);
      for (const width of [40, 76, 120, 153]) {
        const lines = component.render(width);
        expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
        expect(lines.length).toBeGreaterThan(0);
      }
    }
  }
});
