import { describe, expect, it } from 'bun:test';
import { assertNoControlChars, github, hasControlChars } from '../../src/utils/git';

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const DEL = String.fromCharCode(127);

describe('hasControlChars', () => {
  it('rejects NUL/control/DEL bytes but allows tab, LF, CR and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${BEL}b`)).toBe(true);
    expect(hasControlChars(`a${DEL}b`)).toBe(true);
    expect(hasControlChars('a\tb')).toBe(false);
    expect(hasControlChars('a\nb')).toBe(false);
    expect(hasControlChars('a\rb')).toBe(false);
    expect(hasControlChars("pr list --jq '.[].title'")).toBe(false);
  });
});

describe('assertNoControlChars', () => {
  it('throws a ToolError naming the offending argument', () => {
    expect(() => assertNoControlChars(['repo', 'view', `a${NUL}b`])).toThrow(/control character/i);
  });

  it('passes clean argv untouched', () => {
    expect(() => assertNoControlChars(['repo', 'view', '--json', 'nameWithOwner'])).not.toThrow();
  });
});

describe('github.run argv hygiene', () => {
  it('rejects a control-char arg before spawning (central enforcement, no gh required)', async () => {
    // assertNoControlChars runs before the which('gh') probe, so this is deterministic
    // regardless of whether gh is installed — proving typed-tool argv is validated too.
    await expect(github.run('/tmp', ['repo', 'view', `owner/repo${NUL}`])).rejects.toThrow(/control character/i);
  });
});
