import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const banner = [
  '// codespell:ignore ambiguos notin',
  '// biome-ignore-all lint: generated bundle',
  '// biome-ignore-all format: generated bundle',
  '// biome-ignore-all assist/source/organizeImports: generated bundle',
].join('\n');
const temporary = mkdtempSync(resolve(tmpdir(), 'asm-migration-bundle-'));
try {
  const output = resolve(temporary, 'runtime.js');
  const result = Bun.spawnSync([
    'bun',
    'build',
    'src/runtime.ts',
    '--target=bun',
    '--format=esm',
    `--outfile=${output}`,
    `--banner=${banner}`,
  ]);
  if (result.exitCode !== 0) process.exit(result.exitCode);
  const expected = readFileSync(resolve(root, 'dist/runtime.js'));
  const actual = readFileSync(output);
  if (!expected.equals(actual)) {
    console.error('dist/runtime.js is stale; run bun run build');
    process.exit(1);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
