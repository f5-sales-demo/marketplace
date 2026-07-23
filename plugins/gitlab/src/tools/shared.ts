import type { GlabExecApi } from '../glab/exec';
import { GlabAuthError, GlabNotFoundError, GlabRateLimitError } from '../glab/exec';
import type { GlabIssue, GlabProject } from '../glab/types';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type GlabErrorType = 'auth_required' | 'not_found' | 'rate_limited' | 'exec_error';

export interface GlabToolDetails {
  tool?: 'glab_setup' | 'glab_issue_list' | 'glab_issue_view' | 'glab_search';
  items?: GlabIssue[];
  issue?: GlabIssue;
  projects?: GlabProject[];
  total?: number;
  project?: string;
  query?: string;
  errorType?: GlabErrorType;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

export function textResult(text: string, details?: GlabToolDetails) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function errorResult(text: string, details?: GlabToolDetails) {
  return { content: [{ type: 'text' as const, text }], isError: true, details };
}

export function detectErrorType(err: unknown): GlabErrorType {
  if (err instanceof GlabAuthError) return 'auth_required';
  if (err instanceof GlabNotFoundError) return 'not_found';
  if (err instanceof GlabRateLimitError) return 'rate_limited';
  return 'exec_error';
}

export function renderError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Argv hygiene (shared with the glab_exec guard — Task 5)
// ---------------------------------------------------------------------------

// Blocks ASCII C0 control characters and DEL (0x7f), but allows tab (0x09),
// LF (0x0A), and CR (0x0D) so multi-line `--jq`/field expressions survive intact.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional argv hygiene (allow tab/LF/CR)
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

export function hasControlChars(arg: string): boolean {
  return CONTROL_CHAR_PATTERN.test(arg);
}

// ---------------------------------------------------------------------------
// Exec API factory
// ---------------------------------------------------------------------------

export function makeExecApi(cwd: string): GlabExecApi {
  return {
    cwd,
    async exec(command: string, args: string[], options?: { signal?: AbortSignal; cwd?: string }) {
      // Thread the AbortSignal so a genuine in-flight cancellation actually
      // terminates the child: Bun kills the process, leaving empty stdout + a
      // non-zero exit, which execGlab recognizes as a real cancellation.
      //
      // We must NOT reintroduce the stale-signal false-cancel this call site
      // used to guard against: xcsh can hand us an AbortSignal that already
      // fired in a PRIOR multi-turn tool call, and a stale abort must never
      // cancel a fresh command. So we never pre-check signal.aborted to throw a
      // "cancelled" before running, and we only wire the signal into Bun.spawn
      // while it is still live at spawn time — handing an already-aborted
      // (stale) signal to Bun.spawn would kill the fresh process immediately,
      // resurrecting exactly that false cancel. A signal that aborts *during*
      // the run is still honored and cancels for real.
      const signal = options?.signal;
      const child = Bun.spawn([command, ...args], {
        cwd: options?.cwd ?? cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ...(signal && !signal.aborted ? { signal } : {}),
      });
      if (!child.stdout || !child.stderr) {
        return { stdout: '', stderr: 'Failed to capture output', code: 1, killed: false };
      }
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: exitCode ?? 0,
        killed: child.killed,
      };
    },
  };
}
