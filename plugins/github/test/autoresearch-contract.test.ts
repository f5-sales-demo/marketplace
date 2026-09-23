import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const scriptPath = join(import.meta.dir, '..', 'autoresearch.checks.sh');

test('autoresearch checks exercise the advisory lifecycle from an installed cache', async () => {
  const script = await readFile(scriptPath, 'utf8');
  expect(script).not.toContain('git rev-parse --show-toplevel');
  expect(script).not.toContain('gh-exec-guard.ts');
  expect(script).not.toContain('mutation-safety.ts');
  expect(script).not.toContain('GITHUB_ALLOW_MUTATIONS');
  for (const testFile of [
    'test/tools/gh-exec.test.ts',
    'test/tools/gh-headless-mutations.test.ts',
    'test/tools/github-workflow.test.ts',
    'test/integration-profile.test.ts',
    'test/installed-cache-load.test.ts',
  ]) {
    expect(script).toContain(testFile);
  }
});
