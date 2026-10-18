import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rendererOwnershipErrors, sourceOwnershipErrors } from '../scripts/presentation-ownership.mjs';

test('domain adapters use shared presentation while Salesforce legacy override stays explicit', () => {
  expect(rendererOwnershipErrors('aws', [{ name: 'aws_exec', presentation: { result() {} } }])).toEqual([]);
  expect(rendererOwnershipErrors('aws', [{ name: 'aws_exec', renderResult() {} }]).join()).toContain('runtime-owned');
  expect(rendererOwnershipErrors('salesforce', [{ name: 'sf_query', renderResult() {} }])).toEqual([]);
  expect(rendererOwnershipErrors('salesforce', [{ name: 'new_tool', renderResult() {} }]).join()).toContain(
    'unqualified',
  );
});
test('source imports cannot bypass shared renderer ownership or copy Salesforce private layout', () => {
  const root = mkdtempSync(join(tmpdir(), 'renderer-ownership-'));
  try {
    mkdirSync(join(root, 'plugins/salesforce/src/presentation'), { recursive: true });
    mkdirSync(join(root, 'plugins/aws/src'), { recursive: true });
    const privateRenderer =
      '// Private renderer header\nexport function wrapWords(text) { return text.split(/\\s+/).map(word => word.trim()); }';
    writeFileSync(join(root, 'plugins/salesforce/src/presentation/renderer.ts'), privateRenderer);
    const catalog = {
      plugins: [
        { name: 'salesforce', source: './plugins/salesforce' },
        { name: 'aws', source: './plugins/aws' },
      ],
    };
    writeFileSync(
      join(root, 'plugins/aws/src/layout.ts'),
      "import { component } from '../../salesforce/src/presentation/renderer';",
    );
    expect(sourceOwnershipErrors(root, catalog).join()).toContain('Salesforce private');
    writeFileSync(join(root, 'plugins/aws/src/layout.ts'), "await import('../../salesforce/src/presentation');");
    expect(sourceOwnershipErrors(root, catalog).join()).toContain('Salesforce private');
    writeFileSync(
      join(root, 'plugins/aws/src/layout.ts'),
      "import { PluginViewComponent } from '@f5-sales-demo/xcsh/src/modes/components/plugin-view';",
    );
    expect(sourceOwnershipErrors(root, catalog).join()).toContain('runtime internals');
    writeFileSync(
      join(root, 'plugins/aws/src/layout.ts'),
      privateRenderer.replace('// Private renderer header\n', '').replace(/ /g, '  '),
    );
    expect(sourceOwnershipErrors(root, catalog).join()).toContain('copy');
    writeFileSync(
      join(root, 'plugins/aws/src/layout.ts'),
      "import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation'; export const adapter = (p: PresentationAPI) => p.data({total:0});",
    );
    expect(sourceOwnershipErrors(root, catalog)).toEqual([]);
    writeFileSync(join(root, 'plugins/aws/src/layout.ts'), '#!/usr/bin/env bun\nexport const count = 0;');
    expect(sourceOwnershipErrors(root, catalog)).toEqual([]);
    mkdirSync(join(root, 'plugins/aws/tests'), { recursive: true });
    const registeredTestNamedFile = join(root, 'plugins/aws/tests/integration.test.ts');
    writeFileSync(registeredTestNamedFile, "import { component } from '../../salesforce/src/presentation/renderer';");
    expect(sourceOwnershipErrors(root, catalog, [registeredTestNamedFile]).join()).toContain('Salesforce private');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
