import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { dirname, relative, resolve, sep } from 'node:path';

const name = process.argv[2];
if (!['aws', 'azure', 'platform', 'terraform'].includes(name)) throw new Error('Select an existing CE runtime plugin');
const repository = resolve(import.meta.dir, '..');
const root = resolve(repository, 'plugins', name);
const assets = new Map<string, { source: string; runtimePath: string }>();
const result = await Bun.build({
  entrypoints: [resolve(root, 'src/index.ts')],
  target: 'bun',
  plugins: [
    {
      name: 'ce-runtime-owned-assets',
      setup(builder) {
        builder.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
          if (!path.startsWith(`${repository}${sep}plugins${sep}`) || path.includes(`${sep}node_modules${sep}`)) return;
          const source = await readFile(path, 'utf8');
          const contents = source.replace(
            /new URL\(\s*(['"])([^'"]+)\1\s*,\s*import\.meta\.url\s*\)/g,
            (expression, _quote: string, value: string) => {
              if (/^[a-z]+:\/\//i.test(value)) return expression;
              const target = resolve(dirname(path), value);
              const sourcePath = relative(repository, target);
              if (sourcePath.startsWith('..') || sourcePath.startsWith(sep))
                throw new Error('CE asset escaped repository ownership');
              const runtimePath = `assets/${sourcePath.split(sep).join('/')}`;
              assets.set(sourcePath, { source: target, runtimePath });
              return `new URL(${JSON.stringify(`./${runtimePath}`)}, import.meta.url)`;
            },
          );
          return { contents, loader: 'ts' };
        });
      },
    },
  ],
});
if (!result.success || result.outputs.length !== 1) throw new Error('CE runtime build failed');
const builtins = new Set(builtinModules.map((value) => value.replace(/^node:/, '')));
const content = (await result.outputs[0].text()).replace(/from "([^"]+)"/g, (match, module: string) =>
  builtins.has(module) ? `from "node:${module}"` : match,
);
const output = resolve(root, 'dist/runtime.js');
await mkdir(dirname(output), { recursive: true });
await rm(resolve(root, 'dist/assets'), { recursive: true, force: true });
const manifest = [];
for (const [sourcePath, asset] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
  const bytes = await readFile(asset.source);
  const target = resolve(root, 'dist', asset.runtimePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  manifest.push({
    sourcePath,
    runtimePath: asset.runtimePath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  resolve(root, 'dist/runtime-assets.json'),
  JSON.stringify({ schemaVersion: 1, plugin: name, assets: manifest }, null, 2) + '\n',
);
await writeFile(output, `// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.\n${content}`);
const format = Bun.spawn(
  [
    'bunx',
    '@biomejs/biome@2.5.15',
    'check',
    '--write',
    '--linter-enabled=false',
    output,
    resolve(root, 'dist/runtime-assets.json'),
  ],
  { cwd: repository, stdout: 'pipe', stderr: 'pipe' },
);
if ((await format.exited) !== 0) throw new Error('CE runtime formatting failed');
