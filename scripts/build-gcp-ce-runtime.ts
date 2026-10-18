import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
for (const plugin of ['gcloud', 'platform', 'terraform']) {
  const output = join(root, 'plugins', plugin, 'runtime');
  await mkdir(output, { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(root, 'plugins', plugin, 'src', 'index.ts')],
    outdir: output,
    naming: 'index.js',
    target: 'bun',
    external: ['@f5-sales-demo/xcsh', '@f5-sales-demo/xcsh/*'],
    minify: false,
    sourcemap: 'none',
  });
  if (!result.success) throw new AggregateError(result.logs, `${plugin} CE runtime build failed`);
  console.log(`${plugin}: bundled ${result.outputs.length} runtime artifact`);
}
