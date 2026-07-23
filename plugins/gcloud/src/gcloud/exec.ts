import type { GcloudRawResult } from './types';

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

export class GcloudExecError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
    this.name = 'GcloudExecError';
  }
}

export class GcloudAuthError extends GcloudExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'GcloudAuthError';
  }
}

export class GcloudSessionExpiredError extends GcloudExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'GcloudSessionExpiredError';
  }
}

export class GcloudNotFoundError extends GcloudExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'GcloudNotFoundError';
  }
}

export class GcloudPermissionError extends GcloudExecError {
  constructor(message: string, exitCode = 1) {
    super(message, exitCode);
    this.name = 'GcloudPermissionError';
  }
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify a failed `gcloud` invocation into the appropriate GcloudExecError
 * subclass by inspecting stderr. Precedence:
 * auth > session-expired > permission > not-found > generic.
 */
export function detectGcloudError(stderr: string, exitCode: number): GcloudExecError {
  const lower = stderr.toLowerCase();

  if (
    lower.includes('do not currently have an active account') ||
    lower.includes('gcloud auth login') ||
    lower.includes('does not have any valid credentials') ||
    lower.includes('no active account')
  ) {
    return new GcloudAuthError(stderr, exitCode);
  }

  if (
    lower.includes('reauthentication required') ||
    lower.includes('reauthentication failed') ||
    lower.includes('invalid_grant') ||
    lower.includes('token has been expired or revoked')
  ) {
    return new GcloudSessionExpiredError(stderr, exitCode);
  }

  if (
    lower.includes('permission_denied') ||
    lower.includes('does not have permission') ||
    lower.includes('permission denied') ||
    lower.includes('caller does not have permission') ||
    lower.includes('forbidden') ||
    lower.includes('403')
  ) {
    return new GcloudPermissionError(stderr, exitCode);
  }

  if (
    lower.includes('not_found') ||
    lower.includes('was not found') ||
    lower.includes('does not exist') ||
    lower.includes('404')
  ) {
    return new GcloudNotFoundError(stderr, exitCode);
  }

  return new GcloudExecError(stderr, exitCode);
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

export function parseGcloudJsonOutput<T>(raw: string): T {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new GcloudExecError('Empty output from gcloud CLI');
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    if (err instanceof GcloudExecError) throw err;
    throw new GcloudExecError(`Failed to parse gcloud CLI output: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Exec helpers
// ---------------------------------------------------------------------------

export interface GcloudExecApi {
  exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<GcloudRawResult>;
}

export async function execGcloudJson<T>(api: GcloudExecApi, args: string[], signal?: AbortSignal): Promise<T> {
  const fullArgs = [...args, '--format=json'];
  const result = await api.exec('gcloud', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectGcloudError(result.stderr, result.exitCode);
  }
  return parseGcloudJsonOutput<T>(result.stdout);
}

export async function execGcloudRaw(
  api: GcloudExecApi,
  args: string[],
  signal?: AbortSignal,
): Promise<GcloudRawResult> {
  const result = await api.exec('gcloud', args, { signal });
  if (result.exitCode !== 0) {
    throw detectGcloudError(result.stderr, result.exitCode);
  }
  return result;
}
