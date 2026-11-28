import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
for (const name of ['gcloud', 'platform', 'terraform']) {
  test(`current ${name} source is coupled to qualified SDK25.2.3`, async () => {
    const pkg = await Bun.file(resolve(root, 'plugins', name, 'package.json')).json();
    const manifest = await Bun.file(resolve(root, 'plugins', name, '.xcsh-plugin/plugin.json')).json();
    expect(pkg.devDependencies['@f5-sales-demo/xcsh']).toBe('25.2.3');
    expect(pkg.peerDependencies['@f5-sales-demo/xcsh']).toBe('>=25.2.3');
    expect(manifest.minimumRuntimeVersion).toBe('25.2.3');
    expect(pkg.overrides['google-auth-library']).toBe('11.3.4');
  });
}
test('published-runtime validation uses current SDK without an old default', async () => {
  const pkg = await Bun.file(resolve(root, 'scripts/agent-validation-runtime/package.json')).json();
  expect(pkg.dependencies['@f5-sales-demo/xcsh']).toBe('25.2.3');
});
