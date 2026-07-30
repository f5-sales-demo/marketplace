export interface SfOrg {
  alias?: string;
  username: string;
  orgId: string;
  instanceUrl: string;
  connectedStatus: string;
  isDefault: boolean;
  isSandbox: boolean;
}

export interface SfQueryResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  records: T[];
}

export interface SfOrgListResult {
  nonScratchOrgs: SfOrg[];
  sandboxes: SfOrg[];
  scratchOrgs: SfOrg[];
  devHubs: SfOrg[];
  other: SfOrg[];
}

export interface SfJsonResult {
  status: number;
  result: unknown;
  message?: string;
  warnings?: string[];
  /**
   * The sf CLI's error identifier (`INVALID_FIELD`, `MALFORMED_QUERY`, ...). It lives HERE,
   * never inside `message` — `message` carries only the human-facing caret block. Classifying
   * on `message` alone silently misses every real query error, so `execSfJson` reads this.
   */
  name?: string;
  /** Numeric-ish process code (`"1"`), NOT the error identifier. Falls back for older payloads. */
  code?: string | number;
}

export interface SfRawResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const SF_ORG_SAFE_FIELDS = ['username', 'orgId', 'instanceUrl', 'connectedStatus', 'alias'] as const;

export const ORG_ALIAS_PATTERN = /^[a-zA-Z0-9._@-]+$/;

/**
 * Salesforce object API names: letters, digits and underscores only, and never leading with a
 * digit or an underscore. Deliberately tighter than ORG_ALIAS_PATTERN — no '-' and no '.' — so a
 * value can be neither a shell metacharacter nor an argv-injected `--flag`.
 */
export const SOBJECT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
