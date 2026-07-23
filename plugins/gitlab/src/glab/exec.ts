export interface GlabExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

export interface GlabExecApi {
  cwd: string;
  exec(command: string, args: string[], options?: { signal?: AbortSignal; cwd?: string }): Promise<GlabExecResult>;
}

export class GlabExecError extends Error {
  constructor(
    message: string,
    public readonly code = 1,
  ) {
    super(message);
    this.name = 'GlabExecError';
  }
}

export class GlabAuthError extends GlabExecError {
  constructor(message: string, code = 1) {
    super(`GitLab auth error: ${message}. Run glab_setup with action "login".`, code);
    this.name = 'GlabAuthError';
  }
}

export class GlabNotFoundError extends GlabExecError {
  constructor(message: string, code = 1) {
    super(`GitLab resource not found (404/403): ${message}`, code);
    this.name = 'GlabNotFoundError';
  }
}

export class GlabRateLimitError extends GlabExecError {
  constructor(message: string, code = 1) {
    super(`GitLab API rate limit reached: ${message}`, code);
    this.name = 'GlabRateLimitError';
  }
}

/**
 * Classify a failed glab invocation into the appropriate GlabExecError
 * subclass by inspecting stderr (falling back to stdout). Precedence:
 * auth > rate-limit > not-found > generic.
 */
export function detectGlabError(
  stderr: string,
  stdout: string,
  code: number,
  _opts?: { args?: readonly string[] },
): GlabExecError {
  const raw = (stderr || stdout).trim();
  const lower = raw.toLowerCase();

  if (lower.includes('auth') || lower.includes('not logged in') || lower.includes('token')) {
    return new GlabAuthError(raw, code);
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('secondary rate limit')) {
    return new GlabRateLimitError(raw, code);
  }
  if (
    lower.includes('404') ||
    lower.includes('403') ||
    lower.includes('not found') ||
    lower.includes('could not resolve')
  ) {
    return new GlabNotFoundError(raw, code);
  }
  return new GlabExecError(`glab command failed (exit ${code}): ${raw}`, code);
}

export async function checkInstalled(pi: GlabExecApi): Promise<boolean> {
  const result = await pi.exec('which', ['glab'], { cwd: pi.cwd });
  return result.code === 0;
}

export async function checkAuth(pi: GlabExecApi): Promise<boolean> {
  const result = await pi.exec('glab', ['auth', 'status'], { cwd: pi.cwd });
  return result.code === 0;
}

export async function execGlab(pi: GlabExecApi, args: string[], signal?: AbortSignal): Promise<GlabExecResult> {
  const result = await pi.exec('glab', args, { signal, cwd: pi.cwd });
  // Bun.spawn sets killed=true even on successful exits — only treat as
  // cancelled when killed AND no stdout was captured (actual signal kill).
  if (result.killed && !result.stdout && result.code !== 0) throw new Error('Command was cancelled');
  if (result.code !== 0) {
    throw detectGlabError(result.stderr, result.stdout, result.code, { args });
  }
  return result;
}

export async function execGlabJson<T = unknown>(pi: GlabExecApi, args: string[], signal?: AbortSignal): Promise<T> {
  const result = await execGlab(pi, args, signal);
  return JSON.parse(result.stdout) as T;
}
