import {
  AwsAccessDeniedError,
  AwsAuthError,
  type AwsExecApi,
  AwsNotFoundError,
  AwsSessionExpiredError,
  AwsThrottlingError,
} from '../aws/exec';
import type { AwsBucket, AwsEc2Instance, AwsIdentity, AwsRawResult, AwsS3Object } from '../aws/types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type AwsErrorType =
  | 'auth_required'
  | 'session_expired'
  | 'not_found'
  | 'throttled'
  | 'access_denied'
  | 'exec_error';

export interface AwsToolDetails {
  tool: string;
  action?: string;
  identity?: AwsIdentity;
  buckets?: AwsBucket[];
  objects?: AwsS3Object[];
  instances?: AwsEc2Instance[];
  errorType?: AwsErrorType;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export function textResult(text: string, details?: AwsToolDetails) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function errorResult(text: string, details?: AwsToolDetails) {
  return { content: [{ type: 'text' as const, text }], isError: true, details };
}

export function detectErrorType(err: unknown): AwsErrorType {
  if (err instanceof AwsAuthError) return 'auth_required';
  if (err instanceof AwsSessionExpiredError) return 'session_expired';
  if (err instanceof AwsThrottlingError) return 'throttled';
  if (err instanceof AwsAccessDeniedError) return 'access_denied';
  if (err instanceof AwsNotFoundError) return 'not_found';
  return 'exec_error';
}

export function renderError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Argv hygiene (shared with the aws_exec guard — later task)
// ---------------------------------------------------------------------------

// Blocks ASCII C0 control characters and DEL (0x7f), but allows tab (0x09),
// LF (0x0A), and CR (0x0D) so multi-line `--query`/filter expressions survive
// intact. Uses a charCode scan (not a regex) so no control-char literal appears
// in source and no lint suppression is needed.
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

export function makeExecApi(cwd: string): AwsExecApi {
  return {
    async exec(command: string, args: string[], options?: { signal?: AbortSignal }): Promise<AwsRawResult> {
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
