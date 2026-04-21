# f5xc-github-ops

GitHub operations automation plugin for
`f5xc-salesdemos` — enforces the full task lifecycle
from issue creation through post-merge verification.

## Skills

### workflow-lifecycle

Full repository workflow: issue creation, branch naming,
PR lifecycle, CI polling, post-merge monitoring,
verification, and task completion criteria.

**Activates when:** Starting a new task, creating PRs,
merging, monitoring CI, verifying outcomes, or
encountering GitHub API rate limit issues.

**Key behavior:** All Git and GitHub operations are
delegated to the `github-ops` agent. The main session
makes code changes, then delegates operational work.

**Reference files:**

- `polling-protocol.md` — Single-shot polling patterns
  for PR checks and workflow runs
- `rate-limit-management.md` — Consumption zones,
  banned commands, budget estimates, 403 recovery
- `task-completion-checklist.md` — Done criteria
  checklist
- `pre-commit-protocol.md` — Idempotent install,
  fast-mode execution, hook inventory

## Agents

### github-ops

Exclusive GitHub operations agent that handles the full
Git lifecycle for all f5xc-salesdemos repositories.
Supersedes `commit-commands` official plugin.

**Responsibilities:**

1. Idempotent pre-commit installation
2. Fast pre-commit lint gate (`SKIP=super-linter`)
3. Issue creation, branch naming, commits
4. PR creation with issue linking
5. CI polling with error feedback to issues
6. Squash merge and post-merge monitoring
7. Branch cleanup and verification

**Does NOT:** Edit code, fix linting errors, or fix CI
failures. Reports errors back to the calling session
with full context.

**Tools:** `Read`, `Bash`, `Glob`, `Grep` (no `Edit`
or `Write`)

**Status codes:**

| Status              | Meaning                                     |
| ------------------- | ------------------------------------------- |
| `COMPLETE`          | Full lifecycle finished successfully        |
| `PRE_COMMIT_FAILED` | Lint gate failed — fix code and re-delegate |
| `CI_FAILED`         | CI checks failed — error posted to issue    |
| `FAILED`            | Git/GitHub operation failed                 |
| `BLOCKED`           | Cannot proceed (rate limit, missing config) |

**Delegation pattern:**

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="<type>: <description>\n\nFiles to stage:\n- <file-list>\n\nWhy: <motivation>"
)
```

> `mode: bypassPermissions` is required — the agent
> executes a multi-step workflow that needs uninterrupted
> Bash access. Without it, plan mode can re-engage
> mid-workflow and block execution.

## Rate-limit-aware polling (v2.3+)

All CI/workflow polling in the agent is routed through three
composable shell libraries installed by a `PreToolUse` hook to
`~/.claude/github-ops/lib/`:

- **`gh-poll.sh`** — `gh api -i` wrapper that caches ETag+body per
  URL and sends `If-None-Match` on subsequent requests. A `304`
  response returns the cached body at zero primary-rate-limit cost,
  so polling a long-running workflow is nearly free. Exposes
  `poll_until <url> <predicate>` as the primary entry point.
- **`budget.sh`** — adaptive poll-interval calculator (20 s / 60 s /
  180 s based on observed `X-RateLimit-Remaining`), ±25 % jitter,
  `BUDGET_EXHAUSTED` floor at 200 remaining, and a `gap-wait
  mutation` subcommand that enforces ≥1 s between mutative calls.
- **`retry.sh`** — `403`/`429` handling with a host-wide
  `state/cooldown.json` so every Claude Code session on the same
  machine courteously waits out any observed `Retry-After` before
  issuing its next request.

These libraries add two statuses to the agent's return taxonomy:
`BUDGET_EXHAUSTED` and `RATE_LIMIT_BACKOFF`. Callers use these to
distinguish recoverable rate-limit events from non-recoverable
configuration failures.

Concurrency-safe by construction: per-PID log files, atomic-rename
cache writes, `flock`-guarded installer, no locks held across
network I/O.

## Installation

```bash
claude /install f5xc-github-ops@f5xc-salesdemos-marketplace
```
