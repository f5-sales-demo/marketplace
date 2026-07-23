import { describe, expect, it } from 'bun:test';
import {
  GcloudAuthError,
  GcloudExecError,
  GcloudNotFoundError,
  GcloudPermissionError,
  GcloudSessionExpiredError,
} from '../../src/gcloud/exec';
import { detectErrorType, hasControlChars } from '../../src/tools/shared';

// ---------------------------------------------------------------------------
// Argv hygiene
// ---------------------------------------------------------------------------

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const VT = String.fromCharCode(11);
const FF = String.fromCharCode(12);
const US = String.fromCharCode(31);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(127);

describe('hasControlChars', () => {
  it('rejects control bytes and DEL', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${BEL}b`)).toBe(true);
    expect(hasControlChars(`a${VT}b`)).toBe(true);
    expect(hasControlChars(`a${FF}b`)).toBe(true);
    expect(hasControlChars(`a${US}b`)).toBe(true);
    expect(hasControlChars(`a${DEL}b`)).toBe(true);
  });

  it('allows plain text, tab, LF, CR, and a JMESPath-ish string', () => {
    expect(hasControlChars('plain text')).toBe(false);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars(`a${LF}b`)).toBe(false);
    expect(hasControlChars(`a${CR}b`)).toBe(false);
    expect(hasControlChars("a[?x=='y'] || b")).toBe(false);
    expect(hasControlChars('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectErrorType mapping (class -> enum)
// ---------------------------------------------------------------------------

describe('detectErrorType mapping', () => {
  it('maps each Gcloud error class to its enum', () => {
    expect(detectErrorType(new GcloudAuthError('x'))).toBe('auth_required');
    expect(detectErrorType(new GcloudSessionExpiredError('x'))).toBe('session_expired');
    expect(detectErrorType(new GcloudPermissionError('x'))).toBe('permission_denied');
    expect(detectErrorType(new GcloudNotFoundError('x'))).toBe('not_found');
    expect(detectErrorType(new GcloudExecError('x'))).toBe('exec_error');
  });

  it('maps unknown/non-gcloud errors to exec_error', () => {
    expect(detectErrorType(new Error('x'))).toBe('exec_error');
    expect(detectErrorType('not an error')).toBe('exec_error');
  });
});
