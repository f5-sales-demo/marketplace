import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gcpOperationalSourceIdentity } from './gcp-operational-source-identity';

const root = join(import.meta.dir, '..');
const captureScripts = [
  '__init__.py',
  'guest_pty.py',
  'gcp_guest_session.py',
  'guest_control.py',
  'guest_worker.py',
  'guest_entrypoint.py',
  'gcp_provider_process.py',
  'gcp_provider_reader.py',
];
await writeFile(
  join(root, 'plugins/terraform/src/gcp-capture-source-pins.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'gcp-original-capture-sources',
      files: Object.fromEntries(
        await Promise.all(
          captureScripts.map(async (name) => [
            name,
            createHash('sha256')
              .update(await readFile(join(root, 'plugins/terraform/scripts', name)))
              .digest('hex'),
          ]),
        ),
      ),
    },
    null,
    2,
  )}\n`,
);
await writeFile(
  join(root, 'plugins/gcloud/src/ce/operational-source-hashes.json'),
  `${JSON.stringify(await gcpOperationalSourceIdentity(root), null, 2)}\n`,
);
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
  for (const artifact of result.outputs) {
    // Bun's emitted lazy-module helper contains an assignment expression.
    // Spell the same state transition as statements for the repository lint contract.
    const raw = await readFile(artifact.path, 'utf8');
    const compatible = raw.replace(
      'res = fn(fn = 0);',
      'const initialize = fn;\n      fn = 0;\n      res = initialize();',
    );
    await writeFile(artifact.path, compatible);
  }
  const formatter = Bun.spawn(['biome', 'check', '--write', '--unsafe', output], { stdout: 'pipe', stderr: 'pipe' });
  const formatted = await new Response(formatter.stdout).text();
  const errors = await new Response(formatter.stderr).text();
  if ((await formatter.exited) !== 0) throw new Error(`Runtime lint failed: ${formatted}${errors}`);
  console.log(`${plugin}: bundled ${result.outputs.length} runtime artifact`);
}
