import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { convertInput, MANAGED_OUTPUT_FILES, resolveOutputDirectory, validateInput } from '../src/runtime';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});
const temporary = () => {
  const path = mkdtempSync(join(tmpdir(), 'asm-migration-test-'));
  roots.push(path);
  return path;
};
const fixtures = resolve(import.meta.dir, 'fixtures');

describe('runtime', () => {
  test('validates without writing files and resolves relative paths', async () => {
    const result = await validateInput({
      inputPath: 'test/fixtures/minimal-policy.xml',
      inputType: 'asm-policy',
      cwd: resolve(import.meta.dir, '..'),
    });
    expect(result.valid).toBe(true);
    expect(result.policy?.sourceName).toBe('minimal-policy');
  });

  test('normalizes xcsh macOS /tmp aliases only for relative output paths', () => {
    expect(resolveOutputDirectory('/tmp/asm-uat', 'output', 'darwin')).toBe('/private/tmp/asm-uat/output');
    expect(resolveOutputDirectory('/tmp/asm-uat', '/tmp/output', 'darwin')).toBe('/tmp/output');
    expect(resolveOutputDirectory('/tmp/asm-uat', 'output', 'linux')).toBe('/tmp/asm-uat/output');
  });

  test('writes exactly four deterministic files without sensitive metadata', async () => {
    const root = temporary();
    const request = {
      policyPath: resolve(fixtures, 'minimal-policy.xml'),
      signaturesPath: resolve(fixtures, 'signatures.json'),
      namespace: 'example',
      cwd: root,
    };
    await convertInput({ ...request, outputDirectory: 'first' });
    await convertInput({ ...request, outputDirectory: 'second' });
    expect(readdirSync(join(root, 'first')).sort()).toEqual([...MANAGED_OUTPUT_FILES].sort());
    for (const name of MANAGED_OUTPUT_FILES)
      expect(readFileSync(join(root, 'first', name))).toEqual(readFileSync(join(root, 'second', name)));
    const all = MANAGED_OUTPUT_FILES.map((name) => readFileSync(join(root, 'first', name), 'utf8')).join('');
    expect(all).not.toContain(root);
    expect(all).not.toContain('timestamp');
    expect(all).not.toContain('customer');
    const hashes = Object.fromEntries(
      MANAGED_OUTPUT_FILES.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(root, 'first', name)))
          .digest('hex'),
      ]),
    );
    expect(hashes).toEqual({
      'config-pack.json': '8a56ca9c1987b4df2a6cdc3c9a08dc06993057b053c52d7deb2d2b7c252905f2',
      'warnings.json': '37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570',
      'report.json': 'b09e4cfb1af2b3605766a247e3ec1d92319a87928f6864b21e614728efd96de8',
      'manifest.json': 'a64e505e08c8a0eb7d30a0fe5ffe5adbc00c407705e9a5a953c1855213407e2a',
    });
  });

  test('protects managed files and preserves unrelated files on overwrite', async () => {
    const root = temporary();
    const output = join(root, 'output');
    const request = {
      policyPath: resolve(fixtures, 'minimal-policy.xml'),
      signaturesPath: resolve(fixtures, 'signatures.json'),
      namespace: 'example',
      outputDirectory: output,
      cwd: root,
    };
    await convertInput(request);
    writeFileSync(join(output, 'notes.txt'), 'preserve me');
    await expect(convertInput(request)).rejects.toThrow('already exists');
    await convertInput({ ...request, overwrite: true });
    expect(readFileSync(join(output, 'notes.txt'), 'utf8')).toBe('preserve me');
  });

  test('rejects symlinked output directories and honors cancellation', async () => {
    const root = temporary();
    const real = join(root, 'real');
    const link = join(root, 'link');
    Bun.spawnSync(['mkdir', '-p', real]);
    symlinkSync(real, link);
    const request = {
      policyPath: resolve(fixtures, 'minimal-policy.xml'),
      signaturesPath: resolve(fixtures, 'signatures.json'),
      namespace: 'example',
      outputDirectory: link,
      cwd: root,
    };
    await expect(convertInput(request)).rejects.toThrow('symlinked');
    const controller = new AbortController();
    controller.abort();
    await expect(
      convertInput({ ...request, outputDirectory: join(root, 'other'), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('runs the installed bundle without development dependencies', () => {
    const root = temporary();
    copyFileSync(resolve(import.meta.dir, '../dist/runtime.js'), join(root, 'runtime.js'));
    copyFileSync(resolve(fixtures, 'minimal-policy.xml'), join(root, 'policy.xml'));
    const script = [
      "import { validateInput } from './runtime.js';",
      "const result = await validateInput({ inputPath: 'policy.xml', inputType: 'asm-policy', cwd: '.' });",
      "if (!result.valid || result.policy?.enforcementMode !== 'blocking') process.exit(1);",
    ].join('');
    const result = Bun.spawnSync(['bun', '--eval', script], {
      cwd: root,
      env: { PATH: process.env.PATH ?? '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(new TextDecoder().decode(result.stderr)).toBe('');
    expect(result.exitCode).toBe(0);
  });
});
