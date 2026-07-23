import type { AwsRawResult } from './types';

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export class AwsExecError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = 'AwsExecError';
  }
}

export class AwsAuthError extends AwsExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsAuthError';
  }
}

export class AwsSessionExpiredError extends AwsExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsSessionExpiredError';
  }
}

export class AwsNotFoundError extends AwsExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsNotFoundError';
  }
}

export class AwsThrottlingError extends AwsExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsThrottlingError';
  }
}

export class AwsAccessDeniedError extends AwsExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'AwsAccessDeniedError';
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify a failed `aws` invocation into the appropriate AwsExecError subclass
 * by inspecting stderr. Precedence:
 * auth > session-expired > throttling > access-denied > not-found > generic.
 */
export function detectAwsError(stderr: string, exitCode: number): AwsExecError {
  const lower = stderr.toLowerCase();

  if (
    lower.includes('unable to locate credentials') ||
    lower.includes('could not be found') ||
    lower.includes('no credentials')
  ) {
    return new AwsAuthError(stderr, exitCode);
  }

  if (
    lower.includes('expiredtoken') ||
    lower.includes('invalidclienttokenid') ||
    lower.includes('token included in the request is expired') ||
    lower.includes('sso token') ||
    (lower.includes('sso') && lower.includes('expired'))
  ) {
    return new AwsSessionExpiredError(stderr, exitCode);
  }

  if (
    lower.includes('throttling') ||
    lower.includes('requestlimitexceeded') ||
    lower.includes('rate exceeded') ||
    lower.includes('toomanyrequests')
  ) {
    return new AwsThrottlingError(stderr, exitCode);
  }

  if (
    lower.includes('accessdenied') ||
    lower.includes('unauthorizedoperation') ||
    lower.includes('not authorized to perform')
  ) {
    return new AwsAccessDeniedError(stderr, exitCode);
  }

  if (
    lower.includes('notfound') ||
    lower.includes('does not exist') ||
    lower.includes('nosuchentity') ||
    lower.includes('nosuchbucket')
  ) {
    return new AwsNotFoundError(stderr, exitCode);
  }

  return new AwsExecError(stderr, exitCode);
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

export function parseAwsJsonOutput<T>(raw: string): T {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new AwsExecError('Empty output from aws CLI');
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    if (err instanceof AwsExecError) throw err;
    throw new AwsExecError(`Failed to parse aws CLI output: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Exec helpers
// ---------------------------------------------------------------------------

export interface AwsExecApi {
  exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<AwsRawResult>;
}

export async function execAwsJson<T>(api: AwsExecApi, args: string[], signal?: AbortSignal): Promise<T> {
  const fullArgs = [...args, '--output', 'json'];
  const result = await api.exec('aws', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectAwsError(result.stderr, result.exitCode);
  }
  return parseAwsJsonOutput<T>(result.stdout);
}

export async function execAwsRaw(api: AwsExecApi, args: string[], signal?: AbortSignal): Promise<AwsRawResult> {
  const result = await api.exec('aws', args, { signal });
  if (result.exitCode !== 0) {
    throw detectAwsError(result.stderr, result.exitCode);
  }
  return result;
}
