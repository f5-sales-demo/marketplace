---
name: workflow-lifecycle
description: >-
  Repository governance workflow for f5-sales-demo — issue creation,
  branch naming, PR workflow, CI polling, post-merge monitoring,
  verification, post-merge hygiene & teardown, and task completion criteria.
  Enforces GitHub Operations SOPs for content creator repositories (content class in docs-control).
  Use when the user says "commit", "push", "create a pr", "open a pr",
  "merge", "check ci", "poll ci", "create an issue", "create a branch",
  "start a new task", "land these changes", "ship it", "submit for review",
  "monitor ci", "check the build", "run pre-commit", "lint gate",
  "push changes", "open a pull request", "squash merge", "cleanup branches",
  "remove worktree", or "check rate limit".
  Also activates when any code/content-change workflow requires Git operations,
  when the main session has finished editing files and needs to commit,
  or when encountering HTTP 403/429 from the GitHub API.
  Does NOT handle code editing, file creation, file modification,
  test writing, debugging, or any non-Git operation. Does NOT fix
  lint or CI failures — it reports them and stops.
  All operations are delegated to the github-ops subagent.
user-invocable: false
---

# Repository Workflow Lifecycle & Git SOPs

ALL Git and GitHub operations MUST be delegated to the
`github-ops` agent. The main session MUST NOT directly
run Git commits, pushes, PR creation, CI polling, pre-commit,
or manual branch/worktree cleanups.

## Content Creator Repository Standard Operating Procedures (Git SOPs)

When working in a repository classified as **`content`** in `docs-control` management (`.claude/governance.json` or `xcsh://fleet`), all contributions follow the 5-phase Git SOPs:

1. **Phase 1: Comprehensive Issue First**: Create a detailed GitHub issue before making changes (`gh issue create`).
2. **Phase 2: Related Feature Branch / Worktree**: Work in a dedicated feature branch (`feature/<issue>-desc`, `fix/`, `docs/`, `chore/`) or isolated worktree. Never commit to `main`.
3. **Phase 3: PR with Issue Linkage**: Stage specific files, run pre-commit lint gate (`SKIP=super-linter pre-commit run`), commit, push, and open PR linking `Closes #N`.
4. **Phase 4: CI Green Polling & Squash Merge**: Poll CI workflows with rate-limit-aware `gh-poll` library (`poll_until`). Squash merge with branch deletion upon green CI (`gh pr merge --squash --delete-branch`).
5. **Phase 5: Post-Merge Hygiene & Cleanup**: Clean up local feature branches (`git branch -d`), remote feature branches (`git push origin --delete`), merged worktrees (`git worktree remove`), and prune remote tracking refs (`git fetch --prune`).

For full details, read `references/git-sops.md`.

## Progressive Context Hinting

Throughout task execution, the agent and session receive progressively hinted context matching the current lifecycle state:

- **Pre-Flight**: "Content creator repository detected (`content`). Git SOP rule: Issue creation required before content development."
- **Branching**: "Git SOP rule: Dedicated feature branch (`feature/<issue>-desc`) or worktree created."
- **PR Creation**: "Git SOP rule: Open PR referencing `Closes #<issue>`."
- **CI & Merge**: "Git SOP rule: Poll CI until green; squash merge."
- **Teardown**: "Git SOP rule: Post-merge hygiene — delete local/remote branch, remove worktree, prune refs."

## How to Delegate

After making code changes, spawn the agent with `mode: bypassPermissions`.
This is required because the agent executes a multi-step Git workflow
(issue, branch, commit, push, PR, CI poll, merge, post-merge cleanup) that requires
uninterrupted Bash access.

```text
Agent(
  subagent_type="github-ops:github-ops",
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

```bash
gh pr view <PR-NUMBER> --json body --jq '.body' | grep -o 'Closes #[0-9]\+'
```

If no `Closes #N` is found in the PR body, the PR violates
governance and will be blocked by the `Check linked issues` CI
check. Re-delegate with an explicit `Issue:` field.

## Post-Merge Hygiene & Teardown Criteria

A task is NOT complete when a PR is merged. Post-merge hygiene must be performed:
1. `git checkout main && git pull origin main`
2. `git branch -d <branch-name>`
3. `git push origin --delete <branch-name> 2>/dev/null || true`
4. `git worktree remove <path> --force` (if worktree was used)
5. `git fetch --prune`

## Handling Agent Responses

The agent returns a structured report with one of these
statuses:

| Status | Meaning | Your Action |
| ------ | ------- | ----------- |
| `COMPLETE` | PR merged, post-merge passed, cleanup & hygiene done | Task is done |
| `PRE_COMMIT_FAILED` | Lint gate failed before commit | Fix linting errors, re-delegate with same files |
| `CI_FAILED` | CI checks failed after push | Fix CI errors, re-delegate with `Issue:` and `Branch:` to reuse existing PR |
| `BLOCKED` | Rate limit, missing CLI, or missing config | Resolve blocker, then re-delegate |
| `BUDGET_EXHAUSTED` | Primary GitHub rate limit neared exhaustion mid-workflow. Pause until `reset_at` and retry. | Wait until `reset_at`, then re-delegate |
| `RATE_LIMIT_BACKOFF` | Secondary rate limit triggered and a single retry also failed. | Wait `retry_after_seconds`, then re-delegate |
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
- `chore/` for `chore:` changes

## Worktree Awareness

Claude Code sessions frequently run inside Git worktrees for
isolation. The github-ops agent detects worktrees automatically
during initialization and uses worktree-safe path resolution
for all Git operations. Upon post-merge completion, any temporary
worktrees used for the task are removed.

## Rules

- **Every change needs a GitHub issue first — no exceptions.**
- Never commit directly to `main`
- PRs must link to issues via `Closes #N` — the `Check linked issues` CI check will block merge if missing
- Conventional commits only: `feat:`, `fix:`, `docs:`, `chore:`
- Always clean up merged branches and worktrees — leave zero stale branches behind
- A task is NOT complete until the agent returns `COMPLETE` **and** post-merge hygiene is verified
