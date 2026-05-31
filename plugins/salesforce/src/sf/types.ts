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
}

export interface SfRawResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const SF_ORG_SAFE_FIELDS = ['username', 'orgId', 'instanceUrl', 'connectedStatus', 'alias'] as const;

export const ORG_ALIAS_PATTERN = /^[a-zA-Z0-9._@-]+$/;
