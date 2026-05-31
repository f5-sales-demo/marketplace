import type { SfJsonResult, SfRawResult } from './types';

export type { SfRawResult } from './types';

export class SfNotFoundError extends Error {
  constructor() {
    super('Salesforce CLI (sf) is not installed. Install with: brew install sf');
    this.name = 'SfNotFoundError';
  }
}

export class SfAuthError extends Error {
  constructor() {
    super('No authenticated Salesforce orgs found. Run: sf org login web --set-default --alias SFDC');
    this.name = 'SfAuthError';
  }
}

export class SfSessionExpiredError extends Error {
  constructor() {
    super('Salesforce session expired. Re-authenticate with: sf org login web --set-default --alias SFDC');
    this.name = 'SfSessionExpiredError';
  }
}

export class SfNoDefaultOrgError extends Error {
  constructor() {
    super(
      "Authenticated orgs exist but no default is set. Run sf_setup with action 'set_default' to choose a default org.",
    );
    this.name = 'SfNoDefaultOrgError';
  }
}

export class SfExecError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(`sf CLI error (exit ${exitCode}): ${message}`);
    this.name = 'SfExecError';
  }
}

export class SfQueryError extends SfExecError {
  constructor(
    message: string,
    readonly query: string,
  ) {
    super(message, 1);
    this.name = 'SfQueryError';
  }
}

export function detectSfError(message: string, exitCode: number, query?: string): Error {
  const lower = message.toLowerCase();
  if (lower.includes('invalid_session_id')) {
    return new SfSessionExpiredError();
  }
  if (lower.includes('no default org')) {
    return new SfNoDefaultOrgError();
  }
  if (lower.includes('no orgs found')) {
    return new SfAuthError();
  }
  if ((lower.includes('malformed_query') || lower.includes('invalid_field')) && query !== undefined) {
    return new SfQueryError(message, query);
  }
  return new SfExecError(message, exitCode);
}

export function parseSfJsonOutput(raw: string): SfJsonResult {
  try {
    return JSON.parse(raw) as SfJsonResult;
  } catch {
    throw new SfExecError('Failed to parse sf CLI JSON output', 1);
  }
}

export interface SfExecApi {
  exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<SfRawResult>;
}

export async function execSfJson(
  api: SfExecApi,
  args: string[],
  signal?: AbortSignal,
  query?: string,
): Promise<SfJsonResult> {
  const result = await api.exec('sf', [...args, '--json'], { signal });
  const parsed = parseSfJsonOutput(result.stdout);
  if (parsed.status !== 0 && parsed.message !== undefined) {
    throw detectSfError(parsed.message, parsed.status, query);
  }
  return parsed;
}

export async function execSfRaw(api: SfExecApi, args: string[], signal?: AbortSignal): Promise<SfRawResult> {
  const result = await api.exec('sf', args, { signal });
  if (result.exitCode !== 0) {
    throw detectSfError(result.stderr || result.stdout, result.exitCode);
  }
  return result;
}
