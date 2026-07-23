import { describe, expect, it } from 'bun:test';
import { detectGlabError, GlabAuthError, GlabExecError, GlabNotFoundError, GlabRateLimitError } from '../../src/glab/exec';
import { detectErrorType } from '../../src/tools/shared';

describe('detectGlabError', () => {
  it('classifies auth failures', () => {
    expect(detectGlabError('you must be authenticated: auth failed', '', 1)).toBeInstanceOf(GlabAuthError);
    expect(detectGlabError('not logged in to gitlab.com', '', 1)).toBeInstanceOf(GlabAuthError);
    expect(detectGlabError('invalid token provided', '', 1)).toBeInstanceOf(GlabAuthError);
  });
  it('classifies not-found failures', () => {
    expect(detectGlabError('GET https://gitlab.com/... 404 Not Found', '', 1)).toBeInstanceOf(GlabNotFoundError);
    expect(detectGlabError('the resource was not found', '', 1)).toBeInstanceOf(GlabNotFoundError);
    expect(detectGlabError('could not resolve project', '', 1)).toBeInstanceOf(GlabNotFoundError);
  });
  it('classifies rate-limit failures', () => {
    expect(detectGlabError('HTTP 429 Too Many Requests', '', 1)).toBeInstanceOf(GlabRateLimitError);
    expect(detectGlabError('api rate limit exceeded', '', 1)).toBeInstanceOf(GlabRateLimitError);
    expect(detectGlabError('secondary rate limit hit', '', 1)).toBeInstanceOf(GlabRateLimitError);
  });
  it('falls back to base GlabExecError and preserves the message', () => {
    const e = detectGlabError('some other failure', '', 7);
    expect(e).toBeInstanceOf(GlabExecError);
    expect(e).not.toBeInstanceOf(GlabAuthError);
    expect(e).not.toBeInstanceOf(GlabNotFoundError);
    expect(e).not.toBeInstanceOf(GlabRateLimitError);
    expect(e.message).toContain('some other failure');
    expect(e.code).toBe(7);
  });
  it('preserves the decorated auth message text', () => {
    const e = detectGlabError('token expired', '', 1);
    expect(e.message).toContain('GitLab auth error');
    expect(e.message).toContain('glab_setup');
  });
  it('preserves the decorated not-found message text', () => {
    const e = detectGlabError('404 not found', '', 1);
    expect(e.message).toContain('not found (404/403)');
  });
  it('uses stdout when stderr is empty', () => {
    const e = detectGlabError('', 'could not resolve project', 1);
    expect(e).toBeInstanceOf(GlabNotFoundError);
  });
  it('prefers auth over other classifications when multiple signals present', () => {
    const e = detectGlabError('invalid token; 404 not found; rate limit', '', 1);
    expect(e).toBeInstanceOf(GlabAuthError);
  });
  it('prefers rate-limit over not-found when both signals present', () => {
    const e = detectGlabError('HTTP 404 - rate limit exceeded', '', 1);
    expect(e).toBeInstanceOf(GlabRateLimitError);
  });
});

describe('detectErrorType', () => {
  it('maps each class to its enum', () => {
    expect(detectErrorType(new GlabAuthError('x'))).toBe('auth_required');
    expect(detectErrorType(new GlabNotFoundError('x'))).toBe('not_found');
    expect(detectErrorType(new GlabRateLimitError('x'))).toBe('rate_limited');
    expect(detectErrorType(new GlabExecError('x'))).toBe('exec_error');
    expect(detectErrorType(new Error('x'))).toBe('exec_error');
  });
});
