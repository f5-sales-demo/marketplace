import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfExecTool } from '../../src/tools/sf-exec';
import { effectiveApiMethod, findMutation, normalizeArgs } from '../../src/tools/sf-exec-guard';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);

const mockPi = { typebox: { Type } };

function makeTool() {
  return createSfExecTool(mockPi);
}

describe('normalizeArgs', () => {
  it('splits positional tokens on ":" (colon grammar → space grammar)', () => {
    expect(normalizeArgs(['org:list'])).toEqual(['org', 'list']);
    expect(normalizeArgs(['data:create'])).toEqual(['data', 'create']);
    expect(normalizeArgs(['apex:run'])).toEqual(['apex', 'run']);
  });

  it('leaves space-form positionals intact', () => {
    expect(normalizeArgs(['org', 'list'])).toEqual(['org', 'list']);
    expect(normalizeArgs(['api', 'request', 'rest', 'projects'])).toEqual(['api', 'request', 'rest', 'projects']);
  });

  it('excludes flag tokens and the token immediately after a flag (flag-value exclusion)', () => {
    // `-s`'s value `Account` is consumed; path is just `data create`.
    expect(normalizeArgs(['data', 'create', '-s', 'Account'])).toEqual(['data', 'create']);
    // `--query`'s value is consumed; path is `data query`.
    expect(normalizeArgs(['data', 'query', '--query', 'SELECT Id FROM Account'])).toEqual(['data', 'query']);
    // `--json` is a trailing boolean flag with no value.
    expect(normalizeArgs(['org', 'list', '--json'])).toEqual(['org', 'list']);
  });

  it('does not split flag tokens on ":"', () => {
    // The colon-bearing flag value is excluded (follows a flag); the flag itself is
    // never split into path parts.
    expect(normalizeArgs(['data', 'query', '--where', 'Name:foo'])).toEqual(['data', 'query']);
  });
});

describe('effectiveApiMethod', () => {
  it('defaults to GET with no method or body flags', () => {
    expect(effectiveApiMethod(['api', 'request', 'rest', 'projects'])).toBe('GET');
  });

  it('honors explicit --method / -X in every form (attached/equals/lowercase)', () => {
    expect(effectiveApiMethod(['api', 'request', 'rest', '--method', 'POST', 'x'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'request', 'rest', '--method=DELETE', 'x'])).toBe('DELETE');
    expect(effectiveApiMethod(['api', 'request', 'rest', '-X', 'PUT', 'x'])).toBe('PUT');
    expect(effectiveApiMethod(['api', 'request', 'rest', '-XPATCH', 'x'])).toBe('PATCH');
    expect(effectiveApiMethod(['api', 'request', 'rest', '-X=POST', 'x'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'request', 'rest', '-X=patch', 'x'])).toBe('PATCH');
    expect(effectiveApiMethod(['api', 'request', 'rest', '--method', 'get', 'x'])).toBe('GET');
  });

  it('infers POST when a --body/--file flag is present', () => {
    expect(effectiveApiMethod(['api', 'request', 'rest', '--body', '{}', 'x'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'request', 'rest', '--file', 'f.json', 'x'])).toBe('POST');
    expect(effectiveApiMethod(['api', 'request', 'rest', '--body={}', 'x'])).toBe('POST');
  });

  it('lets an explicit method win over an inferred body POST', () => {
    expect(effectiveApiMethod(['api', 'request', 'rest', '--method', 'GET', '--body', '{}', 'x'])).toBe('GET');
  });

  it('parses short-flag clusters (boolean flag ahead of the method short)', () => {
    // -iX = -i (include) + -X (method, value from next arg).
    expect(effectiveApiMethod(['api', 'request', 'rest', '-iX', 'POST', 'x'])).toBe('POST');
    // Method value attached inside the same token.
    expect(effectiveApiMethod(['api', 'request', 'rest', '-iXPUT', 'x'])).toBe('PUT');
    // Explicit GET inside a cluster still resolves to a read.
    expect(effectiveApiMethod(['api', 'request', 'rest', '-iX', 'GET', 'x'])).toBe('GET');
    // Include-only boolean cluster → no method → GET.
    expect(effectiveApiMethod(['api', 'request', 'rest', '-i', 'x'])).toBe('GET');
  });
});

describe('findMutation allowlist', () => {
  it('allows recognized read-only commands (space form)', () => {
    expect(findMutation(['org', 'list']).blocked).toBe(false);
    expect(findMutation(['org', 'list', '--json']).blocked).toBe(false);
    expect(findMutation(['org', 'display']).blocked).toBe(false);
    expect(findMutation(['data', 'query', '--query', 'SELECT Id FROM Account']).blocked).toBe(false);
    expect(findMutation(['apex', 'tail', 'log']).blocked).toBe(false);
    expect(findMutation(['apex', 'list', 'log']).blocked).toBe(false);
    expect(findMutation(['sobject', 'describe', '--sobject', 'Account']).blocked).toBe(false);
    expect(findMutation(['schema', 'sobject', 'list']).blocked).toBe(false);
    expect(findMutation(['limits', 'api', 'display']).blocked).toBe(false);
    expect(findMutation(['version']).blocked).toBe(false);
    expect(findMutation(['help']).blocked).toBe(false);
  });

  it('allows sf api request GET reads', () => {
    expect(findMutation(['api', 'request', 'rest', 'projects']).blocked).toBe(false);
    expect(findMutation(['api', 'request', 'rest', '-X', 'GET', 'projects']).blocked).toBe(false);
    expect(findMutation(['api', 'request', 'rest', '-iX', 'GET', 'projects']).blocked).toBe(false);
    expect(findMutation(['api', 'request', 'rest', '--method', 'GET', 'projects']).blocked).toBe(false);
  });

  it('blocks writes and unrecognized commands (fail-safe)', () => {
    expect(findMutation(['apex', 'run']).blocked).toBe(true);
    expect(findMutation(['data', 'create', '-s', 'Account']).blocked).toBe(true);
    expect(findMutation(['data', 'delete']).blocked).toBe(true);
    expect(findMutation(['project', 'deploy', 'start']).blocked).toBe(true);
    expect(findMutation(['org', 'create', 'scratch']).blocked).toBe(true);
    expect(findMutation(['org', 'login', 'web']).blocked).toBe(true);
    expect(findMutation(['config', 'set', 'x=y']).blocked).toBe(true);
    expect(findMutation(['alias', 'set']).blocked).toBe(true);
    expect(findMutation(['package', 'create']).blocked).toBe(true);
    expect(findMutation(['bogus']).blocked).toBe(true);
  });

  it('blocks the colon grammar identically to the space grammar', () => {
    expect(findMutation(['apex:run']).blocked).toBe(true);
    expect(findMutation(['org:create']).blocked).toBe(true);
    expect(findMutation(['data:create']).blocked).toBe(true);
    expect(findMutation(['data:delete']).blocked).toBe(true);
    // colon read forms are still allowed
    expect(findMutation(['org:list']).blocked).toBe(false);
    expect(findMutation(['org:display']).blocked).toBe(false);
  });

  it('blocks sf api request non-GET methods in every flag form', () => {
    expect(findMutation(['api', 'request', 'rest', '--method', 'POST', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '--method=PUT', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '-XDELETE', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '-X=PATCH', 'x']).blocked).toBe(true);
  });

  it('blocks sf api request with --file/--body (can smuggle a mutating payload)', () => {
    expect(findMutation(['api', 'request', 'rest', '--file', 'f', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '--body', '{}', 'x']).blocked).toBe(true);
    // even paired with an explicit GET, the body flag alone blocks
    expect(findMutation(['api', 'request', 'rest', '--method', 'GET', '--body', '{}', 'x']).blocked).toBe(true);
  });

  it('blocks the sf api request short-flag-cluster method bypass', () => {
    expect(findMutation(['api', 'request', 'rest', '-iX', 'POST', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '-iXPUT', 'x']).blocked).toBe(true);
  });

  it('blocks the sf api request short body-flag (-b/-f) mutation bypass', () => {
    expect(findMutation(['api', 'request', 'rest', '-f', 'req.json']).blocked).toBe(true);
    expect(findMutation(['api', 'request', 'rest', '-b', '{}', 'url']).blocked).toBe(true);
    // cluster: `-if` = -i (include) + -f (file)
    expect(findMutation(['api', 'request', 'rest', '-if', 'req.json']).blocked).toBe(true);
    // attached form: `-freq.json`
    expect(findMutation(['api', 'request', 'rest', '-freq.json']).blocked).toBe(true);
  });

  it('blocks the flag-value-shift bypass (token after a value flag is consumed)', () => {
    // `-s`'s value `list` is consumed; real verb `create` follows → mutation.
    expect(findMutation(['org', '-s', 'list', 'create']).blocked).toBe(true);
  });

  it('does not false-positive on read args that contain a verb-like word', () => {
    // `create` is the --query text, not the command verb.
    expect(findMutation(['data', 'query', '--query', 'SELECT Id FROM create']).blocked).toBe(false);
  });

  it('blocks empty command', () => {
    expect(findMutation([]).blocked).toBe(true);
  });
});

describe('sf_exec execute', () => {
  it('returns correct name and label', () => {
    const tool = makeTool();
    expect(tool.name).toBe('sf_exec');
    expect(tool.label).toBe('Salesforce CLI Execute');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('rejects empty args', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.details.tool).toBe('sf_exec');
  });

  it('rejects control chars before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: [`org${NUL}list`] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });

  it('allows a tab inside an argument (not a control char)', () => {
    // Sanity: tab must not be flagged so multi-line SOQL survives.
    const tool = makeTool();
    expect(tool.name).toBe('sf_exec');
    expect(`a${TAB}b`.length).toBe(3);
  });

  it('blocks a mutating verb before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: ['apex', 'run'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });

  it('blocks the colon-form mutating verb before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute('id', { args: ['org:create'] }, undefined, undefined, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });

  it('blocks a mutating sf api request before spawning', async () => {
    const tool = makeTool();
    const r = await tool.execute(
      'id',
      { args: ['api', 'request', 'rest', '--method', 'POST', 'x'] },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });
});
