import { describe, expect, it } from 'bun:test';
import { GhExecTool } from '../../src/tools/gh';
import { findMutation, hasControlChars, MUTATING_VERBS } from '../../src/tools/gh-exec-guard';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe('hasControlChars', () => {
  it('rejects NUL/control bytes, allows normal args', () => {
    expect(hasControlChars(`pr${NUL}list`)).toBe(true);
    expect(hasControlChars(`pr${TAB}list`)).toBe(true);
    expect(hasControlChars("pr list --json number,title --jq '.[].title'")).toBe(false);
  });
});

describe('MUTATING_VERBS', () => {
  it('is a non-empty set covering common write verbs', () => {
    expect(MUTATING_VERBS.has('create')).toBe(true);
    expect(MUTATING_VERBS.has('merge')).toBe(true);
    expect(MUTATING_VERBS.has('delete')).toBe(true);
  });
});

describe('findMutation', () => {
  it('allows reads', () => {
    expect(findMutation(['pr', 'list']).blocked).toBe(false);
    expect(findMutation(['repo', 'view', '--json', 'nameWithOwner']).blocked).toBe(false);
    expect(findMutation(['api', 'repos/o/r/pulls']).blocked).toBe(false);
  });
  it('blocks mutating verbs anywhere', () => {
    expect(findMutation(['pr', 'merge', '123']).blocked).toBe(true);
    expect(findMutation(['issue', 'create', '--title', 'x']).blocked).toBe(true);
    expect(findMutation(['repo', 'delete', 'o/r']).blocked).toBe(true);
  });
  it('blocks mutating gh api methods and body fields', () => {
    expect(findMutation(['api', '-X', 'POST', 'repos/o/r/issues']).blocked).toBe(true);
    expect(findMutation(['api', '--method', 'DELETE', 'x']).blocked).toBe(true);
    expect(findMutation(['api', '--method=PATCH', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-f', 'title=y']).blocked).toBe(true);
    expect(findMutation(['api', '--method', 'GET', 'x']).blocked).toBe(false);
    expect(findMutation(['api', '--method', 'GET', 'x', '-f', 'q=y']).blocked).toBe(false);
  });
});

describe('gh_exec execute', () => {
  const tool = new GhExecTool({ cwd: '/tmp' } as never);
  it('rejects empty args', async () => {
    const r = await tool.execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
  });
  it('rejects control chars', async () => {
    const r = await tool.execute('id', { args: [`pr${NUL}list`] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });
  it('blocks a mutating verb before spawning', async () => {
    const r = await tool.execute('id', { args: ['pr', 'merge', '1'] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });
});
