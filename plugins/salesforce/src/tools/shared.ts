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
// Argv hygiene (shared with the sf_exec guard)
// ---------------------------------------------------------------------------

// Blocks ASCII C0 control characters and DEL (0x7f), but allows tab (0x09),
// LF (0x0A), and CR (0x0D) so multi-line SOQL/field expressions survive intact.
// Uses a charCode scan (not a regex) so no control-char literal appears in source
// and no lint suppression is needed.
export function hasControlChars(arg: string): boolean {
  for (let i = 0; i < arg.length; i++) {
    const c = arg.charCodeAt(i);
    if (c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31) || c === 127) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Exec API factory
// ---------------------------------------------------------------------------

export function makeExecApi(cwd: string): SfExecApi {
  return {
    async exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<SfRawResult> {
      // Thread the AbortSignal so a genuine in-flight cancellation actually
      // terminates the child: Bun kills the process, which surfaces as a
      // non-zero exit that execSf* treats as a real failure/cancellation.
      //
      // We must NOT reintroduce the stale-signal false-cancel this call site
      // previously guarded against by refusing the signal entirely: xcsh can
      // hand us an AbortSignal that already fired in a PRIOR multi-turn tool
      // call, and a stale abort must never cancel a fresh sf command (they
      // finish in 1-5s). So we never pre-check signal.aborted to throw a
      // "cancelled" before running, and we only wire the signal into Bun.spawn
      // while it is still live at spawn time — handing an already-aborted
      // (stale) signal to Bun.spawn would kill the fresh process immediately,
      // resurrecting exactly that false cancel. A signal that aborts *during*
      // the run is still honored and cancels for real.
      const signal = options?.signal;
      const child = Bun.spawn([command, ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ...(signal && !signal.aborted ? { signal } : {}),
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
