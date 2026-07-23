import { describe, expect, it } from 'bun:test';
import { GhExecTool } from '../../src/tools/gh';
import { findMutation, hasControlChars } from '../../src/tools/gh-exec-guard';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

describe('hasControlChars', () => {
  it('rejects NUL/control bytes but allows tab (multi-line --jq) and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars("pr list --jq '.[].title'")).toBe(false);
  });
});

describe('findMutation allowlist', () => {
  it('allows recognized read-only commands', () => {
    expect(findMutation(['pr', 'list']).blocked).toBe(false);
    expect(findMutation(['repo', 'view', '--json', 'nameWithOwner']).blocked).toBe(false);
    expect(findMutation(['api', 'repos/o/r/pulls']).blocked).toBe(false);
    expect(findMutation(['pr', 'checks']).blocked).toBe(false);
    expect(findMutation(['run', 'watch', '5']).blocked).toBe(false);
    expect(findMutation(['auth', 'status']).blocked).toBe(false);
    expect(findMutation(['search', 'prs', 'cli']).blocked).toBe(false);
    expect(findMutation(['status']).blocked).toBe(false);
  });

  it('blocks writes and unrecognized commands (fail-safe)', () => {
    expect(findMutation(['pr', 'merge', '123']).blocked).toBe(true);
    expect(findMutation(['issue', 'create', '--title', 'x']).blocked).toBe(true);
    expect(findMutation(['repo', 'delete', 'o/r']).blocked).toBe(true);
    expect(findMutation(['workflow', 'run', 'ci.yml']).blocked).toBe(true);
    expect(findMutation(['extension', 'install', 'x/y']).blocked).toBe(true);
    expect(findMutation(['secret', 'set', 'N', '--body', 'v']).blocked).toBe(true);
    expect(findMutation(['auth', 'login']).blocked).toBe(true);
    expect(findMutation(['label', 'create', 'list']).blocked).toBe(true);
  });

  it('blocks gh api attached-shorthand bypasses', () => {
    expect(findMutation(['api', '-XPOST', 'repos/o/r/issues']).blocked).toBe(true);
    expect(findMutation(['api', '-XDELETE', 'repos/o/r']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-fbody=spam']).blocked).toBe(true);
    expect(findMutation(['api', '--method=PUT', 'x']).blocked).toBe(true);
  });

  it('blocks gh api attached-equals -X and --input body bypasses', () => {
    expect(findMutation(['api', '-X=POST', 'repos/o/r/issues']).blocked).toBe(true);
    expect(findMutation(['api', '-X=DELETE', 'repos/o/r']).blocked).toBe(true);
    expect(findMutation(['api', '-X=patch', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'repos/o/r', '--input', 'body.json']).blocked).toBe(true);
    expect(findMutation(['api', '--input=body.json', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'graphql', '--input', 'mut.json']).blocked).toBe(true);
  });

  it('allows gh api GET requests', () => {
    expect(findMutation(['api', '-XGET', 'repos/o/r']).blocked).toBe(false);
    expect(findMutation(['api', '--method', 'GET', 'x', '-f', 'a=b']).blocked).toBe(false);
    expect(findMutation(['api', '-X=GET', 'user']).blocked).toBe(false);
    expect(findMutation(['api', 'repos/o/r']).blocked).toBe(false);
  });

  it('does not false-positive on read args that contain a verb word', () => {
    expect(findMutation(['pr', 'view', 'merge']).blocked).toBe(false);
  });

  it('blocks the flag-value-shift bypass (cobra consumes the token after a value flag)', () => {
    // `--title`'s value `list` is consumed by gh; real verb `create` is a mutation.
    expect(findMutation(['issue', '--title', 'list', 'create']).blocked).toBe(true);
  });

  it('blocks gh api short-flag-cluster mutations (pflag clustering bypass)', () => {
    // -iF = -i (include) + -F (raw-field, value from next arg) → body → POST.
    expect(findMutation(['api', 'repos/o/r/issues', '-iF', 'field=y']).blocked).toBe(true);
    // -iX = -i + -X (method, value from next arg).
    expect(findMutation(['api', 'x', '-iX', 'POST']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-X=POST']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '--input', 'body.json']).blocked).toBe(true);
    expect(findMutation(['pr', 'merge', '1']).blocked).toBe(true);
  });

  it('still allows legit reads whose flag values look like verbs', () => {
    // `create` is the --search term, not the verb; verb is still `list`.
    expect(findMutation(['issue', 'list', '--search', 'create']).blocked).toBe(false);
    // Global value-flag before the group; verb is still `list`.
    expect(findMutation(['-R', 'o/r', 'issue', 'list']).blocked).toBe(false);
  });

  it('blocks the -fX=GET body-field bypass (pflag stops at the first value-taking short)', () => {
    // `-fX=GET` is --field with value `X=GET` (a body field named X) → gh POSTs;
    // the trailing X must NOT be parsed as a method that downgrades it to GET.
    expect(findMutation(['api', 'x', '-fX=GET']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-FX=GET']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-f', '-fX=GET']).blocked).toBe(true);
    expect(findMutation(['api', 'repos/o/r/issues', '-fX=GET', '-ftitle=pwned']).blocked).toBe(true);
    // A real method-only read (no body) still resolves to GET and is allowed.
    expect(findMutation(['api', 'repos/o/r', '-X', 'GET']).blocked).toBe(false);
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
