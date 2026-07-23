export class GhExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhExecError';
  }
}
export class GhAuthError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhAuthError';
  }
}
export class GhNotFoundError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhNotFoundError';
  }
}
export class GhRateLimitError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhRateLimitError';
  }
}

export type GhErrorType = 'auth_required' | 'not_found' | 'rate_limited' | 'exec_error';

export function detectGhError(
  stderr: string,
  stdout: string,
  exitCode: number,
  opts?: { repoProvided?: boolean; args?: readonly string[] },
): GhExecError {
  const raw = (stderr || stdout).trim();
  const lower = raw.toLowerCase();

  if (lower.includes('gh auth login') || lower.includes('not logged into any github hosts')) {
    return new GhAuthError('GitHub CLI is not authenticated. Run `gh auth login`.');
  }
  if (
    lower.includes('api rate limit exceeded') ||
    lower.includes('secondary rate limit') ||
    lower.includes('http 429')
  ) {
    return new GhRateLimitError(`GitHub API rate limit reached. ${raw}`.trim());
  }
  if (
    lower.includes('could not resolve to a') ||
    lower.includes('http 404') ||
    lower.includes('no pull requests found') ||
    lower.includes('no issues found')
  ) {
    return new GhNotFoundError(raw || 'GitHub resource not found.');
  }
  if (
    !opts?.repoProvided &&
    (lower.includes('not a git repository') ||
      lower.includes('no git remotes found') ||
      lower.includes('unable to determine current repository'))
  ) {
    return new GhExecError(
      'GitHub repository context is unavailable. Pass `repo` explicitly or run the tool inside a GitHub checkout.',
    );
  }
  if (raw.length > 0) return new GhExecError(raw);
  return new GhExecError(`GitHub CLI command failed (exit ${exitCode}): gh ${(opts?.args ?? []).join(' ')}`.trim());
}

export function detectGhErrorType(err: unknown): GhErrorType {
  if (err instanceof GhAuthError) return 'auth_required';
  if (err instanceof GhNotFoundError) return 'not_found';
  if (err instanceof GhRateLimitError) return 'rate_limited';
  return 'exec_error';
}
