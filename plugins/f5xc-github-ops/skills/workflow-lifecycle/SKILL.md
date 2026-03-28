---
name: workflow-lifecycle
description: >-
  Repository governance workflow for f5xc-salesdemos — issue creation, branch
  naming, PR workflow, CI polling, post-merge monitoring, verification, and
  task completion criteria. Use when starting a new task, creating a PR,
  merging a PR, monitoring CI, verifying outcomes, or checking rate limits.
  Also activates when encountering HTTP 403/429 from the GitHub API.
user-invocable: false
---

# Repository Workflow Lifecycle

ALL Git and GitHub operations MUST be delegated to the
`github-ops` agent. The main session MUST NOT directly
run Git commits, pushes, PR creation, CI polling, or
pre-commit.

## How to Delegate

After making code changes, spawn the agent:

```
Agent(
  subagent_type="f5xc-github-ops:github-ops",
  prompt="<type>: <description>\n\nFiles:\n- <file-list>\n\nWhy: <motivation>"
)
```

Optional fields in the prompt:

- `Issue: #<number>` — skip issue creation
- `Branch: <branch-name>` — skip branch creation

## Handling Agent Responses

The agent returns a structured report with one of these
statuses:

| Status | Meaning | Your Action |
| ------ | ------- | ----------- |
| `COMPLETE` | PR merged, post-merge passed, cleanup done | Task is done |
| `PRE_COMMIT_FAILED` | Lint gate failed before commit | Fix lint errors, re-delegate with same files |
| `CI_FAILED` | CI checks failed after push | Fix CI errors, re-delegate with `Issue:` and `Branch:` to reuse existing PR |
| `BLOCKED` | Rate limit, missing CLI, or missing config | Resolve blocker, then re-delegate |
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

## Rules

- Every change needs a GitHub issue first
- Never commit directly to `main`
- PRs must link to issues via `Closes #N`
- Conventional commits only: `feat:`, `fix:`, `docs:`
- A task is NOT complete until the agent returns `COMPLETE`
