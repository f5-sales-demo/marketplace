import { describe, expect, it } from 'bun:test';
import {
  detectSfError,
  execSfJson,
  execSfRaw,
  parseSfJsonOutput,
  SfAuthError,
  type SfExecApi,
  SfExecError,
  SfNoDefaultOrgError,
  SfNotFoundError,
  SfQueryError,
  SfSessionExpiredError,
} from '../../src/sf/exec';

function mockApi(response: { stdout: string; stderr: string; exitCode: number }): SfExecApi {
  return {
    async exec() {
      return response;
    },
  };
}

describe('error classes', () => {
  it('SfNotFoundError has correct name and message', () => {
    const err = new SfNotFoundError();
    expect(err.name).toBe('SfNotFoundError');
    expect(err.message).toContain('not installed');
  });

  it('SfAuthError has correct name', () => {
    const err = new SfAuthError();
    expect(err.name).toBe('SfAuthError');
    expect(err.message).toContain('No authenticated');
  });

  it('SfSessionExpiredError has correct name', () => {
    const err = new SfSessionExpiredError();
    expect(err.name).toBe('SfSessionExpiredError');
    expect(err.message).toContain('expired');
  });

  it('SfNoDefaultOrgError has correct name', () => {
    const err = new SfNoDefaultOrgError();
    expect(err.name).toBe('SfNoDefaultOrgError');
    expect(err.message).toContain('no default');
  });

  it('SfExecError includes exit code', () => {
    const err = new SfExecError('failed', 2);
    expect(err.name).toBe('SfExecError');
    expect(err.exitCode).toBe(2);
    expect(err.message).toContain('exit 2');
  });

  it('SfQueryError extends SfExecError and stores query', () => {
    const err = new SfQueryError('bad query', 'SELECT Id FROM Foo');
    expect(err.name).toBe('SfQueryError');
    expect(err.query).toBe('SELECT Id FROM Foo');
    expect(err instanceof SfExecError).toBe(true);
  });
});

describe('detectSfError', () => {
  it('returns SfSessionExpiredError for INVALID_SESSION_ID', () => {
    const err = detectSfError('INVALID_SESSION_ID: session expired', 1);
    expect(err).toBeInstanceOf(SfSessionExpiredError);
  });

  it('returns SfNoDefaultOrgError for no default org', () => {
    const err = detectSfError('No default org is set', 1);
    expect(err).toBeInstanceOf(SfNoDefaultOrgError);
  });

  it('returns SfAuthError for no orgs found', () => {
    const err = detectSfError('No orgs found', 1);
    expect(err).toBeInstanceOf(SfAuthError);
  });

  it('returns SfQueryError for MALFORMED_QUERY with query param', () => {
    const err = detectSfError('MALFORMED_QUERY: unexpected token', 1, 'SELECT Bad');
    expect(err).toBeInstanceOf(SfQueryError);
  });

  it('returns SfQueryError for INVALID_FIELD with query param', () => {
    const err = detectSfError('INVALID_FIELD: no such column', 1, 'SELECT Bad FROM X');
    expect(err).toBeInstanceOf(SfQueryError);
  });

  it('returns SfExecError for MALFORMED_QUERY without query param', () => {
    const err = detectSfError('MALFORMED_QUERY: unexpected token', 1);
    expect(err).toBeInstanceOf(SfExecError);
    expect(err).not.toBeInstanceOf(SfQueryError);
  });

  it('returns generic SfExecError for unknown errors', () => {
    const err = detectSfError('something went wrong', 42);
    expect(err).toBeInstanceOf(SfExecError);
    expect((err as SfExecError).exitCode).toBe(42);
  });

  it('is case-insensitive', () => {
    expect(detectSfError('invalid_session_id', 1)).toBeInstanceOf(SfSessionExpiredError);
    expect(detectSfError('INVALID_SESSION_ID', 1)).toBeInstanceOf(SfSessionExpiredError);
  });
});

describe('parseSfJsonOutput', () => {
  it('parses valid JSON', () => {
    const result = parseSfJsonOutput('{"status":0,"result":{"foo":"bar"}}');
    expect(result.status).toBe(0);
    expect(result.result).toEqual({ foo: 'bar' });
  });

  it('throws SfExecError for invalid JSON', () => {
    expect(() => parseSfJsonOutput('not json')).toThrow(SfExecError);
  });

  it('throws SfExecError for empty string', () => {
    expect(() => parseSfJsonOutput('')).toThrow(SfExecError);
  });
});

describe('execSfJson', () => {
  it('returns parsed result for successful command', async () => {
    const api = mockApi({
      stdout: '{"status":0,"result":{"totalSize":5}}',
      stderr: '',
      exitCode: 0,
    });
    const result = await execSfJson(api, ['org', 'list']);
    expect(result.status).toBe(0);
    expect(result.result).toEqual({ totalSize: 5 });
  });

  it('appends --json flag to args', async () => {
    let capturedArgs: string[] = [];
    const api: SfExecApi = {
      async exec(_cmd, args) {
        capturedArgs = args;
        return { stdout: '{"status":0,"result":{}}', stderr: '', exitCode: 0 };
      },
    };
    await execSfJson(api, ['org', 'list']);
    expect(capturedArgs).toEqual(['org', 'list', '--json']);
  });

  it('throws SfSessionExpiredError for expired session response', async () => {
    const api = mockApi({
      stdout: '{"status":1,"message":"INVALID_SESSION_ID: Session expired or invalid"}',
      stderr: '',
      exitCode: 1,
    });
    await expect(execSfJson(api, ['org', 'display'])).rejects.toBeInstanceOf(SfSessionExpiredError);
  });

  it('throws SfQueryError for malformed query', async () => {
    const api = mockApi({
      stdout: '{"status":1,"message":"MALFORMED_QUERY: unexpected token"}',
      stderr: '',
      exitCode: 1,
    });
    await expect(execSfJson(api, ['data', 'query'], undefined, 'SELECT Bad')).rejects.toBeInstanceOf(SfQueryError);
  });

  it('does not throw when status is 0 even with message', async () => {
    const api = mockApi({
      stdout: '{"status":0,"result":{},"message":"some warning"}',
      stderr: '',
      exitCode: 0,
    });
    const result = await execSfJson(api, ['org', 'list']);
    expect(result.status).toBe(0);
  });
});

describe('execSfRaw', () => {
  it('returns raw result for successful command', async () => {
    const api = mockApi({ stdout: '@salesforce/cli/2.50.0', stderr: '', exitCode: 0 });
    const result = await execSfRaw(api, ['--version']);
    expect(result.stdout).toBe('@salesforce/cli/2.50.0');
  });

  it('throws for non-zero exit code', async () => {
    const api = mockApi({ stdout: '', stderr: 'No orgs found', exitCode: 1 });
    await expect(execSfRaw(api, ['org', 'list'])).rejects.toBeInstanceOf(SfAuthError);
  });

  it('uses stderr for error detection when available', async () => {
    const api = mockApi({ stdout: 'ignored', stderr: 'INVALID_SESSION_ID', exitCode: 1 });
    await expect(execSfRaw(api, ['org', 'display'])).rejects.toBeInstanceOf(SfSessionExpiredError);
  });

  it('falls back to stdout when stderr is empty', async () => {
    const api = mockApi({ stdout: 'No default org is set', stderr: '', exitCode: 1 });
    await expect(execSfRaw(api, ['config', 'get'])).rejects.toBeInstanceOf(SfNoDefaultOrgError);
  });
});
