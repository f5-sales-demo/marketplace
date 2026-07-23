import { describe, expect, it } from 'bun:test';
import { createGcloudExecTool } from '../../src/tools/gcloud-exec';
import {
  buildGcloudArgs,
  checkGcloud,
  findDangerous,
  findMutating,
  findVerb,
  getPositionals,
  isRead,
} from '../../src/tools/gcloud-exec-guard';

const mockTypebox = {
  Type: {
    Object: (schema: Record<string, unknown>) => schema,
    String: (opts?: Record<string, unknown>) => ({ type: 'string', ...opts }),
    Array: (items: unknown, opts?: Record<string, unknown>) => ({ type: 'array', items, ...opts }),
  },
};

// ---------------------------------------------------------------------------
// getPositionals — all-positionals model (NO flag-value exclusion)
// ---------------------------------------------------------------------------

describe('getPositionals', () => {
  it('returns every non-flag token', () => {
    expect(getPositionals(['compute', 'instances', 'list'])).toEqual(['compute', 'instances', 'list']);
  });

  it('does NOT drop the token after a flag (no flag-value exclusion)', () => {
    // The critical anti-bug property: `--zone` does NOT consume the next token.
    expect(getPositionals(['--zone', 'delete', 'instances', 'list'])).toEqual(['delete', 'instances', 'list']);
  });

  it('drops --flag=value forms and bare -x/--x flags', () => {
    expect(getPositionals(['compute', 'list', '--filter=status=RUNNING', '-q'])).toEqual(['compute', 'list']);
  });

  it('keeps a leading global flag value as a positional (fail-safe)', () => {
    expect(getPositionals(['--project', 'p', 'compute', 'instances', 'list'])).toEqual([
      'p',
      'compute',
      'instances',
      'list',
    ]);
  });
});

// ---------------------------------------------------------------------------
// findVerb / findDangerous / findMutating / isRead
// ---------------------------------------------------------------------------

describe('findVerb', () => {
  it('finds the leftmost recognized verb', () => {
    expect(findVerb(['compute', 'instances', 'list'])).toBe('list');
    expect(findVerb(['projects', 'describe', 'my-proj'])).toBe('describe');
  });

  it('returns null when no positional is a recognized verb', () => {
    expect(findVerb(['compute', 'instances', 'frobnicate', 'x'])).toBeNull();
  });
});

describe('findDangerous', () => {
  it('finds a dangerous verb anywhere', () => {
    expect(findDangerous(['compute', 'ssh', 'vm'])).toBe('ssh');
    expect(findDangerous(['container', 'clusters', 'get-credentials', 'c'])).toBe('get-credentials');
  });
  it('returns null when none present', () => {
    expect(findDangerous(['compute', 'instances', 'list'])).toBeNull();
  });
});

describe('findMutating', () => {
  it('finds a mutating verb anywhere', () => {
    expect(findMutating(['compute', 'instances', 'delete', 'x'])).toBe('delete');
    expect(findMutating(['app', 'deploy'])).toBe('deploy');
  });
  it('returns null when none present', () => {
    expect(findMutating(['compute', 'instances', 'list'])).toBeNull();
  });
});

describe('isRead', () => {
  it('accepts exact and prefix read verbs', () => {
    expect(isRead('list')).toBe(true);
    expect(isRead('describe')).toBe(true);
    expect(isRead('get-iam-policy')).toBe(true);
    expect(isRead('list-instances')).toBe(true);
    expect(isRead('describe-something')).toBe(true);
  });
  it('rejects non-read verbs', () => {
    expect(isRead('delete')).toBe(false);
    expect(isRead('ssh')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkGcloud — the security surface
// ---------------------------------------------------------------------------

describe('checkGcloud ALLOW', () => {
  const allow: [string, string[]][] = [
    ['compute instances list', ['compute', 'instances', 'list']],
    ['projects describe', ['projects', 'describe', 'my-proj']],
    ['projects get-iam-policy', ['projects', 'get-iam-policy', 'p']],
    ['config list', ['config', 'list']],
    ['version', ['version']],
    ['info', ['info']],
    ['list with filter + format', ['compute', 'instances', 'list', '--filter=status=RUNNING', '--format=value(name)']],
    ['leading global value flag', ['--project', 'p', 'compute', 'instances', 'list']],
    ['describe with zone', ['compute', 'instances', 'describe', 'my-vm', '--zone', 'us-central1-a']],
  ];

  for (const [name, args] of allow) {
    it(`allows ${name}`, () => {
      expect(checkGcloud(args).blocked).toBe(false);
    });
  }
});

describe('checkGcloud BLOCK', () => {
  const block: [string, string[]][] = [
    ['delete', ['compute', 'instances', 'delete', 'x']],
    ['get-credentials', ['container', 'clusters', 'get-credentials', 'c']],
    ['ssh', ['compute', 'ssh', 'vm']],
    ['scp', ['compute', 'scp', 'a', 'b']],
    ['connect', ['sql', 'connect', 'i']],
    ['call', ['functions', 'call', 'fn']],
    ['config set', ['config', 'set', 'x', 'y']],
    ['add-iam-policy-binding', ['projects', 'add-iam-policy-binding', 'p', '--member', 'x', '--role', 'y']],
    ['app deploy', ['app', 'deploy']],
    ['auth login', ['auth', 'login']],
    ['auth revoke', ['auth', 'revoke']],
    // Token-minting reads print usable bearer credentials to stdout → credential
    // exposure; they must route through the confirmed path, not the passthrough.
    ['auth print-access-token', ['auth', 'print-access-token']],
    ['auth print-identity-token', ['auth', 'print-identity-token']],
    ['unknown verb', ['compute', 'instances', 'frobnicate', 'x']],
    ['empty', []],
    ['run deploy', ['run', 'deploy', 'svc']],
  ];

  for (const [name, args] of block) {
    it(`blocks ${name}`, () => {
      const c = checkGcloud(args);
      expect(c.blocked).toBe(true);
      expect(c.reason).toBeTruthy();
    });
  }

  it('empty gives a no-command reason', () => {
    expect(checkGcloud([]).reason).toContain('no gcloud command');
  });

  it('dangerous verb routes to the cli-operator agent', () => {
    expect(checkGcloud(['compute', 'ssh', 'vm']).reason).toContain('gcloud:cli-operator');
  });

  it('mutating verb names the verb', () => {
    expect(checkGcloud(['compute', 'instances', 'delete', 'x']).reason).toContain('delete');
  });

  it('dangerous takes precedence over mutating (run deploy → run)', () => {
    // `run` is a dangerous execution vector; it must be reported, not `deploy`.
    expect(checkGcloud(['run', 'deploy', 'svc']).reason).toContain('run');
  });
});

// ---------------------------------------------------------------------------
// buildGcloudArgs
// ---------------------------------------------------------------------------

describe('buildGcloudArgs', () => {
  it('appends --format=json when no --format present', () => {
    expect(buildGcloudArgs(['compute', 'instances', 'list'])).toEqual([
      'compute',
      'instances',
      'list',
      '--format=json',
    ]);
  });

  it('leaves --format=table(name) untouched', () => {
    const args = ['compute', 'instances', 'list', '--format=table(name)'];
    expect(buildGcloudArgs(args)).toEqual(args);
  });

  it('leaves a separate --format token untouched', () => {
    const args = ['compute', 'instances', 'list', '--format', 'yaml'];
    expect(buildGcloudArgs(args)).toEqual(args);
  });
});

// ---------------------------------------------------------------------------
// Tool metadata + execute guards
// ---------------------------------------------------------------------------

describe('createGcloudExecTool metadata', () => {
  const tool = createGcloudExecTool({ typebox: mockTypebox });

  it('has correct name', () => {
    expect(tool.name).toBe('gcloud_exec');
  });
  it('has a label', () => {
    expect(tool.label).toBe('Google Cloud CLI Execute');
  });
  it('has a description mentioning gcloud', () => {
    expect(tool.description).toContain('gcloud');
  });
  it('has an execute function', () => {
    expect(typeof tool.execute).toBe('function');
  });
});

describe('createGcloudExecTool execute guards', () => {
  const tool = createGcloudExecTool({ typebox: mockTypebox });

  it('rejects empty args', async () => {
    const r = await tool.execute('id', { args: [] }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('empty');
  });

  it('rejects a control character in an argument', async () => {
    const NUL = String.fromCharCode(0);
    const r = await tool.execute('id', { args: ['compute', 'instances', `list${NUL}`] }, undefined, null, {
      cwd: '/tmp',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('control character');
  });

  it('blocks a mutating command before spawning', async () => {
    const r = await tool.execute('id', { args: ['compute', 'instances', 'delete', 'x'] }, undefined, null, {
      cwd: '/tmp',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('mutating');
  });

  it('blocks a dangerous command before spawning', async () => {
    const r = await tool.execute('id', { args: ['compute', 'ssh', 'vm'] }, undefined, null, { cwd: '/tmp' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('gcloud:cli-operator');
  });
});
