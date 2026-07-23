import {
  GcloudAuthError,
  type GcloudExecApi,
  GcloudNotFoundError,
  GcloudPermissionError,
  GcloudSessionExpiredError,
} from '../gcloud/exec';
import type { GcloudBucket, GcloudConfig, GcloudInstance, GcloudProject, GcloudRawResult } from '../gcloud/types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type GcloudErrorType = 'auth_required' | 'session_expired' | 'not_found' | 'permission_denied' | 'exec_error';

export interface GcloudToolDetails {
  tool: string;
  action?: string;
  config?: GcloudConfig;
  projects?: GcloudProject[];
  instances?: GcloudInstance[];
  buckets?: GcloudBucket[];
  errorType?: GcloudErrorType;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export function textResult(text: string, details?: GcloudToolDetails) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function errorResult(text: string, details?: GcloudToolDetails) {
  return { content: [{ type: 'text' as const, text }], isError: true, details };
}

export function detectErrorType(err: unknown): GcloudErrorType {
  if (err instanceof GcloudAuthError) return 'auth_required';
  if (err instanceof GcloudSessionExpiredError) return 'session_expired';
  if (err instanceof GcloudPermissionError) return 'permission_denied';
  if (err instanceof GcloudNotFoundError) return 'not_found';
  return 'exec_error';
}

export function renderError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Argv hygiene (shared with the gcloud_exec guard — later task)
// ---------------------------------------------------------------------------

// Blocks ASCII C0 control characters and DEL (0x7f), but allows tab (0x09),
// LF (0x0A), and CR (0x0D) so multi-line `--filter`/`--format` expressions
// survive intact. Uses a charCode scan (not a regex) so no control-char literal
// appears in source and no lint suppression is needed.
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

export function makeExecApi(cwd: string): GcloudExecApi {
  return {
    async exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<GcloudRawResult> {
      // Thread the AbortSignal so a genuine in-flight cancellation actually
      // terminates the child. We must NOT pre-check signal.aborted to throw a
      // "cancelled" before running, and we only wire the signal into Bun.spawn
      // while it is still live at spawn time — handing an already-aborted
      // (stale) signal to Bun.spawn would kill the fresh process immediately,
      // resurrecting a false cancel from a prior multi-turn tool call. A signal
      // that aborts *during* the run is still honored and cancels for real.
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
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: exitCode ?? 0 };
    },
  };
}
