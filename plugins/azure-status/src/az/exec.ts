import type { AzRawResult } from './types';

export class AzExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzExecError';
  }
}

export class AzAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzAuthError';
  }
}

export class AzSessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzSessionExpiredError';
  }
}

export class AzNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzNotFoundError';
  }
}

export function detectAzError(stderr: string, _exitCode: number): Error {
  const lower = stderr.toLowerCase();
  if (lower.includes('az login') || lower.includes('no subscription found')) {
    return new AzAuthError(stderr);
  }
  if (lower.includes('aadsts') || lower.includes('token has expired') || lower.includes('not yet valid')) {
    return new AzSessionExpiredError(stderr);
  }
  return new AzExecError(stderr);
}

export function parseAzJsonOutput<T>(raw: string): T {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new AzExecError('Empty output from az CLI');
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    if (err instanceof AzExecError) throw err;
    throw new AzExecError(`Failed to parse az CLI output: ${(err as Error).message}`);
  }
}

export interface AzExecApi {
  exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<AzRawResult>;
}

export async function execAzJson<T>(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<T> {
  const fullArgs = [...args, '--output', 'json'];
  const result = await api.exec('az', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectAzError(result.stderr, result.exitCode);
  }
  return parseAzJsonOutput<T>(result.stdout);
}

export async function execAzRaw(api: AzExecApi, args: string[], signal?: AbortSignal): Promise<AzRawResult> {
  const result = await api.exec('az', args, { signal });
  if (result.exitCode !== 0) {
    throw detectAzError(result.stderr, result.exitCode);
  }
  return result;
}
