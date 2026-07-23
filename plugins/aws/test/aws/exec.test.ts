import { afterEach, describe, expect, it } from 'bun:test';
import {
  AwsAccessDeniedError,
  AwsAuthError,
  AwsExecError,
  AwsNotFoundError,
  AwsSessionExpiredError,
  AwsThrottlingError,
  detectAwsError,
} from '../../src/aws/exec';
import { detectErrorType, hasControlChars, makeExecApi } from '../../src/tools/shared';

// ---------------------------------------------------------------------------
// detectAwsError classification
// ---------------------------------------------------------------------------

describe('detectAwsError classification', () => {
  it('classifies auth failures', () => {
    expect(detectAwsError('Unable to locate credentials', 255)).toBeInstanceOf(AwsAuthError);
    expect(detectAwsError('The config profile could not be found', 255)).toBeInstanceOf(AwsAuthError);
    expect(detectAwsError('You must specify a region. No credentials.', 255)).toBeInstanceOf(AwsAuthError);
  });

  it('classifies session-expired failures', () => {
    expect(detectAwsError('ExpiredToken: the token has expired', 255)).toBeInstanceOf(AwsSessionExpiredError);
    expect(detectAwsError('InvalidClientTokenId', 255)).toBeInstanceOf(AwsSessionExpiredError);
    expect(detectAwsError('The security token included in the request is expired', 255)).toBeInstanceOf(
      AwsSessionExpiredError,
    );
    expect(detectAwsError('Error loading SSO Token: token expired', 255)).toBeInstanceOf(AwsSessionExpiredError);
    expect(detectAwsError('Your SSO session associated has expired', 255)).toBeInstanceOf(AwsSessionExpiredError);
  });

  it('classifies throttling failures', () => {
    expect(detectAwsError('Throttling: Rate exceeded', 255)).toBeInstanceOf(AwsThrottlingError);
    expect(detectAwsError('RequestLimitExceeded', 255)).toBeInstanceOf(AwsThrottlingError);
    expect(detectAwsError('TooManyRequestsException', 255)).toBeInstanceOf(AwsThrottlingError);
  });

  it('classifies access-denied failures', () => {
    expect(detectAwsError('AccessDenied: not allowed', 255)).toBeInstanceOf(AwsAccessDeniedError);
    expect(detectAwsError('UnauthorizedOperation', 255)).toBeInstanceOf(AwsAccessDeniedError);
    expect(detectAwsError('User is not authorized to perform: s3:ListBucket', 255)).toBeInstanceOf(
      AwsAccessDeniedError,
    );
  });

  it('classifies not-found failures', () => {
    expect(detectAwsError('ResourceNotFoundException', 255)).toBeInstanceOf(AwsNotFoundError);
    expect(detectAwsError('The bucket does not exist', 255)).toBeInstanceOf(AwsNotFoundError);
    expect(detectAwsError('NoSuchEntity', 255)).toBeInstanceOf(AwsNotFoundError);
    expect(detectAwsError('NoSuchBucket', 255)).toBeInstanceOf(AwsNotFoundError);
  });

  it('falls back to the base exec error', () => {
    const err = detectAwsError('some unexpected failure', 1);
    expect(err).toBeInstanceOf(AwsExecError);
    expect(err).not.toBeInstanceOf(AwsAuthError);
  });

  it('honours precedence: an auth+throttling message classifies as auth', () => {
    const err = detectAwsError('Unable to locate credentials; also Throttling: Rate exceeded', 255);
    expect(err).toBeInstanceOf(AwsAuthError);
  });

  it('honours precedence: a session-expired+access-denied message classifies as session-expired', () => {
    const err = detectAwsError('ExpiredToken and AccessDenied', 255);
    expect(err).toBeInstanceOf(AwsSessionExpiredError);
  });
});

// ---------------------------------------------------------------------------
// detectErrorType mapping (class -> enum)
// ---------------------------------------------------------------------------

describe('detectErrorType mapping', () => {
  it('maps each error class to its enum', () => {
    expect(detectErrorType(new AwsAuthError('x'))).toBe('auth_required');
    expect(detectErrorType(new AwsSessionExpiredError('x'))).toBe('session_expired');
    expect(detectErrorType(new AwsThrottlingError('x'))).toBe('throttled');
    expect(detectErrorType(new AwsAccessDeniedError('x'))).toBe('access_denied');
    expect(detectErrorType(new AwsNotFoundError('x'))).toBe('not_found');
    expect(detectErrorType(new AwsExecError('x'))).toBe('exec_error');
    expect(detectErrorType(new Error('x'))).toBe('exec_error');
    expect(detectErrorType('not an error')).toBe('exec_error');
  });
});

// ---------------------------------------------------------------------------
// Argv hygiene
// ---------------------------------------------------------------------------

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
    expect(hasControlChars("s3 ls --query 'Contents[].Key'")).toBe(false);
    expect(hasControlChars('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// makeExecApi signal threading (spy on Bun.spawn)
// ---------------------------------------------------------------------------

describe('makeExecApi forwards AbortSignal to Bun.spawn only while live', () => {
  const realSpawn = Bun.spawn;

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
    await makeExecApi('/tmp').exec('aws', ['sts', 'get-caller-identity'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(true);
    expect(recordedOptions?.signal).toBe(controller.signal);
  });

  it('withholds an already-aborted (stale) signal from Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    controller.abort(); // stale abort left over from a prior turn
    await makeExecApi('/tmp').exec('aws', ['sts', 'get-caller-identity'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(false);
  });
});

describe('makeExecApi live execution', () => {
  it('a non-aborted signal still returns output', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    const r = await api.exec('sh', ['-c', 'echo hello-live'], { signal: controller.signal });
    expect(r.stdout).toBe('hello-live');
    expect(r.exitCode).toBe(0);
  });

  it('a stale, already-aborted signal does NOT false-cancel a fresh command', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    controller.abort();
    const r = await api.exec('sh', ['-c', 'echo still-runs'], { signal: controller.signal });
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
