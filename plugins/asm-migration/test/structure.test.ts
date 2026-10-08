import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');

test('manifest versions and public names agree', () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(resolve(root, '.xcsh-plugin/plugin.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(resolve(root, 'contracts/provenance.json'), 'utf8'));
  const updater = readFileSync(resolve(root, 'scripts/update-contract.sh'), 'utf8');
  expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(packageJson.xcsh.version).toBe(packageJson.version);
  expect(plugin.version).toBe(packageJson.version);
  expect(provenance.release).toMatch(/^v\d+\.\d+\.\d+$/);
  expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(updater).toContain('gh release view');
  expect(updater).not.toMatch(/gh release view v\d/);
});

test('commands and skill provide additive capability guidance', () => {
  const files = ['commands/validate.md', 'commands/convert.md', 'commands/deploy.md', 'skills/asm-migration/SKILL.md'];
  for (const file of files) {
    const guidance = readFileSync(resolve(root, file), 'utf8');
    expect(guidance).not.toMatch(
      /allowed_tools|exactly once|exactly one native tool|Refuse without|never infer|verbatim|Do not call|Do not create a fifth|APPLY <|CLEANUP </i,
    );
    expect(guidance).toContain('context');
    expect(guidance).toContain('inspect');
  }
  const skill = readFileSync(resolve(root, files[3]!), 'utf8');
  expect(skill).toContain('preferred');
  expect(skill).toContain('untrusted');
  expect(skill).toContain('unsuitable for deployment');
  expect(skill).toContain('additional');
  const manifest = JSON.parse(readFileSync(resolve(root, '.xcsh-plugin/plugin.json'), 'utf8'));
  expect(manifest.lifecycle.pluginDependencies).toEqual([]);
});

test('extension runtime is bundled and offline', () => {
  const index = readFileSync(resolve(root, 'src/index.ts'), 'utf8');
  const runtime = readFileSync(resolve(root, 'dist/runtime.js'), 'utf8');
  expect(index).not.toMatch(/before_agent_start|agent_end|before_provider_request|ASM_ROUTER_PROMPT/);
  expect(index).toContain('../dist/runtime.js');
  expect(runtime.length).toBeGreaterThan(100_000);
  for (const forbidden of ['fetch(', 'http.request', 'https.request', 'child_process', 'Bun.spawn('])
    if (forbidden === 'fetch(') expect(runtime).toContain(forbidden);
    else expect(runtime).not.toContain(forbidden);
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

test('UAT specification covers additive tasks and deployment cases', () => {
  const spec = JSON.parse(readFileSync(resolve(root, 'uat/scenarios.json'), 'utf8'));
  expect(spec.cases.length).toBeGreaterThan(38);
  expect(spec.cases.filter((item: { id: string }) => item.id.startsWith('deploy-'))).toHaveLength(20);
  const generated = Bun.spawnSync(['bun', 'scripts/generate-uat-prompts.ts'], { cwd: root, stdout: 'pipe' });
  expect(generated.exitCode).toBe(0);
  const rows = new TextDecoder()
    .decode(generated.stdout)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(rows.filter((item) => item.style !== 'heldout')).toHaveLength(spec.cases.length * 3);
  expect(rows.filter((item) => item.style === 'heldout')).toHaveLength(20);
  expect(new Set(rows.map((item) => item.prompt)).size).toBe(spec.cases.length * 3 + 20);
  expect(rows.every((item) => item.prompt.includes('/private/tmp'))).toBeFalse();
  expect(rows.some((item) => item.prompt.includes('/tmp/asm-migration-uat'))).toBeTrue();
  const custom = Bun.spawnSync(['bun', 'scripts/generate-uat-prompts.ts'], {
    cwd: root,
    stdout: 'pipe',
    env: { ...process.env, ASM_MIGRATION_UAT_ROOT: '/tmp/asm-migration-uat-custom' },
  });
  const customRows = new TextDecoder()
    .decode(custom.stdout)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(custom.exitCode).toBe(0);
  expect(customRows.some((item) => item.prompt.includes('/tmp/asm-migration-uat-custom'))).toBeTrue();
});
