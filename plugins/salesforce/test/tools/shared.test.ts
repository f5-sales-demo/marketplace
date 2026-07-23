import { afterEach, describe, expect, it } from 'bun:test';
import { SfAuthError, SfExecError, SfNoDefaultOrgError, SfQueryError, SfSessionExpiredError } from '../../src/sf/exec';
import {
  collectAllOrgs,
  detectErrorType,
  errorResult,
  hasControlChars,
  makeExecApi,
  normalizeOrg,
  textResult,
} from '../../src/tools/shared';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(127);

describe('hasControlChars', () => {
  it('rejects NUL/control bytes and DEL but allows tab/LF/CR and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${DEL}b`)).toBe(true);
    expect(hasControlChars(`a${String.fromCharCode(0x1b)}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars(`a${LF}b`)).toBe(false);
    expect(hasControlChars(`a${CR}b`)).toBe(false);
    expect(hasControlChars("data query -q 'SELECT Id FROM Account'")).toBe(false);
    expect(hasControlChars('')).toBe(false);
  });
});

describe('makeExecApi signal threading', () => {
  it('a non-aborted signal still returns output (guards the false-cancel regression)', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    const r = await api.exec('sh', ['-c', 'echo hello-live'], { signal: controller.signal });
    expect(r.stdout).toBe('hello-live');
    expect(r.exitCode).toBe(0);
  });

  it('a stale, already-aborted signal does NOT false-cancel a fresh command', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    controller.abort(); // simulate a signal left aborted by a prior turn
    const r = await api.exec('sh', ['-c', 'echo still-runs'], { signal: controller.signal });
    // The documented bug: passing this stale signal to Bun.spawn would kill the
    // fresh process immediately. Safe threading runs it to completion instead.
    expect(r.stdout).toBe('still-runs');
    expect(r.exitCode).toBe(0);
  });

  it('runs without any signal supplied', async () => {
    const api = makeExecApi(process.cwd());
    const r = await api.exec('sh', ['-c', 'echo no-signal']);
    expect(r.stdout).toBe('no-signal');
    expect(r.exitCode).toBe(0);
  });
});

// Proves the *forwarding* contract deterministically by spying on Bun.spawn:
// a live signal must reach Bun.spawn, an already-aborted (stale) one must not.
// No real process, no sleep+abort race — we inspect the options object directly.
describe('makeExecApi forwards AbortSignal to Bun.spawn only while live', () => {
  const realSpawn = Bun.spawn;

  // A minimal fake child: empty stdout/stderr streams (truthy, so makeExecApi's
  // `!child.stdout` guard passes), a resolved `exited`, and killed=false.
  const emptyStream = () => new ReadableStream<Uint8Array>({ start: (c) => c.close() });
  const fakeChild = () => ({
    stdout: emptyStream(),
    stderr: emptyStream(),
    exited: Promise.resolve(0),
    exitCode: 0,
    killed: false,
  });

  let recordedOptions: { signal?: AbortSignal } | undefined;

  function installSpawnSpy() {
    recordedOptions = undefined;
    Bun.spawn = ((_cmd: string[], options: { signal?: AbortSignal }) => {
      recordedOptions = options;
      return fakeChild();
    }) as unknown as typeof Bun.spawn;
  }

  afterEach(() => {
    Bun.spawn = realSpawn;
  });

  it('hands a live (non-aborted) signal to Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    await makeExecApi('/tmp').exec('sf', ['org', 'list'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(true);
    expect(recordedOptions?.signal).toBe(controller.signal);
  });

  it('withholds an already-aborted (stale) signal from Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    controller.abort(); // stale abort left over from a prior turn
    await makeExecApi('/tmp').exec('sf', ['org', 'list'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    // The stale-abort path must build `{}` (no signal), never `{ signal }` —
    // otherwise Bun would kill the fresh child immediately (false-cancel).
    expect('signal' in (recordedOptions ?? {})).toBe(false);
  });
});

describe('textResult', () => {
  it('returns text content with details', () => {
    const result = textResult('hello', { tool: 'sf_setup' });
    expect(result.content).toEqual([{ type: 'text', text: 'hello' }]);
    expect(result.details.tool).toBe('sf_setup');
    expect(result.isError).toBeUndefined();
  });
});

describe('errorResult', () => {
  it('returns error content with isError flag', () => {
    const result = errorResult('failed', { tool: 'sf_query' });
    expect(result.content).toEqual([{ type: 'text', text: 'failed' }]);
    expect(result.isError).toBe(true);
    expect(result.details.tool).toBe('sf_query');
  });
});

describe('detectErrorType', () => {
  it('maps SfAuthError to auth_required', () => {
    expect(detectErrorType(new SfAuthError())).toBe('auth_required');
  });

  it('maps SfSessionExpiredError to session_expired', () => {
    expect(detectErrorType(new SfSessionExpiredError())).toBe('session_expired');
  });

  it('maps SfNoDefaultOrgError to no_default_org', () => {
    expect(detectErrorType(new SfNoDefaultOrgError())).toBe('no_default_org');
  });

  it('maps SfQueryError to invalid_query', () => {
    expect(detectErrorType(new SfQueryError('bad', 'SELECT x'))).toBe('invalid_query');
  });

  it('maps unknown errors to exec_error', () => {
    expect(detectErrorType(new Error('random'))).toBe('exec_error');
    expect(detectErrorType(new SfExecError('fail', 1))).toBe('exec_error');
    expect(detectErrorType('string error')).toBe('exec_error');
  });
});

describe('normalizeOrg', () => {
  it('normalizes standard org fields', () => {
    const org = normalizeOrg({
      alias: 'prod',
      username: 'admin@prod.com',
      orgId: '00D123',
      instanceUrl: 'https://prod.my.salesforce.com',
      connectedStatus: 'Connected',
      isDefaultUsername: true,
      isSandbox: false,
    });
    expect(org.alias).toBe('prod');
    expect(org.username).toBe('admin@prod.com');
    expect(org.orgId).toBe('00D123');
    expect(org.isDefault).toBe(true);
    expect(org.isSandbox).toBe(false);
  });

  it('handles lowercase orgid field', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgid: '00D456',
      instanceUrl: 'https://test.salesforce.com',
    });
    expect(org.orgId).toBe('00D456');
  });

  it('detects default from defaultMarker (U)', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgId: '00D789',
      instanceUrl: 'https://test.salesforce.com',
      defaultMarker: '(U)',
    });
    expect(org.isDefault).toBe(true);
  });

  it('defaults connectedStatus to Unknown', () => {
    const org = normalizeOrg({
      username: 'user@test.com',
      orgId: '00D000',
      instanceUrl: 'https://test.salesforce.com',
    });
    expect(org.connectedStatus).toBe('Unknown');
  });
});

describe('collectAllOrgs', () => {
  const makeOrg = (id: string, username: string) => ({
    username,
    orgId: id,
    instanceUrl: 'https://test.salesforce.com',
    connectedStatus: 'Connected',
  });

  it('collects from all org categories', () => {
    const orgs = collectAllOrgs({
      nonScratchOrgs: [makeOrg('001', 'a@test.com')],
      scratchOrgs: [makeOrg('002', 'b@test.com')],
      sandboxes: [makeOrg('003', 'c@test.com')],
      devHubs: [makeOrg('004', 'd@test.com')],
      other: [makeOrg('005', 'e@test.com')],
    });
    expect(orgs).toHaveLength(5);
  });

  it('deduplicates by orgId', () => {
    const orgs = collectAllOrgs({
      nonScratchOrgs: [makeOrg('001', 'a@test.com')],
      scratchOrgs: [makeOrg('001', 'a@test.com')],
    });
    expect(orgs).toHaveLength(1);
  });

  it('handles missing categories', () => {
    const orgs = collectAllOrgs({ nonScratchOrgs: [makeOrg('001', 'a@test.com')] });
    expect(orgs).toHaveLength(1);
  });

  it('handles empty input', () => {
    const orgs = collectAllOrgs({});
    expect(orgs).toHaveLength(0);
  });
});
