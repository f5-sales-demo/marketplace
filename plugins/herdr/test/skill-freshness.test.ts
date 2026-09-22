import { describe, expect, it } from 'bun:test';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const checker = join(import.meta.dir, '..', 'scripts', 'check-skill-freshness.sh');
const vendored = join(import.meta.dir, '..', 'skills', 'herdr');

function check(upstream: string) {
  return Bun.spawnSync(['bash', checker, vendored, upstream], { stdout: 'pipe', stderr: 'pipe' });
}

describe('complete Herdr skill freshness', () => {
  it('accepts the complete matching directory and detects edits, additions, and deletions', () => {
    const root = mkdtempSync(join(tmpdir(), 'herdr-skill-'));
    try {
      const upstream = join(root, 'upstream');
      cpSync(vendored, upstream, { recursive: true });
      expect(check(upstream).exitCode).toBe(0);
      writeFileSync(join(upstream, 'SKILL.md'), 'edited');
      expect(check(upstream).exitCode).not.toBe(0);
      rmSync(upstream, { recursive: true });
      cpSync(vendored, upstream, { recursive: true });
      writeFileSync(join(upstream, 'references', 'added.md'), 'added');
      expect(check(upstream).exitCode).not.toBe(0);
      rmSync(join(upstream, 'references', 'added.md'));
      rmSync(join(upstream, 'references', 'automation.md'));
      expect(check(upstream).exitCode).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
