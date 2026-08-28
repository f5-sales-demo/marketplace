import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

test('manifest versions and public names agree', () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(resolve(root, '.xcsh-plugin/plugin.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(resolve(root, 'contracts/provenance.json'), 'utf8'));
  expect(packageJson.version).toBe('1.0.1');
  expect(packageJson.xcsh.version).toBe(packageJson.version);
  expect(plugin.version).toBe(packageJson.version);
  expect(provenance.commit).toBe('3ce4b0b270f35cbd35aeb93cbe35c3d23a74542e');
});

test('commands and skill route through native tools', () => {
  const validate = readFileSync(resolve(root, 'commands/validate.md'), 'utf8');
  const convert = readFileSync(resolve(root, 'commands/convert.md'), 'utf8');
  const skill = readFileSync(resolve(root, 'skills/asm-migration/SKILL.md'), 'utf8');
  expect(validate).toContain('asm_migration_validate');
  expect(validate).toContain('exactly once');
  expect(validate).toContain('Do not call');
  expect(convert).toContain('asm_migration_convert');
  expect(convert).toContain('ask only for the missing');
  expect(convert).toContain('exactly once');
  expect(convert).toContain('Do not call');
  expect(skill).toContain('exactly one native tool');
  expect(skill).toContain('never infer');
  expect(skill).toContain('Refuse without calling any tool');
  for (const instructions of [validate, convert, skill]) {
    expect(instructions).toContain('deployment');
    expect(instructions).toContain('network');
  }
  expect(skill).toContain('unsuitable for deployment');
  expect(skill).toContain('Do not create a fifth output file');
  expect(validate).toContain('allowed_tools:\n  - asm_migration_validate');
  expect(convert).toContain('allowed_tools:\n  - asm_migration_convert');
});

test('extension runtime is bundled and offline', () => {
  const index = readFileSync(resolve(root, 'src/index.ts'), 'utf8');
  const runtime = readFileSync(resolve(root, 'dist/runtime.js'), 'utf8');
  expect(index).toContain('../dist/runtime.js');
  expect(runtime.length).toBeGreaterThan(100_000);
  for (const forbidden of ['fetch(', 'http.request', 'https.request', 'child_process', 'Bun.spawn('])
    expect(runtime).not.toContain(forbidden);
});

test('contract digest and bundled runtime are current', () => {
  const provenance = JSON.parse(readFileSync(resolve(root, 'contracts/provenance.json'), 'utf8'));
  const digest = createHash('sha256')
    .update(readFileSync(resolve(root, 'contracts/f5xc-create-v1.json')))
    .digest('hex');
  expect(digest).toBe(provenance.bundle_sha256);
  const check = Bun.spawnSync(['bun', 'run', 'scripts/check-bundle.ts'], { cwd: root });
  expect(new TextDecoder().decode(check.stderr)).toBe('');
  expect(check.exitCode).toBe(0);
});
