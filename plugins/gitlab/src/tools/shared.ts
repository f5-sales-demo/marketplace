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

// ---------------------------------------------------------------------------
// Exec API factory
// ---------------------------------------------------------------------------

export function makeExecApi(cwd: string): GlabExecApi {
  return {
    cwd,
    async exec(command: string, args: string[], options?: { signal?: AbortSignal; cwd?: string }) {
      // Never pass signal to Bun.spawn and never pre-check signal.aborted.
      // glab commands finish in 1-3s. Passing the signal or pre-checking causes
      // false cancellations when xcsh's AbortSignal fires between multi-turn
      // tool calls (the signal is stale from a prior turn).
      const child = Bun.spawn([command, ...args], {
        cwd: options?.cwd ?? cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
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
