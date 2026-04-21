---
name: workflow-lifecycle
description: >-
  Repository governance workflow for f5xc-salesdemos — issue creation,
  branch naming, PR workflow, CI polling, post-merge monitoring,
  verification, and task completion criteria.
  Use when the user says "commit", "push", "create a pr", "open a pr",
  "merge", "check ci", "poll ci", "create an issue", "create a branch",
  "start a new task", "land these changes", "ship it", "submit for review",
  "monitor ci", "check the build", "run pre-commit", "lint gate",
  "push changes", "open a pull request", "squash merge", or
  "check rate limit".
  Also activates when any code-change workflow requires Git operations,
  when the main session has finished editing files and needs to commit,
  or when encountering HTTP 403/429 from the GitHub API.
  Does NOT handle code editing, file creation, file modification,
  test writing, debugging, or any non-Git operation. Does NOT fix
  lint or CI failures — it reports them and stops.
  All operations are delegated to the github-ops subagent.
user-invocable: false
---

# Repository Workflow Lifecycle

ALL Git and GitHub operations MUST be delegated to the
`github-ops` agent. The main session MUST NOT directly
run Git commits, pushes, PR creation, CI polling, or
pre-commit.

## How to Delegate

After making code changes, spawn the agent with `mode: bypassPermissions`.
This is required because the agent executes a multi-step Git workflow
(issue, branch, commit, push, PR, CI poll, merge) that requires
uninterrupted Bash access. Without bypass mode, plan mode can re-engage
mid-workflow and strip Bash access, leaving the agent stuck after
completing only the first step.

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  mode="bypassPermissions",
  prompt="<type>: <description>\n\nFiles:\n- <file-list>\n\nWhy: <motivation>"
)
```

Optional fields in the prompt:

- `Issue: #<number>` — skip issue creation (agent validates the issue exists)
- `Branch: <branch-name>` — skip branch creation

## Verifying Issue Linkage

After the agent returns, **always verify** the response includes
a valid issue number in the Operations table or Issue/PR/SHA links
section. If the agent returns `COMPLETE` but the response does not
contain a `#<number>` issue reference, treat the result as suspect
and verify manually:

```
gh pr view <PR-NUMBER> --json body --jq '.body' | grep -o 'Closes #[0-9]\+'
```

If no `Closes #N` is found in the PR body, the PR violates
governance and will be blocked by the `Check linked issues` CI
check. Re-delegate with an explicit `Issue:` field.

## Handling Agent Responses

The agent returns a structured report with one of these
statuses:

| Status | Meaning | Your Action |
| ------ | ------- | ----------- |
| `COMPLETE` | PR merged, post-merge passed, cleanup done | Task is done |
| `PRE_COMMIT_FAILED` | Lint gate failed before commit | Fix linting errors, re-delegate with same files |
| `CI_FAILED` | CI checks failed after push | Fix CI errors, re-delegate with `Issue:` and `Branch:` to reuse existing PR |
| `BLOCKED` | Rate limit, missing CLI, or missing config | Resolve blocker, then re-delegate |
| `BUDGET_EXHAUSTED` | Primary GitHub rate limit neared exhaustion mid-workflow. Pause until `reset_at` and retry. Report includes remaining/reset fields. | Wait until `reset_at`, then re-delegate |
| `RATE_LIMIT_BACKOFF` | Secondary rate limit triggered and a single retry also failed. Wait `retry_after_seconds` and retry. | Wait `retry_after_seconds`, then re-delegate |
| `FAILED` | Unrecoverable error (merge conflict, etc.) | Read error details, resolve manually |

When re-delegating after a failure, always include the
existing `Issue:` and `Branch:` so the agent resumes
rather than creating duplicates.

## Branch Naming

The agent creates branches in the format
`<prefix>/<issue-number>-short-description`:

- `feature/` for `feat:` changes
- `fix/` for `fix:` changes
- `docs/` for `docs:` changes

## Worktree Awareness

Claude Code sessions frequently run inside Git worktrees for
isolation. The github-ops agent detects worktrees automatically
during initialization and uses worktree-safe path resolution
for all Git operations. No special handling is needed when
delegating from a worktree session.

## Rules

- **Every change needs a GitHub issue first — no exceptions.**
  If the agent returns any status without having created or
  referenced an issue, the workflow has failed regardless of
  what the status says. Verify the issue link before considering
  the task done.
- Never commit directly to `main`
- PRs must link to issues via `Closes #N` — the `Check linked
  issues` CI check will block merge if this is missing
- Conventional commits only: `feat:`, `fix:`, `docs:`
- A task is NOT complete until the agent returns `COMPLETE`
  **and** the response contains a valid issue number
