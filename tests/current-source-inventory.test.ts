import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existingSourcePaths } from '../scripts/presentation-tracker.mjs';

test('rebuilt runtime inventory includes new chunks and excludes unstaged removed chunks', () => {
  const root = mkdtempSync(join(tmpdir(), 'current-source-inventory-'));
  try {
    writeFileSync(join(root, 'old.js'), 'old runtime');
    writeFileSync(join(root, 'new.js'), 'new runtime');
    writeFileSync(join(root, 'source.ts'), 'source');
    unlinkSync(join(root, 'old.js'));
    const gitCandidates = ['old.js', 'source.ts', 'new.js'];
    expect(existingSourcePaths(root, gitCandidates)).toEqual(['new.js', 'source.ts']);
    expect(gitCandidates).toEqual(['old.js', 'source.ts', 'new.js']);
    expect(readFileSync(join(root, 'new.js'), 'utf8')).toBe('new runtime');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('source inventory is deterministic and reads each existing candidate once', () => {
  const root = mkdtempSync(join(tmpdir(), 'current-source-inventory-'));
  try {
    writeFileSync(join(root, 'a.ts'), 'a');
    writeFileSync(join(root, 'b.ts'), 'b');
    expect(existingSourcePaths(root, ['b.ts', 'a.ts', 'b.ts', 'missing.ts', ''])).toEqual(['a.ts', 'b.ts']);
  } finally {
    rmSync(root, { recursive: true });
  }
});
