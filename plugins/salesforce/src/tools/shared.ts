import type { PipelineReportData } from '../pipeline-report/types';
import { SfAuthError, type SfExecApi, SfNoDefaultOrgError, SfQueryError, SfSessionExpiredError } from '../sf/exec';
import type { SfOrg, SfQueryResult, SfRawResult } from '../sf/types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type SfErrorType = 'auth_required' | 'session_expired' | 'no_default_org' | 'invalid_query' | 'exec_error';

export interface SfToolDetails {
  tool: 'sf_setup' | 'sf_query' | 'sf_org_display' | 'sf_pipeline_report';
  action?: string;
  orgs?: SfOrg[];
  queryResult?: SfQueryResult;
  queryDescription?: string;
  pipelineReport?: PipelineReportData;
  errorType?: SfErrorType;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export function textResult(text: string, details: SfToolDetails) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function errorResult(text: string, details: SfToolDetails) {
  return { content: [{ type: 'text' as const, text }], isError: true, details };
}

export function detectErrorType(err: unknown): SfErrorType {
  if (err instanceof SfAuthError) return 'auth_required';
  if (err instanceof SfSessionExpiredError) return 'session_expired';
  if (err instanceof SfNoDefaultOrgError) return 'no_default_org';
  if (err instanceof SfQueryError) return 'invalid_query';
  return 'exec_error';
}

// ---------------------------------------------------------------------------
// Exec API factory
// ---------------------------------------------------------------------------

export function makeExecApi(cwd: string): SfExecApi {
  return {
    async exec(command: string, args: string[], _options?: { signal?: AbortSignal }): Promise<SfRawResult> {
      // Never pass signal to Bun.spawn and never pre-check signal.aborted.
      // sf commands finish in 1-5s. Passing the signal or pre-checking causes
      // false cancellations when xcsh's AbortSignal fires between multi-turn
      // tool calls (the signal is stale from a prior turn).
      const child = Bun.spawn([command, ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      });
      if (!child.stdout || !child.stderr) {
        return { stdout: '', stderr: 'Failed to capture output', exitCode: 1 };
      }
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: exitCode ?? 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Org normalization (from xcsh sf.ts)
// ---------------------------------------------------------------------------

export function normalizeOrg(raw: Record<string, unknown>): SfOrg {
  return {
    alias: raw.alias as string | undefined,
    username: raw.username as string,
    orgId: (raw.orgId ?? raw.orgid) as string,
    instanceUrl: raw.instanceUrl as string,
    connectedStatus: (raw.connectedStatus ?? 'Unknown') as string,
    isDefault: Boolean(raw.isDefaultUsername) || String(raw.defaultMarker ?? '').includes('(U)'),
    isSandbox: Boolean(raw.isSandbox),
  };
}

function normalizeOrgList(rawOrgs: Record<string, unknown>[]): SfOrg[] {
  return (rawOrgs ?? []).map(normalizeOrg);
}

export function collectAllOrgs(orgList: Record<string, unknown[]>): SfOrg[] {
  const all = [
    ...normalizeOrgList((orgList.nonScratchOrgs ?? []) as Record<string, unknown>[]),
    ...normalizeOrgList((orgList.scratchOrgs ?? []) as Record<string, unknown>[]),
    ...normalizeOrgList((orgList.sandboxes ?? []) as Record<string, unknown>[]),
    ...normalizeOrgList((orgList.devHubs ?? []) as Record<string, unknown>[]),
    ...normalizeOrgList((orgList.other ?? []) as Record<string, unknown>[]),
  ];
  const seen = new Set<string>();
  return all.filter((org) => {
    if (seen.has(org.orgId)) return false;
    seen.add(org.orgId);
    return true;
  });
}
