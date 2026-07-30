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

// The line sf emits between the caret block and its explanation of what went wrong.
const QUERY_ERROR_LOCATOR = /^ERROR at Row:\d+:Column:\d+$/m;

const DESCRIBE_HINT =
  'Field and object names vary by org — confirm them with sf_describe before retrying, e.g. sf_describe {sobject: "Opportunity", match: "competitor"}.';

/**
 * Put the actionable sentence first.
 *
 * sf formats a query error as `<soql window>\n<caret>\nERROR at Row:R:Column:C\n<explanation>`,
 * where the explanation ("No such column 'X' on entity 'Y'") is the only part that says what to
 * fix — and it comes LAST, so a host UI that truncates tool output shows the caret block and
 * hides the answer. That is exactly how this surfaced: the agent saw a bare caret block, could
 * not tell which column was rejected, and shelled out to reverse-engineer the schema by hand.
 *
 * The original block is retained after the hint; nothing is discarded, only reordered.
 */
function formatQueryError(raw: string): string {
  const detail = raw.trim();
  const locator = QUERY_ERROR_LOCATOR.exec(detail);
  const explanation = locator ? detail.slice(locator.index + locator[0].length).trim() : '';
  if (!locator || !explanation) return `${detail}\n\n${DESCRIBE_HINT}`;
  return `${explanation} [${locator[0]}]\n\n${DESCRIBE_HINT}\n\n${detail}`;
}

export class SfQueryError extends SfExecError {
  constructor(
    message: string,
    readonly query: string,
  ) {
    super(formatQueryError(message), 1);
    this.name = 'SfQueryError';
  }
}

/**
 * sf error identifiers that mean "the SOQL itself is wrong", all of which are fixed by looking up
 * the org's real schema. Captured from a live org: a bad column is INVALID_FIELD, a bad object is
 * INVALID_TYPE, a bad operator is INVALID_QUERY_FILTER_OPERATOR, bad syntax is MALFORMED_QUERY.
 */
const QUERY_ERROR_CODES: ReadonlySet<string> = new Set([
  'MALFORMED_QUERY',
  'INVALID_FIELD',
  'INVALID_TYPE',
  'INVALID_QUERY_FILTER_OPERATOR',
]);

/**
 * `errorCode` is the sf payload's `name` field. It is NOT optional decoration: sf puts the error
 * identifier there and nowhere else, so the `message` scans below never fire on a real payload —
 * they exist only for the raw-stderr path (execSfRaw), which has no structured code to read.
 */
export function detectSfError(message: string, exitCode: number, query?: string, errorCode?: string): Error {
  const lower = message.toLowerCase();
  const code = (errorCode ?? '').toUpperCase();
  if (code === 'INVALID_SESSION_ID' || lower.includes('invalid_session_id')) {
    return new SfSessionExpiredError();
  }
  if (lower.includes('no default org')) {
    return new SfNoDefaultOrgError();
  }
  if (lower.includes('no orgs found')) {
    return new SfAuthError();
  }
  const isQueryError =
    QUERY_ERROR_CODES.has(code) || lower.includes('malformed_query') || lower.includes('invalid_field');
  if (isQueryError && query !== undefined) {
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
    throw detectSfError(parsed.message, parsed.status, query, parsed.name);
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
