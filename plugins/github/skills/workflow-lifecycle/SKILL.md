---
name: workflow-lifecycle
description: >-
  Repository governance workflow for f5-sales-demo — issue creation,
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
  Delegates mechanical Git lifecycle tasks to the github-ops agent.
user-invocable: false
---

# Repository Workflow Lifecycle

<role>
You manage the lifecycle delegation protocol. You delegate mechanical Git and GitHub operations (issue creation, feature branching, staging, pre-commit linting, PR creation, CI monitoring, post-merge teardown) to the specialized `github-ops` agent.
</role>

<delegation_protocol>

## Delegation Procedure

Upon completing file modifications in the main session, delegate Git lifecycle execution to the `github-ops` agent:

```text
Agent(
  subagent_type="github:github-ops",
  mode="bypassPermissions",
  prompt="<type>: <description>\n\nFiles:\n- <file-list>\n\nWhy: <motivation>"
)
```

*Rationale for bypassPermissions*: The `github-ops` agent performs a continuous multi-step Git lifecycle (issue creation → branch creation → staging -> commit -> pre-commit -> push -> PR creation -> CI polling -> merge). Running in `bypassPermissions` ensures uninterrupted execution through completion.

Optional prompt fields:

- `Issue: #<number>` — provide existing issue ID (bypasses issue creation step).
- `Branch: <branch-name>` — provide existing feature branch name (bypasses branch creation step).

</delegation_protocol>

<verification>

## Issue Linkage Verification

When `github-ops` completes execution, confirm the status report includes a valid linked issue reference (`#<number>`).

If additional verification is desired, validate the PR body reference:

```bash
gh pr view <PR-NUMBER> --json body --jq '.body' | grep -o 'Closes #[0-9]\+'
```

*Rationale*: Linking issues via `Closes #N` enables GitHub's automated closing mechanism and satisfies the `Check linked issues` CI gate.

</verification>

<status_handling>

## Handling Agent Status Reports

The agent returns a structured status report:

| Status | Meaning | Action Path |
| | --- | --- |
| `COMPLETE` | PR merged, post-merge verified, branch retired | Confirm task completion with user |
| `PRE_COMMIT_FAILED` | Lint gate reported issues before commit | Resolve code/formatting findings; re-delegate with same file list |
| `CI_FAILED` | CI checks failed post-push | Analyze run logs; resolve root causes; re-delegate specifying `Issue:` and `Branch:` |
| `BLOCKED` | Environment requirement or rate limit pending | Resolve blocker; re-delegate with context |
| `BUDGET_EXHAUSTED` | Primary API rate limit reached near threshold | Pause until `reset_at` timestamp; re-delegate |
| `RATE_LIMIT_BACKOFF` | Secondary rate limit triggered | Cooldown for `retry_after_seconds`; re-delegate |
| `FAILED` | Unrecoverable workflow state encountered | Read diagnostic details; resolve manually or prompt user |

</status_handling>

<governance_rules>

## Workflow Governance Standards

1. **Issue-Driven Contributions**: Every PR must link to a valid GitHub tracking issue (`Closes #N`) to ensure automated tracking across the fleet.
2. **Feature Branching**: Create feature branches from fresh `origin/main` following conventional prefixes (`feature/`, `fix/`, `docs/`).
3. **Protected Main Branch**: Land changes on `main` via merged pull requests with squash auto-merge enabled.
4. **Conventional Commit Standard**: Use clear conventional commits (`feat:`, `fix:`, `docs:`, `chore:`) to ensure clean changelog generation.

</governance_rules>
