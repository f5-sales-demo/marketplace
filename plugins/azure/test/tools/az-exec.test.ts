import { describe, expect, it } from 'bun:test';
import {
  buildAzArgs,
  createAzExecTool,
  findVerb,
  hasControlChars,
  isMutating,
  MUTATING_VERBS,
} from '../../src/tools/az-exec';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    Array: (itemSchema: unknown, opts?: Record<string, unknown>) => ({ type: 'array', items: itemSchema, ...opts }),
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
  },
};

describe('createAzExecTool', () => {
  const tool = createAzExecTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('az_exec');
  });

  it('has a label', () => {
    expect(tool.label).toBe('Azure CLI Execute');
  });

  it('has a description from markdown', () => {
    expect(tool.description).toContain('az');
  });

  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

// The `az` binary is spawned argv-style (Bun.spawn(['az', ...])) with NO shell,
// so shell metacharacters are inert. Valid JMESPath `--query` values MUST be
// accepted by the tool — the argv boundary is the real security control.
describe('findVerb', () => {
  it('returns the last leading positional token (the az verb)', () => {
    expect(findVerb(['vm', 'list'])).toBe('list');
    expect(findVerb(['group', 'delete', '--name', 'x'])).toBe('delete');
    expect(findVerb(['storage', 'account', 'create', '-n', 'foo'])).toBe('create');
  });

  it('treats the token before the first flag as the verb', () => {
    expect(findVerb(['network', 'routeserver', 'peering', 'list-learned-routes', '-g', 'rg'])).toBe(
      'list-learned-routes',
    );
  });

  it('returns null when the first token is a flag', () => {
    expect(findVerb(['--help'])).toBeNull();
  });
});

describe('isMutating (read-only-by-default guardrail)', () => {
  it('passes read verbs', () => {
    expect(isMutating(['vm', 'list'])).toBe(false);
    expect(isMutating(['account', 'show'])).toBe(false);
    expect(isMutating(['network', 'routeserver', 'peering', 'list-learned-routes', '-g', 'rg'])).toBe(false);
    expect(isMutating(['aks', 'get-credentials', '-n', 'c'])).toBe(false);
  });

  it('flags destructive / mutating verbs', () => {
    expect(isMutating(['group', 'delete', '--name', 'x'])).toBe(true);
    expect(isMutating(['vm', 'create', '-n', 'x'])).toBe(true);
    expect(isMutating(['keyvault', 'purge', '-n', 'x'])).toBe(true);
    expect(isMutating(['network', 'nsg', 'rule', 'update', '-n', 'x'])).toBe(true);
  });

  it('exposes a non-empty verb set', () => {
    expect(MUTATING_VERBS.size).toBeGreaterThan(10);
    expect(MUTATING_VERBS.has('delete')).toBe(true);
    expect(MUTATING_VERBS.has('list')).toBe(false);
  });
});

describe('hasControlChars (argv hygiene)', () => {
  it('rejects NUL bytes', () => {
    expect(hasControlChars('foo\x00bar')).toBe(true);
  });

  it('accepts ordinary values including JMESPath metacharacters', () => {
    expect(hasControlChars("RouteServiceRole_IN_0[?contains(network,'10.0.0.1')] || value[?x]")).toBe(false);
    expect(hasControlChars('[?state==`Running`]')).toBe(false);
    expect(hasControlChars('people[*].name | [0]')).toBe(false);
  });
});

describe('buildAzArgs (output flag handling)', () => {
  it('appends --output json when the caller did not specify output', () => {
    expect(buildAzArgs(['vm', 'list'])).toEqual(['vm', 'list', '--output', 'json']);
  });

  it('respects a caller-supplied --output', () => {
    expect(buildAzArgs(['vm', 'list', '--output', 'table'])).toEqual(['vm', 'list', '--output', 'table']);
  });

  it('respects a caller-supplied -o short flag', () => {
    expect(buildAzArgs(['vm', 'list', '-o', 'tsv'])).toEqual(['vm', 'list', '-o', 'tsv']);
  });
});

describe('az_exec execute', () => {
  const tool = createAzExecTool({ typebox: mockTypebox });

  it('rejects empty args array', async () => {
    const result = await tool.execute('id', { args: [] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects args containing a NUL byte with a clear message', async () => {
    const result = await tool.execute('id', { args: ['vm', 'list\x00'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('control character');
  });

  it('blocks destructive verbs deterministically with an actionable message', async () => {
    const result = await tool.execute('id', { args: ['group', 'delete', '--name', 'x'] }, null, null, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('read-only');
  });

  it('does NOT reject valid JMESPath with || (the reported failure)', async () => {
    const query = "RouteServiceRole_IN_0[?contains(network,'10.250.0.10')] || value[?contains(network,'10.250.0.10')]";
    const result = await tool.execute(
      'id',
      { args: ['network', 'routeserver', 'peering', 'list-learned-routes', '--query', query] },
      null,
      null,
      { cwd: '/tmp' },
    );
    // az may not be installed in CI; either way this must NOT be a validation rejection.
    const text = result.content[0].text.toLowerCase();
    expect(text).not.toContain('unsafe argument');
    expect(text).not.toContain('control character');
    expect(text).not.toContain('read-only');
  });

  it('does NOT reject JMESPath backtick literals or pipes', async () => {
    for (const query of ['[?powerState==`VM running`]', 'people[*].name | [0]']) {
      const result = await tool.execute('id', { args: ['vm', 'list', '--query', query] }, null, null, { cwd: '/tmp' });
      const text = result.content[0].text.toLowerCase();
      expect(text).not.toContain('unsafe argument');
      expect(text).not.toContain('control character');
    }
  });
});
