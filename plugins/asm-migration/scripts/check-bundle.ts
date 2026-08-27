import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const temporary = mkdtempSync(resolve(tmpdir(), 'asm-migration-bundle-'));
try {
  const output = resolve(temporary, 'runtime.js');
  const result = Bun.spawnSync(
    ['bun', 'build', 'src/runtime.ts', '--target=bun', '--format=esm', `--outfile=${output}`],
    { cwd: root, stdout: 'inherit', stderr: 'inherit' },
  );
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
