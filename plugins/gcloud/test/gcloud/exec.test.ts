import { describe, expect, it } from 'bun:test';
import {
  detectGcloudError,
  GcloudAuthError,
  GcloudExecError,
  GcloudNotFoundError,
  GcloudPermissionError,
  GcloudSessionExpiredError,
  parseGcloudJsonOutput,
} from '../../src/gcloud/exec';

// ---------------------------------------------------------------------------
// detectGcloudError classification
// ---------------------------------------------------------------------------

describe('detectGcloudError classification', () => {
  it('classifies auth failures', () => {
    expect(detectGcloudError('You do not currently have an active account selected', 1)).toBeInstanceOf(
      GcloudAuthError,
    );
    expect(detectGcloudError('Please run: gcloud auth login', 1)).toBeInstanceOf(GcloudAuthError);
    expect(detectGcloudError('The account does not have any valid credentials', 1)).toBeInstanceOf(GcloudAuthError);
    expect(detectGcloudError('No active account found', 1)).toBeInstanceOf(GcloudAuthError);
  });

  it('classifies session-expired failures', () => {
    expect(detectGcloudError('Reauthentication required', 1)).toBeInstanceOf(GcloudSessionExpiredError);
    expect(detectGcloudError('Reauthentication failed', 1)).toBeInstanceOf(GcloudSessionExpiredError);
    expect(detectGcloudError('invalid_grant: Bad Request', 1)).toBeInstanceOf(GcloudSessionExpiredError);
    expect(detectGcloudError('Token has been expired or revoked.', 1)).toBeInstanceOf(GcloudSessionExpiredError);
  });

  it('classifies permission failures', () => {
    expect(detectGcloudError('PERMISSION_DENIED: missing scope', 1)).toBeInstanceOf(GcloudPermissionError);
    expect(detectGcloudError('The caller does not have permission', 1)).toBeInstanceOf(GcloudPermissionError);
    expect(detectGcloudError('Permission denied on resource', 1)).toBeInstanceOf(GcloudPermissionError);
    expect(detectGcloudError('403 Forbidden', 1)).toBeInstanceOf(GcloudPermissionError);
  });

  it('classifies not-found failures', () => {
    expect(detectGcloudError('NOT_FOUND: project missing', 1)).toBeInstanceOf(GcloudNotFoundError);
    expect(detectGcloudError('The resource was not found', 1)).toBeInstanceOf(GcloudNotFoundError);
    expect(detectGcloudError('Instance does not exist', 1)).toBeInstanceOf(GcloudNotFoundError);
    expect(detectGcloudError('404 error', 1)).toBeInstanceOf(GcloudNotFoundError);
  });

  it('falls back to the base exec error for unmatched stderr', () => {
    const err = detectGcloudError('some unexpected failure', 1);
    expect(err).toBeInstanceOf(GcloudExecError);
    expect(err).not.toBeInstanceOf(GcloudAuthError);
  });

  it('honours precedence: an auth+permission message classifies as auth', () => {
    const err = detectGcloudError('You do not currently have an active account; permission denied', 1);
    expect(err).toBeInstanceOf(GcloudAuthError);
  });

  it('honours precedence: a session-expired+permission message classifies as session-expired', () => {
    const err = detectGcloudError('Reauthentication required; permission denied', 1);
    expect(err).toBeInstanceOf(GcloudSessionExpiredError);
  });

  it('preserves the exit code on the produced error', () => {
    expect(detectGcloudError('PERMISSION_DENIED', 2).exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// parseGcloudJsonOutput
// ---------------------------------------------------------------------------

describe('parseGcloudJsonOutput', () => {
  it('parses valid JSON', () => {
    const parsed = parseGcloudJsonOutput<{ a: number }[]>('[{"a":1}]');
    expect(parsed).toEqual([{ a: 1 }]);
  });

  it('throws GcloudExecError on empty output', () => {
    expect(() => parseGcloudJsonOutput('')).toThrow(GcloudExecError);
    expect(() => parseGcloudJsonOutput('   ')).toThrow(GcloudExecError);
  });

  it('throws GcloudExecError on invalid JSON', () => {
    expect(() => parseGcloudJsonOutput('{not json')).toThrow(GcloudExecError);
  });
});
