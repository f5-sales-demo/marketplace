# GitHub Plugin Contract Parity (Spec 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `github` plugin up to the CLI-Plugin Capability Contract: typed error taxonomy, a `gh_exec` passthrough, a `gh_help` discovery tool, `--json`/`--jq` docs, a formatters module, and a benchmark/autoresearch harness.

**Architecture:** A new `src/gh/exec.ts` holds `Gh*Error` classes + `detectGhError`. The exec layer (`git.ts`) throws typed errors; the `index.ts` registration wrapper maps a thrown `Gh*Error` to an `isError` result carrying `details.errorType` — so the 9 existing tools' happy paths and the Spec 1 mutation-safety throw sites stay untouched. `gh_exec`/`gh_help` are `AgentTool` classes (matching the existing 9) that slot into the `index.ts` tool loop. Pure renderers move to `src/gh/formatters.ts`. A `benchmarks/` + `autoresearch.*` harness mirrors Azure, wired to gh's real exports.

**Tech Stack:** TypeScript on Bun; `bun test`; Biome; TypeBox (module-level `Type` via `setTypebox`); `gh` CLI via `git.github.*` (argv `Bun.spawn`, no shell).

## Global Constraints

- Branch `feat/github-contract-parity-801` (already created from `origin/main`); never commit to `main`.
- Every task ends green: `cd plugins/github && bun test` exit 0; `npx biome check plugins/github/src/` no errors; `pre-commit run --files <changed>` all pass.
- Preserve argv-no-shell; do not change the Spec 1 mutation-safety files or their throw sites (`gh_pr_push`/`gh_pr_checkout` gates; `HEADLESS_BLOCKED_MESSAGE` is asserted verbatim in `test/tools/gh-mutation-safety.test.ts`).
- Markdown must satisfy markdownlint AND textlint terminology (brand names capitalized in prose: **GitHub**, **GitLab**, **Azure**; lowercase only inside `code spans`/paths). Local pre-commit does NOT run textlint — capitalize proactively.
- Commit messages: conventional; end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Add only task-specific files (never `git add -A`).
- Reference implementation for mirroring: `plugins/azure` (`az_help`, `src/az/exec.ts`, `src/az/formatters.ts`, `benchmarks/`, `autoresearch.*`).

---

### Task 1: Error taxonomy module (`src/gh/exec.ts`) — TDD

**Files:**

- Create: `plugins/github/src/gh/exec.ts`
- Test: `plugins/github/test/gh/exec.test.ts`

**Interfaces:**

- Produces:
  - `class GhExecError extends Error`, `class GhAuthError extends GhExecError`, `class GhNotFoundError extends GhExecError`, `class GhRateLimitError extends GhExecError`
  - `type GhErrorType = 'auth_required' | 'not_found' | 'rate_limited' | 'exec_error'`
  - `detectGhError(stderr: string, stdout: string, exitCode: number, opts?: { repoProvided?: boolean; args?: readonly string[] }): GhExecError`
  - `detectGhErrorType(err: unknown): GhErrorType`

- [ ] **Step 1: Write the failing tests**

Create `plugins/github/test/gh/exec.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import {
  detectGhError,
  detectGhErrorType,
  GhAuthError,
  GhExecError,
  GhNotFoundError,
  GhRateLimitError,
} from '../../src/gh/exec';

describe('detectGhError', () => {
  it('classifies auth failures', () => {
    expect(detectGhError('gh auth login required', '', 1)).toBeInstanceOf(GhAuthError);
    expect(detectGhError('not logged into any GitHub hosts', '', 1)).toBeInstanceOf(GhAuthError);
  });
  it('classifies not-found failures', () => {
    expect(detectGhError('Could not resolve to a Repository', '', 1)).toBeInstanceOf(GhNotFoundError);
    expect(detectGhError('gh: HTTP 404', '', 1)).toBeInstanceOf(GhNotFoundError);
    expect(detectGhError('no pull requests found', '', 1)).toBeInstanceOf(GhNotFoundError);
  });
  it('classifies rate-limit failures', () => {
    expect(detectGhError('API rate limit exceeded for user', '', 1)).toBeInstanceOf(GhRateLimitError);
    expect(detectGhError('You have exceeded a secondary rate limit', '', 1)).toBeInstanceOf(GhRateLimitError);
    expect(detectGhError('gh: HTTP 429', '', 1)).toBeInstanceOf(GhRateLimitError);
  });
  it('falls back to GhExecError and preserves the message', () => {
    const e = detectGhError('some other failure', '', 1);
    expect(e).toBeInstanceOf(GhExecError);
    expect(e).not.toBeInstanceOf(GhAuthError);
    expect(e.message).toContain('some other failure');
  });
  it('gives a repo-context hint when repo not provided', () => {
    const e = detectGhError('no git remotes found', '', 1, { repoProvided: false });
    expect(e.message.toLowerCase()).toContain('repository context');
  });
  it('uses stdout/args fallback when stderr is empty', () => {
    const e = detectGhError('', '', 1, { args: ['pr', 'view', '999'] });
    expect(e.message).toContain('gh pr view 999');
  });
});

describe('detectGhErrorType', () => {
  it('maps each class to its enum', () => {
    expect(detectGhErrorType(new GhAuthError('x'))).toBe('auth_required');
    expect(detectGhErrorType(new GhNotFoundError('x'))).toBe('not_found');
    expect(detectGhErrorType(new GhRateLimitError('x'))).toBe('rate_limited');
    expect(detectGhErrorType(new GhExecError('x'))).toBe('exec_error');
    expect(detectGhErrorType(new Error('x'))).toBe('exec_error');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace/plugins/github && bun test test/gh/exec.test.ts`
Expected: FAIL — cannot resolve `../../src/gh/exec`.

- [ ] **Step 3: Implement `src/gh/exec.ts`**

```ts
export class GhExecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GhExecError';
  }
}
export class GhAuthError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhAuthError';
  }
}
export class GhNotFoundError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhNotFoundError';
  }
}
export class GhRateLimitError extends GhExecError {
  constructor(message: string) {
    super(message);
    this.name = 'GhRateLimitError';
  }
}

export type GhErrorType = 'auth_required' | 'not_found' | 'rate_limited' | 'exec_error';

export function detectGhError(
  stderr: string,
  stdout: string,
  exitCode: number,
  opts?: { repoProvided?: boolean; args?: readonly string[] },
): GhExecError {
  const raw = (stderr || stdout).trim();
  const lower = raw.toLowerCase();

  if (lower.includes('gh auth login') || lower.includes('not logged into any github hosts')) {
    return new GhAuthError('GitHub CLI is not authenticated. Run `gh auth login`.');
  }
  if (
    lower.includes('api rate limit exceeded') ||
    lower.includes('secondary rate limit') ||
    lower.includes('http 429')
  ) {
    return new GhRateLimitError(`GitHub API rate limit reached. ${raw}`.trim());
  }
  if (
    lower.includes('could not resolve to a') ||
    lower.includes('http 404') ||
    lower.includes('no pull requests found') ||
    lower.includes('no issues found')
  ) {
    return new GhNotFoundError(raw || 'GitHub resource not found.');
  }
  if (
    !opts?.repoProvided &&
    (lower.includes('not a git repository') ||
      lower.includes('no git remotes found') ||
      lower.includes('unable to determine current repository'))
  ) {
    return new GhExecError(
      'GitHub repository context is unavailable. Pass `repo` explicitly or run the tool inside a GitHub checkout.',
    );
  }
  if (raw.length > 0) return new GhExecError(raw);
  return new GhExecError(`GitHub CLI command failed: gh ${(opts?.args ?? []).join(' ')}`.trim());
}

export function detectGhErrorType(err: unknown): GhErrorType {
  if (err instanceof GhAuthError) return 'auth_required';
  if (err instanceof GhNotFoundError) return 'not_found';
  if (err instanceof GhRateLimitError) return 'rate_limited';
  return 'exec_error';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test test/gh/exec.test.ts` → PASS.

- [ ] **Step 5: Lint + commit**

```bash
cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace
npx biome check plugins/github/src/gh/exec.ts plugins/github/test/gh/exec.test.ts
git add plugins/github/src/gh/exec.ts plugins/github/test/gh/exec.test.ts
git commit -m "feat(github): add typed error taxonomy (Gh*Error + detectGhError)

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire taxonomy into the exec layer + central errorType mapping

**Files:**

- Modify: `plugins/github/src/utils/git.ts` (`github.json`/`github.text`, ~346-367; remove the string-only `formatGhFailure` use)
- Modify: `plugins/github/src/tools/gh.ts` (`GhToolDetails` — add `errorType?: GhErrorType`; add import)
- Modify: `plugins/github/src/index.ts` (wrap `originalExecute` to map thrown `Gh*Error` → `isError` result with `details.errorType`)

**Interfaces:**

- Consumes: `detectGhError`, `detectGhErrorType`, `GhErrorType` from `../gh/exec` (git.ts and gh.ts) / `./gh/exec` (index.ts).
- Produces: tool error results now carry `details.errorType`.

- [ ] **Step 1: Replace string failure with typed errors in `git.ts`**

Add import at the top of `git.ts` (with the other imports):

```ts
import { detectGhError } from '../gh/exec';
```

Replace the two `throw new ToolError(formatGhFailure(...))` sites in `github.json` (line ~349) and `github.text` (line ~364) with:

```ts
      throw detectGhError(result.stderr, result.stdout, result.exitCode, { ...options, args });
```

Then delete the now-unused `formatGhFailure` function (lines ~289-304). Keep `GhCommandResult`/`GhCommandOptions`.

- [ ] **Step 2: Add `errorType` to `GhToolDetails` in `gh.ts`**

Add import near the top of `gh.ts`:

```ts
import type { GhErrorType } from '../gh/exec';
```

In the `GhToolDetails` interface (~line 408), add:

```ts
  errorType?: GhErrorType;
```

- [ ] **Step 3: Map thrown errors centrally in `index.ts`**

Add imports in `index.ts`:

```ts
import { detectGhErrorType } from './gh/exec';
import { renderError, ToolAbortError } from './utils/tool-errors';
```

Replace the wrapper `execute` body (the `return originalExecute(...)` at ~line 88) with:

```ts
          sessionProxy.cwd = ctx?.cwd ?? process.cwd();
          try {
            // biome-ignore lint/suspicious/noExplicitAny: bridging xcsh internal types
            return await originalExecute(toolCallId, params, signal, onUpdate as any, ctx as any);
          } catch (err) {
            if (err instanceof ToolAbortError) throw err;
            return {
              content: [{ type: 'text' as const, text: renderError(err) }],
              isError: true,
              details: { errorType: detectGhErrorType(err) },
            };
          }
```

- [ ] **Step 4: Verify full suite + lint**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace && (cd plugins/github && bun test) && npx biome check plugins/github/src/`
Expected: all existing tests pass (mutation-safety tests unaffected — they call the tool class directly, bypassing the wrapper); biome clean. If any test asserted the old `formatGhFailure` prose, update it to the typed-error message.

- [ ] **Step 5: Commit**

```bash
git add plugins/github/src/utils/git.ts plugins/github/src/tools/gh.ts plugins/github/src/index.ts
git commit -m "feat(github): classify gh errors via detectGhError; map errorType in wrapper

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `gh_help` discovery tool

**Files:**

- Create: `plugins/github/src/prompts/gh-help.md`
- Modify: `plugins/github/src/tools/gh.ts` (add `HELP_PATH_PATTERN`, `GhHelpTool` class, prompt import)
- Modify: `plugins/github/src/index.ts` (add `GhHelpTool` to the destructure + `toolClasses` tuple)
- Modify: `plugins/github/test/extension.test.ts` (tool-count expectation, if asserted)
- Test: `plugins/github/test/tools/gh-help.test.ts`

**Interfaces:**

- Consumes: `git.github.run`, module-level `Type`, `ToolResultBuilder`/`buildTextResult`.
- Produces: `GhHelpTool` (name `gh_help`, param `command_path?: string`).

- [ ] **Step 1: Write the failing test**

Create `plugins/github/test/tools/gh-help.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { GhHelpTool } from '../../src/tools/gh';

describe('gh_help', () => {
  const tool = new GhHelpTool({ cwd: '/tmp' } as never);
  it('rejects an invalid command path before spawning', async () => {
    const res = await tool.execute('id', { command_path: 'pr; rm -rf /' }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(res.isError).toBe(true);
    expect(res.content[0].text.toLowerCase()).toContain('invalid command path');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace/plugins/github && bun test test/tools/gh-help.test.ts`
Expected: FAIL — `GhHelpTool` is not exported.

- [ ] **Step 3: Create the prompt `src/prompts/gh-help.md`**

```markdown
# gh_help

Show GitHub CLI help for a command path. Use this before `gh_exec` when unsure of a command's subcommands or flags.

## Parameters

- `command_path` (optional): the command path without the `gh` prefix, lowercase words separated by spaces, e.g. `pr`, `pr view`, `run`, `api`. Omit for top-level help.

## Notes

- Runs `gh <command_path> --help` and returns the help text verbatim.
- Discover a command's `--json` fields and flags here, then run the actual query with `gh_exec`.
```

- [ ] **Step 4: Add `HELP_PATH_PATTERN` + `GhHelpTool` to `gh.ts`**

Add the prompt import with the other prompt imports (~lines 41-49):

```ts
import ghHelpDescription from '../prompts/gh-help.md' with { type: 'text' };
```

Add the pattern near the top-level consts:

```ts
const HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;
```

Add the class (near the other tool classes, e.g. after `GhSearchPrsTool`):

```ts
export class GhHelpTool implements AgentTool<unknown, GhToolDetails> {
  readonly name = 'gh_help';
  readonly label = 'GitHub CLI Help';
  readonly description = ghHelpDescription;
  readonly parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description: 'Command path without the "gh" prefix, e.g. "pr view" or "run". Empty for top-level help.',
      }),
    ),
  });

  constructor(private readonly session: ToolSession) {}

  static createIf(session: ToolSession): GhHelpTool | null {
    if (!git.github.available()) return null;
    return new GhHelpTool(session);
  }

  async execute(
    _toolCallId: string,
    params: { command_path?: string },
    signal?: AbortSignal,
    _onUpdate?: AgentToolUpdateCallback<GhToolDetails>,
    _context?: AgentToolContext,
  ): Promise<AgentToolResult<GhToolDetails>> {
    const commandPath = params.command_path?.trim() ?? '';
    if (commandPath.length > 0 && !HELP_PATH_PATTERN.test(commandPath)) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          },
        ],
        isError: true,
        details: { tool: 'gh_help' },
      };
    }
    const parts = commandPath.length > 0 ? commandPath.split(' ').filter(Boolean) : [];
    const result = await git.github.run(this.session.cwd, [...parts, '--help'], signal);
    const output = result.stdout || result.stderr;
    return buildTextResult(output || `No help output for "gh ${commandPath}".`, undefined, { tool: 'gh_help' });
  }
}
```

Note: match the exact `buildTextResult(text, sourceUrl?, details)` signature used by the sibling tools (check its definition in `gh.ts`); if its shape differs, use `toolResult({ tool: 'gh_help' }).text(output).done()`. Confirm `ToolSession`, `buildTextResult`, `AgentToolResult`, `AgentToolUpdateCallback`, `AgentToolContext` names against the file.

- [ ] **Step 5: Register in `index.ts`**

Add `GhHelpTool` to both the destructuring block (~lines 37-47) and the `toolClasses` tuple (~lines 54-64).

- [ ] **Step 6: Run tests + lint; update tool-count assertion if present**

Run: `bun test test/tools/gh-help.test.ts && (cd .. && npx biome check plugins/github/src/) && cd plugins/github && bun test`
If `extension.test.ts` asserts a specific registered-tool count, bump it (9 → 10 now; 11 after Task 4).
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plugins/github/src/tools/gh.ts plugins/github/src/prompts/gh-help.md plugins/github/src/index.ts plugins/github/test/tools/gh-help.test.ts plugins/github/test/extension.test.ts
git commit -m "feat(github): add gh_help discovery tool

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `gh_exec` passthrough + read-only guardrail + query docs

**Files:**

- Create: `plugins/github/src/tools/gh-exec-guard.ts` (pure guardrail helpers)
- Create: `plugins/github/src/prompts/gh-exec.md` (includes the `--json`/`--jq` query section)
- Modify: `plugins/github/src/tools/gh.ts` (add `GhExecTool` class + prompt import)
- Modify: `plugins/github/src/index.ts` (register `GhExecTool`)
- Modify: existing `src/prompts/gh-*.md` (one-line `--json`/`--jq` pointer where relevant)
- Test: `plugins/github/test/tools/gh-exec.test.ts`

**Interfaces:**

- Produces (from `gh-exec-guard.ts`):
  - `MUTATING_VERBS: ReadonlySet<string>`
  - `hasControlChars(arg: string): boolean`
  - `findMutation(args: string[]): { blocked: boolean; reason?: string }` — detects mutating verbs (any non-flag token) and mutating `gh api` (method != GET, or body-field flags present)
- Consumes: `git.github.run`, `detectGhError` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `plugins/github/test/tools/gh-exec.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { findMutation, hasControlChars, MUTATING_VERBS } from '../../src/tools/gh-exec-guard';
import { GhExecTool } from '../../src/tools/gh';

describe('hasControlChars', () => {
  it('rejects NUL/control bytes, allows normal args', () => {
    expect(hasControlChars('pr ')).toBe(true);
    expect(hasControlChars("pr list --json number,title --jq '.[].title'")).toBe(false);
  });
});

describe('findMutation', () => {
  it('allows reads', () => {
    expect(findMutation(['pr', 'list']).blocked).toBe(false);
    expect(findMutation(['repo', 'view', '--json', 'nameWithOwner']).blocked).toBe(false);
    expect(findMutation(['api', 'repos/o/r/pulls']).blocked).toBe(false);
  });
  it('blocks mutating verbs anywhere', () => {
    expect(findMutation(['pr', 'merge', '123']).blocked).toBe(true);
    expect(findMutation(['issue', 'create', '--title', 'x']).blocked).toBe(true);
    expect(findMutation(['repo', 'delete', 'o/r']).blocked).toBe(true);
  });
  it('blocks mutating gh api methods and body fields', () => {
    expect(findMutation(['api', '-X', 'POST', 'repos/o/r/issues']).blocked).toBe(true);
    expect(findMutation(['api', '--method', 'DELETE', 'x']).blocked).toBe(true);
    expect(findMutation(['api', 'x', '-f', 'title=y']).blocked).toBe(true);
    expect(findMutation(['api', '--method', 'GET', 'x']).blocked).toBe(false);
  });
});

describe('gh_exec execute', () => {
  const tool = new GhExecTool({ cwd: '/tmp' } as never);
  it('rejects empty args', async () => {
    const r = await tool.execute('id', { args: [] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
  });
  it('rejects control chars', async () => {
    const r = await tool.execute('id', { args: ['pr '] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('control character');
  });
  it('blocks a mutating verb before spawning', async () => {
    const r = await tool.execute('id', { args: ['pr', 'merge', '1'] }, undefined, undefined, { cwd: '/tmp' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text.toLowerCase()).toContain('read-only');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace/plugins/github && bun test test/tools/gh-exec.test.ts`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Implement `src/tools/gh-exec-guard.ts`**

```ts
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional argv hygiene
const CONTROL_CHAR_PATTERN = /[ --]/;

export function hasControlChars(arg: string): boolean {
  return CONTROL_CHAR_PATTERN.test(arg);
}

export const MUTATING_VERBS: ReadonlySet<string> = new Set([
  'create', 'edit', 'delete', 'close', 'reopen', 'merge', 'comment', 'review',
  'rerun', 'cancel', 'sync', 'fork', 'rename', 'lock', 'unlock', 'pin', 'unpin',
  'transfer', 'archive', 'unarchive', 'set', 'add', 'remove', 'disable', 'enable',
  'revoke', 'import', 'upload', 'restore', 'update', 'approve', 'ready', 'draft',
]);

const MUTATING_API_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_BODY_FLAGS = new Set(['-f', '-F', '--field', '--raw-field']);

export function findMutation(args: string[]): { blocked: boolean; reason?: string } {
  const positionals = args.filter((a) => !a.startsWith('-'));

  // gh api: block non-GET methods and body-field flags (which imply POST)
  if (positionals[0] === 'api') {
    let method: string | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-X' || a === '--method') method = (args[i + 1] ?? '').toUpperCase();
      else if (a.startsWith('--method=')) method = a.slice('--method='.length).toUpperCase();
    }
    if (method && MUTATING_API_METHODS.has(method)) {
      return { blocked: true, reason: `gh api with method ${method} is a mutating request` };
    }
    const hasBodyField = args.some((a) => API_BODY_FLAGS.has(a) || /^(--field|--raw-field)=/.test(a));
    if (hasBodyField && method !== 'GET') {
      return { blocked: true, reason: 'gh api with body fields implies a mutating (POST) request' };
    }
  }

  const verb = positionals.find((tok) => MUTATING_VERBS.has(tok));
  if (verb) return { blocked: true, reason: `"${verb}" is a mutating operation` };
  return { blocked: false };
}
```

- [ ] **Step 4: Create the prompt `src/prompts/gh-exec.md`**

```markdown
# gh_exec

Run any read-only `gh` (GitHub CLI) command. Pass arguments as an array without the `gh` prefix, e.g. `["pr", "list", "--json", "number,title"]`.

## Safety

- Arguments are passed argv-style to `gh` with no shell — shell metacharacters are inert.
- Read-only by default: mutating verbs (`create`, `edit`, `delete`, `merge`, `comment`, `rerun`, `cancel`, …) and `gh api` with a non-GET method or body fields are blocked. Run writes through an explicitly confirmed path, not `gh_exec`.
- Prefer the typed tools (`gh_repo_view`, `gh_pr_view`, `gh_issue_view`, `gh_search_prs`, …) when they cover your need — they return structured data.

## Querying with `--json` / `--jq`

The GitHub CLI shapes output with `--json <fields>` (a comma-separated field list, per subcommand) and an optional `--jq '<expr>'` (jq syntax — NOT JMESPath):

- Field projection: `gh pr list --json number,title,author`
- Filter with jq: `gh pr list --json number,state --jq '.[] | select(.state=="OPEN") | .number'`
- Single value: `gh repo view --json nameWithOwner --jq .nameWithOwner`

Use `gh_help` (e.g. `gh_help` with `command_path: "pr list"`) to discover a command's available `--json` fields.
```

- [ ] **Step 5: Add `GhExecTool` to `gh.ts`**

Add prompt import with the others:

```ts
import ghExecDescription from '../prompts/gh-exec.md' with { type: 'text' };
```

Add near the top imports:

```ts
import { findMutation, hasControlChars } from './gh-exec-guard';
```

Add the class (near the other tool classes):

```ts
const GH_EXEC_MAX_OUTPUT = 50000;

export class GhExecTool implements AgentTool<unknown, GhToolDetails> {
  readonly name = 'gh_exec';
  readonly label = 'GitHub CLI Execute';
  readonly description = ghExecDescription;
  readonly parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "gh")' }), {
      description: 'gh subcommand and flags as an array, e.g. ["pr", "list", "--json", "number,title"]',
    }),
  });

  constructor(private readonly session: ToolSession) {}

  static createIf(session: ToolSession): GhExecTool | null {
    if (!git.github.available()) return null;
    return new GhExecTool(session);
  }

  async execute(
    _toolCallId: string,
    params: { args: string[] },
    signal?: AbortSignal,
    _onUpdate?: AgentToolUpdateCallback<GhToolDetails>,
    _context?: AgentToolContext,
  ): Promise<AgentToolResult<GhToolDetails>> {
    const args = params.args ?? [];
    const fail = (text: string): AgentToolResult<GhToolDetails> => ({
      content: [{ type: 'text', text }],
      isError: true,
      details: { tool: 'gh_exec' },
    });
    if (args.length === 0) return fail('Error: args array must not be empty.');
    for (const a of args) {
      if (hasControlChars(a)) return fail(`Error: argument contains a control character: "${a}"`);
    }
    const mutation = findMutation(args);
    if (mutation.blocked) {
      return fail(
        `Error: ${mutation.reason}. gh_exec is read-only by default. Run write operations through an explicitly confirmed path, not gh_exec.`,
      );
    }
    const result = await git.github.run(this.session.cwd, args, signal);
    if (result.exitCode !== 0) {
      throw detectGhError(result.stderr, result.stdout, result.exitCode, { args });
    }
    let out = result.stdout;
    if (out.length > GH_EXEC_MAX_OUTPUT) out = `${out.slice(0, GH_EXEC_MAX_OUTPUT)}\n\n[Output truncated]`;
    return buildTextResult(out, undefined, { tool: 'gh_exec' });
  }
}
```

Add `import { detectGhError } from '../gh/exec';` if not already imported in `gh.ts`. Confirm `buildTextResult` signature (else use `toolResult({ tool: 'gh_exec' }).text(out).done()`).

- [ ] **Step 6: Register + query-doc pointers**

Add `GhExecTool` to the `index.ts` destructure + `toolClasses`. Add a one-line pointer to `--json`/`--jq` (and `gh_exec` for uncovered commands) in `gh-repo-view.md`, `gh-pr-view.md`, `gh-issue-view.md`, `gh-search-prs.md`, `gh-search-issues.md`.

- [ ] **Step 7: Run tests + lint**

Run: `bun test test/tools/gh-exec.test.ts && cd .. && npx biome check plugins/github/src/ && cd plugins/github && bun test`
Bump the `extension.test.ts` tool-count to 11 if asserted. Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add plugins/github/src/tools/gh-exec-guard.ts plugins/github/src/tools/gh.ts plugins/github/src/prompts/gh-exec.md plugins/github/src/prompts/gh-repo-view.md plugins/github/src/prompts/gh-pr-view.md plugins/github/src/prompts/gh-issue-view.md plugins/github/src/prompts/gh-search-prs.md plugins/github/src/prompts/gh-search-issues.md plugins/github/src/index.ts plugins/github/test/tools/gh-exec.test.ts plugins/github/test/extension.test.ts
git commit -m "feat(github): add gh_exec passthrough with read-only guardrail + --json/--jq docs

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Extract renderers into `src/gh/formatters.ts`

**Files:**

- Create: `plugins/github/src/gh/formatters.ts`
- Modify: `plugins/github/src/tools/gh.ts` (remove the extracted functions; import them)
- Test: `plugins/github/test/gh/formatters.test.ts`

**Interfaces:**

- Produces: the extracted pure formatters as named exports (same names as today), imported back into `gh.ts`.

- [ ] **Step 1: Move the pure render/format functions verbatim**

Move these functions from `gh.ts` into a new `src/gh/formatters.ts`, exporting each, and keeping them in dependency order (the `renderRunSection`/`renderJobsSection` cluster and their callers must move together). Functions and current line ranges:

`formatShortSha` (701-708), `formatAuthor` (962-968), `formatLabels` (969-974), `pushLine` (975-979), `formatJobState` (1131-1134), `renderJobsSection` (1190-1210), `renderFailedJobLogs` (1212-1249), `renderRunSection` (1250-1264), `formatRunWatchSnapshot` (1266-1301), `formatRunWatchResult` (1303-1339), `formatCommitRunWatchSnapshot` (1341-1377), `formatCommitRunWatchResult` (1379-1415), `tailLogLines` (1682-1690), `formatCommentsSection` (1715-1750), `formatReviewsSection` (1751-1773), `formatReviewCommentLocation` (1774-1782), `formatReviewCommentsSection` (1783-1805), `formatRepoView` (1806-1832), `formatIssueView` (1833-1860), `formatPrFiles` (1861-1878), `formatPrView` (1879-1931), `formatPrCheckoutResult` (1933-1964), `formatPrPushResult` (1965-1984), `formatSearchResults` (1985-2025), `appendArtifactReference` (2026-2032).

Move any small pure helpers these depend on (`normalizeText`, `normalizeBlock`, `normalizeOptionalString`, `getRunOutcome`/`getRunSnapshotOutcome`/`getRunCollectionOutcome`/`getRunCollectionSignature` at 1073-1126) if they are not otherwise used by the fetch/execute code left in `gh.ts`; if a helper is shared with non-formatter code, export it from `formatters.ts` and import it back, OR leave it in `gh.ts` and import it into `formatters.ts` — pick whichever avoids a circular import (verify with `bun build`/tsc). Do NOT move any function that calls `git.*` (the fetchers at 1506-1710 stay in `gh.ts`).

- [ ] **Step 2: Wire imports in `gh.ts`**

Add a single import of all moved names from `./gh/../gh/formatters` (correct relative path is `../gh/formatters` from `src/tools/gh.ts`):

```ts
import {
  appendArtifactReference, formatAuthor, formatCommentsSection, formatCommitRunWatchResult,
  formatCommitRunWatchSnapshot, formatIssueView, formatJobState, formatLabels, formatPrCheckoutResult,
  formatPrFiles, formatPrPushResult, formatRepoView, formatReviewCommentLocation, formatReviewCommentsSection,
  formatReviewsSection, formatRunWatchResult, formatRunWatchSnapshot, formatSearchResults, formatShortSha,
  pushLine, renderFailedJobLogs, renderJobsSection, renderRunSection, tailLogLines,
} from '../gh/formatters';
```

(Adjust the exact set to what actually moved.)

- [ ] **Step 3: Write formatter tests**

Create `plugins/github/test/gh/formatters.test.ts` covering 3-4 representative pure renderers with fixture inputs, e.g.:

```ts
import { describe, expect, it } from 'bun:test';
import { formatShortSha, formatLabels } from '../../src/gh/formatters';

describe('formatShortSha', () => {
  it('shortens a 40-char sha', () => {
    expect(formatShortSha('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
  });
});

describe('formatLabels', () => {
  it('joins label names', () => {
    expect(formatLabels([{ name: 'bug' }, { name: 'p1' }])).toContain('bug');
  });
});
```

Match the exact input types/return values by reading each function; adjust assertions to real behavior (do not assert invented output).

- [ ] **Step 4: Verify behavior unchanged + lint**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace && (cd plugins/github && bun test) && npx biome check plugins/github/src/`
Expected: full suite green (all existing tool tests exercise the imported formatters), biome clean, no circular-import error.

- [ ] **Step 5: Commit**

```bash
git add plugins/github/src/gh/formatters.ts plugins/github/src/tools/gh.ts plugins/github/test/gh/formatters.test.ts
git commit -m "refactor(github): extract renderers into src/gh/formatters.ts

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Benchmark + autoresearch harness

**Files:**

- Create: `plugins/github/benchmarks/scenarios.ts`, `plugins/github/benchmarks/mock-gh.sh`, `plugins/github/benchmarks/fixtures/*.json`
- Create: `plugins/github/autoresearch.sh`, `autoresearch.checks.sh`, `autoresearch.md`, `autoresearch.ideas.md`

**Interfaces:** none in `src/` — self-contained harness.

- [ ] **Step 1: Mirror the Azure harness, adapted to gh**

Copy the structure of `plugins/azure/benchmarks/` and `plugins/azure/autoresearch.*` into `plugins/github/`, adapting:

- `mock-gh.sh`: like `mock-az.sh` — cat `$MOCK_GH_FIXTURE` when set, else echo `$MOCK_GH_HELP`, else exit non-zero. Handle a `--json`/`-q` arg path (gh writes JSON to stdout).
- `benchmarks/fixtures/`: create `repo-view.json`, `issue-view.json`, `pr-view.json`, `pr-diff.txt`, `search-issues.json`, `search-prs.json`, `run-list.json`, `run-jobs.json` with minimal valid shapes matching the `GH_*_FIELDS`.
- `benchmarks/scenarios.ts`: mirror azure's PATH-injected mock harness + `checkResult` scorer + composite metric, but **wire gh's real exports** — instantiate tools via `GhRepoViewTool.createIf({cwd})`, `GhExecTool`, `GhHelpTool`, etc. (Do NOT copy azure's stale `createAz*Tool` import names.) Scenarios: a repo view, a pr view, a search, a `gh_help`, a `gh_exec` read, and injection/guardrail cases (control-char reject, `pr merge` blocked, `api -X POST` blocked).
- `autoresearch.md`: composite formula (same as Azure), Files in Scope (`src/prompts/`, `src/tools/`, `src/gh/formatters.ts`, `src/gh/exec.ts`), Off Limits (`src/index.ts`, `src/utils/git.ts`, `src/wizard.ts`, `test/`, `benchmarks/`), Constraints: all tests pass; mutation-safety gate intact (`resolveApprovalMode`/`HEADLESS_BLOCKED_MESSAGE` present); `gh_exec` guardrail present (`findMutation`, `hasControlChars`); the 11 tool names stable; biome clean.
- `autoresearch.checks.sh`: reference `plugins/github` (NOT `plugins/azure-status`). Check: `bun test`, `biome check plugins/github/src/`, all tool classes present in `index.ts` (`GhRepoViewTool … GhExecTool GhHelpTool`), security invariants present (`findMutation`, `hasControlChars`, `resolveApprovalMode`).
- `autoresearch.sh`: `bun test` then `bun run benchmarks/scenarios.ts`.

- [ ] **Step 2: Run the harness**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace/plugins/github && bun run benchmarks/scenarios.ts`
Expected: prints `METRIC …` composite line and exits 0 (all scenarios score ≥ threshold against the mock).

Run: `bash autoresearch.checks.sh`
Expected: `ALL CHECKS PASSED`.

- [ ] **Step 3: Lint (shell + markdown) + commit**

Run: `cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace && pre-commit run --files plugins/github/autoresearch.sh plugins/github/autoresearch.checks.sh plugins/github/autoresearch.md plugins/github/autoresearch.ideas.md plugins/github/benchmarks/mock-gh.sh plugins/github/benchmarks/scenarios.ts`
Fix shellcheck/markdownlint/textlint findings at the source.

```bash
git add plugins/github/benchmarks plugins/github/autoresearch.sh plugins/github/autoresearch.checks.sh plugins/github/autoresearch.md plugins/github/autoresearch.ideas.md
git commit -m "test(github): add benchmark + autoresearch harness (mock-gh)

Refs #801

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verify end-to-end and open the PR

- [ ] **Step 1: Full suite + lint + harness**

Run:

```bash
cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace/plugins/github && bun test && bun run benchmarks/scenarios.ts && bash autoresearch.checks.sh
cd /Users/r.mordasiewicz/GIT/system-prompt/marketplace && npx biome check plugins/github/src/
```

Expected: all tests pass; composite metric printed; checks pass; biome clean.

- [ ] **Step 2: pre-commit on all changed files (catches textlint/markdown/shellcheck)**

Run `pre-commit run --files <all changed files>`; fix any prose (brand capitalization), markdown, or shell findings at the source.

- [ ] **Step 3: Manual smoke (if `gh` is authenticated)**

`gh_help` (command_path `pr`) returns help; `gh_exec` with `["repo","view","--json","nameWithOwner"]` returns JSON; `gh_exec` with `["pr","merge","1"]` is refused ("read-only"); `gh_exec` with `["api","-X","POST","x"]` is refused. Existing read tools behave unchanged.

- [ ] **Step 4: Push + open PR**

```bash
git push
gh pr create --repo f5xc-salesdemos/marketplace --base main --head feat/github-contract-parity-801 \
  --title "Spec 2: github plugin → CLI-Plugin Capability Contract" \
  --body "Implements Spec 2 (design: .plans/2026-07-22-github-contract-spec2-design.md): typed error taxonomy, gh_exec (read-only guardrail + gh api method checks), gh_help, --json/--jq docs, formatters module extracted from gh.ts, and a benchmark/autoresearch harness. Spec 1 mutation-safety gates untouched.

Closes #801

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5: Watch CI to green and auto-merge**

`gh pr checks --watch`. On any failure (recall Spec 1: CI-only textlint + biome-over-test-files), fix at the source and push; never bypass the gating Claude review.

## Self-review notes

- Spec coverage: A→Tasks 1-2; B→Task 4; C→Task 3; D→Task 4 (gh-exec.md + prompt pointers); E→Task 5; F→Task 6; verify/PR→Task 7.
- Dependency order respected: taxonomy (1-2) before gh_exec (4, uses detectGhError); formatters extraction (5) after taxonomy edits to gh.ts to avoid churn; benchmarks (6) reference the final 11 tools.
- Type consistency: `detectGhError`/`detectGhErrorType`/`GhErrorType`, `findMutation`/`hasControlChars`/`MUTATING_VERBS`, `HELP_PATH_PATTERN`, `GhExecTool`/`GhHelpTool` used verbatim across tasks.
- Known verification-vs-live gaps flagged for the implementer: confirm `buildTextResult` signature and `ToolSession` name in gh.ts before adding the two tool classes; watch for a circular import when moving shared helpers in Task 5; bump `extension.test.ts` tool-count as tools are added.
```
