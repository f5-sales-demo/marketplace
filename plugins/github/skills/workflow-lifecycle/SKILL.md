---
name: workflow-lifecycle
description: >-
  Select and report independent GitHub lifecycle stages for issue, branch,
  worktree, pull request, checks, repair, and cleanup requests.
user-invocable: false
---

**Canonical skill URI**: `skill://github:workflow-lifecycle`

# Repository Workflow Lifecycle

Call `github_workflow` with only the stage the user requested:

- `prepare`: create or reuse an issue and prepare a fresh branch/worktree without publishing.
- `status`: inspect a pull request and stop.
- `publish`: stage the selected paths when supplied, push, create a pull request unless direct
  publication was requested, and enable squash auto-merge unless disabled.
- `monitor`: return current checks and retry timing without starting another stage.
- `repair`: update a behind pull request branch or report conflict guidance.
- `cleanup`: remove the named worktree and local branch, normally after merge proof.

Use the narrower typed tools when only one primitive is needed. Explicit alternatives—including no
issue, a custom branch, staging all changes, direct publication, disabled auto-merge, or cleanup
without merge proof—must execute and return machine-readable advisories. Do not ask for a policy
confirmation or turn an advisory into an error.

Report the tool's normalized result directly. Continue only when the caller requested additional
stages; otherwise stop at the completed stage.
