# GitHub Plugin — Autoresearch Contract

Optimize the GitHub plugin's intelligence quality: improve prompt accuracy, reduce tool
invocation turns, and minimize token cost while maintaining all security invariants.

Composite formula: `accuracy * (1 / (1 + avg_turns / 10)) * (1 / (1 + avg_tokens / 10000))`

## Benchmark

- command: bash autoresearch.sh
- primary metric: composite_score
- metric unit:
- direction: higher
- secondary metrics: accuracy, avg_turns, avg_tokens, live_accuracy

## Files in Scope

- src/prompts/
- src/tools/
- src/gh/formatters.ts
- src/gh/exec.ts

## Off Limits

- src/index.ts
- src/utils/git.ts
- src/wizard.ts
- test/
- benchmarks/

## Constraints

- All existing tests must pass (bun test exit 0)
- Git and GitHub operations execute only through argv arrays. `hasControlChars` remains the shared
  structural validation boundary; do not add policy, confirmation, environment, or mutation gates.
- Existing tool names must remain stable: gh_repo_view, gh_issue_view, gh_pr_view, gh_pr_diff,
  gh_pr_checkout, gh_pr_push, gh_run_watch, gh_search_issues, gh_search_prs, gh_exec, gh_help
- Typed lifecycle tool names must remain stable: github_workflow, github_issue_create,
  github_pr_create, github_pr_auto_merge, github_pr_update_branch, github_worktree_prepare,
  github_worktree_cleanup
- Governance deviations remain machine-readable advisories and must not stop requested operations.
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
