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

## Installation

```bash
claude /install f5xc-github-ops@f5xc-salesdemos-marketplace
```
