import { mkdir, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';

const name = process.argv[2];
if (!['aws', 'platform', 'terraform'].includes(name)) throw new Error('Select an existing CE runtime plugin');
const root = resolve(import.meta.dir, '..', 'plugins', name);
const result = await Bun.build({ entrypoints: [resolve(root, 'src/index.ts')], target: 'bun' });
if (!result.success || result.outputs.length !== 1) throw new Error('CE runtime build failed');
const builtins = new Set(builtinModules.map((value) => value.replace(/^node:/, '')));
const content = (await result.outputs[0].text()).replace(/from "([^"]+)"/g, (match, module: string) =>
  builtins.has(module) ? `from "node:${module}"` : match,
);
const output = resolve(root, 'dist/runtime.js');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.\n${content}`);
const format = Bun.spawn(['bunx', '@biomejs/biome@2.5.15', 'check', '--write', '--linter-enabled=false', output], {
  cwd: resolve(import.meta.dir, '..'),
  stdout: 'pipe',
  stderr: 'pipe',
});
if ((await format.exited) !== 0) throw new Error('CE runtime formatting failed');
