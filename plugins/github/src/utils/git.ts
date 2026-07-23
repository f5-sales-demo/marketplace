/**
 * Minimal git utility shim for the GitHub plugin.
 *
 * Re-implements only the subset of xcsh's utils/git that gh.ts needs.
 * All implementations are thin wrappers around Bun.spawn.
 */
import { detectGhError } from '../gh/exec';
import { ToolAbortError, ToolError, throwIfAborted } from './tool-errors';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function which(binary: string): boolean {
  try {
    const result = Bun.spawnSync(['which', binary]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function runCommand(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<GitCommandResult> {
  throwIfAborted(signal);
  const child = Bun.spawn(['git', '--no-optional-locks', ...args], {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
    signal,
  });

  if (!child.stdout || !child.stderr) {
    throw new Error('Failed to capture git command output.');
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode: exitCode ?? 0, stdout, stderr };
}

async function runEffect(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  const result = await runCommand(cwd, args, signal);
  if (result.exitCode !== 0) {
    throw new ToolError(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

async function runText(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  const result = await runCommand(cwd, args, signal);
  if (result.exitCode !== 0) {
    throw new ToolError(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

async function tryText(cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string | undefined> {
  const result = await runCommand(cwd, args, signal);
  if (result.exitCode !== 0) return undefined;
  return result.stdout;
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function trimScalar(text: string | undefined): string | undefined {
  const trimmed = text?.trim();
  return trimmed || undefined;
}

// ---------------------------------------------------------------------------
// Public API: repo
// ---------------------------------------------------------------------------

export const repo = {
  async root(cwd: string, signal?: AbortSignal): Promise<string | null> {
    const result = await runCommand(cwd, ['rev-parse', '--show-toplevel'], signal);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  },

  async primaryRoot(cwd: string, signal?: AbortSignal): Promise<string | null> {
    const repoRoot = await repo.root(cwd, signal);
    if (!repoRoot) return null;
    const commonDir = await runText(repoRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir'], signal);
    const { basename, dirname } = await import('node:path');
    if (basename(commonDir.trim()) === '.git') return dirname(commonDir.trim());
    return repoRoot;
  },
};

// ---------------------------------------------------------------------------
// Public API: branch
// ---------------------------------------------------------------------------

export const branch = {
  async current(cwd: string, signal?: AbortSignal): Promise<string | null> {
    const result = await runCommand(cwd, ['symbolic-ref', '--short', 'HEAD'], signal);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  },

  async create(cwd: string, name: string, startPoint = 'HEAD', signal?: AbortSignal): Promise<void> {
    await runEffect(cwd, ['branch', name, startPoint], signal);
  },

  async force(cwd: string, name: string, startPoint: string, signal?: AbortSignal): Promise<void> {
    await runEffect(cwd, ['branch', '--force', name, startPoint], signal);
  },
};

// ---------------------------------------------------------------------------
// Public API: remote
// ---------------------------------------------------------------------------

export const remote = {
  async list(cwd: string, signal?: AbortSignal): Promise<string[]> {
    return splitLines(await runText(cwd, ['remote'], signal));
  },

  async url(cwd: string, name: string, signal?: AbortSignal): Promise<string | undefined> {
    return trimScalar(await tryText(cwd, ['remote', 'get-url', name], signal));
  },

  async add(cwd: string, name: string, url: string, signal?: AbortSignal): Promise<void> {
    await runEffect(cwd, ['remote', 'add', name, url], signal);
  },
};

// ---------------------------------------------------------------------------
// Public API: ref
// ---------------------------------------------------------------------------

export const ref = {
  async exists(cwd: string, refName: string, signal?: AbortSignal): Promise<boolean> {
    if (refName === 'HEAD') return (await head.sha(cwd, signal)) !== null;
    const result = await runCommand(cwd, ['show-ref', '--verify', '--quiet', refName], signal);
    return result.exitCode === 0;
  },

  async resolve(cwd: string, refName: string, signal?: AbortSignal): Promise<string | null> {
    if (refName === 'HEAD') return head.sha(cwd, signal);
    const result = await runCommand(cwd, ['rev-parse', refName], signal);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  },
};

// ---------------------------------------------------------------------------
// Public API: config
// ---------------------------------------------------------------------------

export const config = {
  async get(cwd: string, key: string, signal?: AbortSignal): Promise<string | undefined> {
    return trimScalar(await tryText(cwd, ['config', '--get', key], signal));
  },

  async set(cwd: string, key: string, value: string, signal?: AbortSignal): Promise<void> {
    await runEffect(cwd, ['config', key, value], signal);
  },

  async getBranch(cwd: string, branchName: string, key: string, signal?: AbortSignal): Promise<string | undefined> {
    return config.get(cwd, `branch.${branchName}.${key}`, signal);
  },

  async setBranch(cwd: string, branchName: string, key: string, value: string, signal?: AbortSignal): Promise<void> {
    return config.set(cwd, `branch.${branchName}.${key}`, value, signal);
  },
};

// ---------------------------------------------------------------------------
// Public API: worktree
// ---------------------------------------------------------------------------

export interface GitWorktreeEntry {
  branch?: string;
  detached: boolean;
  head?: string;
  path: string;
}

function parseWorktreeList(text: string): GitWorktreeEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const entry: GitWorktreeEntry = { detached: false, path: '' };
      for (const line of block.split('\n')) {
        if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length);
        else if (line.startsWith('HEAD ')) entry.head = line.slice('HEAD '.length);
        else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length);
        else if (line === 'detached') entry.detached = true;
      }
      return entry;
    });
}

export const worktree = {
  async add(
    cwd: string,
    worktreePath: string,
    refName: string,
    options: { detach?: boolean; signal?: AbortSignal } = {},
  ): Promise<void> {
    const args = ['worktree', 'add'];
    if (options.detach) args.push('--detach');
    args.push(worktreePath, refName);
    await runEffect(cwd, args, options.signal);
  },

  async list(cwd: string, signal?: AbortSignal): Promise<GitWorktreeEntry[]> {
    return parseWorktreeList(await runText(cwd, ['worktree', 'list', '--porcelain'], signal));
  },
};

// ---------------------------------------------------------------------------
// Public API: head
// ---------------------------------------------------------------------------

export const head = {
  async sha(cwd: string, signal?: AbortSignal): Promise<string | null> {
    const result = await runCommand(cwd, ['rev-parse', 'HEAD'], signal);
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() || null;
  },
};

// ---------------------------------------------------------------------------
// Public API: push / fetch
// ---------------------------------------------------------------------------

export interface PushOptions {
  readonly forceWithLease?: boolean;
  readonly refspec?: string;
  readonly remote?: string;
  readonly signal?: AbortSignal;
}

export async function push(cwd: string, options: PushOptions = {}): Promise<void> {
  const args = ['push'];
  if (options.forceWithLease) args.push('--force-with-lease');
  if (options.remote) args.push(options.remote);
  if (options.refspec) args.push(options.refspec);
  await runEffect(cwd, args, options.signal);
}

export async function fetch(
  cwd: string,
  remoteName: string,
  source: string,
  target: string,
  signal?: AbortSignal,
): Promise<void> {
  await runEffect(cwd, ['fetch', remoteName, `+${source}:${target}`], signal);
}

// ---------------------------------------------------------------------------
// Public API: github (gh CLI)
// ---------------------------------------------------------------------------

export interface GhCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GhCommandOptions {
  repoProvided?: boolean;
  trimOutput?: boolean;
}

export const github = {
  available(): boolean {
    return which('gh');
  },

  async run(cwd: string, args: string[], signal?: AbortSignal, options?: GhCommandOptions): Promise<GhCommandResult> {
    throwIfAborted(signal);
    if (!which('gh')) {
      throw new ToolError('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/.');
    }
    try {
      const child = Bun.spawn(['gh', ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        windowsHide: true,
        signal,
      });
      if (!child.stdout || !child.stderr) {
        throw new ToolError('Failed to capture GitHub CLI output.');
      }
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      throwIfAborted(signal);
      const trim = options?.trimOutput !== false;
      return {
        exitCode: exitCode ?? 0,
        stdout: trim ? stdout.trim() : stdout,
        stderr: trim ? stderr.trim() : stderr,
      };
    } catch (error) {
      if (signal?.aborted) throw new ToolAbortError();
      throw error;
    }
  },

  async json<T>(cwd: string, args: string[], signal?: AbortSignal, options?: GhCommandOptions): Promise<T> {
    const result = await github.run(cwd, args, signal, options);
    if (result.exitCode !== 0) {
      throw detectGhError(result.stderr, result.stdout, result.exitCode, { ...options, args });
    }
    if (!result.stdout) {
      throw new ToolError('GitHub CLI returned empty output.');
    }
    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new ToolError('GitHub CLI returned invalid JSON output.');
    }
  },

  async text(cwd: string, args: string[], signal?: AbortSignal, options?: GhCommandOptions): Promise<string> {
    const result = await github.run(cwd, args, signal, options);
    if (result.exitCode !== 0) {
      throw detectGhError(result.stderr, result.stdout, result.exitCode, { ...options, args });
    }
    return result.stdout;
  },
};
