import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Exact versions come from current stable registry metadata; no release-age hold applies.
const latest = {
  '@f5-sales-demo/xcsh': '25.1.2',
  '@sinclair/typebox': '0.34.52',
  '@tobilu/qmd': '2.9.0',
  '@types/bun': '1.4.5',
  '@types/tar-stream': '3.1.5',
  'bun-types': '1.4.5',
  typescript: '7.0.2',
};
for (const plugin of ['gcloud', 'terraform', 'platform']) {
  test(`${plugin} uses the current stable direct dependencies immediately`, () => {
    const manifest = JSON.parse(readFileSync(new URL(`../../../${plugin}/package.json`, import.meta.url), 'utf8'));
    for (const [name, version] of Object.entries(latest)) {
      expect(manifest.devDependencies[name]).toBe(version);
    }
    expect(manifest.devDependencies['typescript-compiler']).toBe(`npm:typescript@${latest.typescript}`);
  });
}

test('agent validation uses the current stable SDK, QMD and coherent Google auth graph', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../../scripts/agent-validation-runtime/package.json', import.meta.url), 'utf8'),
  );
  expect(manifest.dependencies['@f5-sales-demo/xcsh']).toBe(latest['@f5-sales-demo/xcsh']);
  expect(manifest.devDependencies['@tobilu/qmd']).toBe(latest['@tobilu/qmd']);
  expect(manifest.overrides?.['google-auth-library']).toBe('11.3.4');
});
