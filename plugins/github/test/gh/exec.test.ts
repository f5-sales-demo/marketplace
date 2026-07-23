import { describe, expect, it } from 'bun:test';
import {
  detectGhError,
  detectGhErrorType,
  GhAuthError,
  GhExecError,
  GhNotFoundError,
  GhRateLimitError,
} from '../../src/gh/exec';

describe('detectGhError', () => {
  it('classifies auth failures', () => {
    expect(detectGhError('gh auth login required', '', 1)).toBeInstanceOf(GhAuthError);
    expect(detectGhError('not logged into any GitHub hosts', '', 1)).toBeInstanceOf(GhAuthError);
  });
  it('classifies not-found failures', () => {
    expect(detectGhError('Could not resolve to a Repository', '', 1)).toBeInstanceOf(GhNotFoundError);
    expect(detectGhError('gh: HTTP 404', '', 1)).toBeInstanceOf(GhNotFoundError);
    expect(detectGhError('no pull requests found', '', 1)).toBeInstanceOf(GhNotFoundError);
  });
  it('classifies rate-limit failures', () => {
    expect(detectGhError('API rate limit exceeded for user', '', 1)).toBeInstanceOf(GhRateLimitError);
    expect(detectGhError('You have exceeded a secondary rate limit', '', 1)).toBeInstanceOf(GhRateLimitError);
    expect(detectGhError('gh: HTTP 429', '', 1)).toBeInstanceOf(GhRateLimitError);
  });
  it('falls back to GhExecError and preserves the message', () => {
    const e = detectGhError('some other failure', '', 1);
    expect(e).toBeInstanceOf(GhExecError);
    expect(e).not.toBeInstanceOf(GhAuthError);
    expect(e.message).toContain('some other failure');
  });
  it('gives a repo-context hint when repo not provided', () => {
    const e = detectGhError('no git remotes found', '', 1, { repoProvided: false });
    expect(e.message.toLowerCase()).toContain('repository context');
  });
  it('uses stdout/args fallback when stderr is empty', () => {
    const e = detectGhError('', '', 1, { args: ['pr', 'view', '999'] });
    expect(e.message).toContain('gh pr view 999');
  });
  it('prefers rate-limit over not-found when both signals present', () => {
    const e = detectGhError('gh: HTTP 404 - API rate limit exceeded for user', '', 1);
    expect(e).toBeInstanceOf(GhRateLimitError);
  });
  it('prefers auth over rate-limit when both signals present', () => {
    const e = detectGhError('run `gh auth login`; API rate limit exceeded for user', '', 1);
    expect(e).toBeInstanceOf(GhAuthError);
  });
  it('bypasses the repo-context branch when repoProvided is true', () => {
    const e = detectGhError('no git remotes found', '', 1, { repoProvided: true });
    expect(e).toBeInstanceOf(GhExecError);
    expect(e.message.toLowerCase()).not.toContain('repository context');
    expect(e.message).toContain('no git remotes found');
  });
  it('classifies "no issues found" as not-found', () => {
    expect(detectGhError('no issues found', '', 1)).toBeInstanceOf(GhNotFoundError);
  });
  it('includes the exit code in the synthesized fallback message', () => {
    const e = detectGhError('', '', 2, { args: ['pr', 'view', '9'] });
    expect(e.message).toContain('exit 2');
    expect(e.message).toContain('gh pr view 9');
  });
});

describe('detectGhErrorType', () => {
  it('maps each class to its enum', () => {
    expect(detectGhErrorType(new GhAuthError('x'))).toBe('auth_required');
    expect(detectGhErrorType(new GhNotFoundError('x'))).toBe('not_found');
    expect(detectGhErrorType(new GhRateLimitError('x'))).toBe('rate_limited');
    expect(detectGhErrorType(new GhExecError('x'))).toBe('exec_error');
    expect(detectGhErrorType(new Error('x'))).toBe('exec_error');
  });
});
