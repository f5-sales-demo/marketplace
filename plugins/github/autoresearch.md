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
- Mutation-safety gate must stay intact: `resolveApprovalMode` and `HEADLESS_BLOCKED_MESSAGE`
  remain exported from src/tools/mutation-safety.ts, so gh_pr_checkout and gh_pr_push refuse
  to run in headless mode without explicit opt-in.
- gh_exec guardrail must stay present: `findMutation` (read-only allowlist) and `hasControlChars`
  (argv hygiene) remain in src/tools/gh-exec-guard.ts. gh is spawned argv-only (no shell), so the
  argv boundary is the injection control — do NOT reintroduce per-character shell-metacharacter
  filtering, which only breaks valid `--jq` expressions.
- All 11 tool names must remain stable: gh_repo_view, gh_issue_view, gh_pr_view, gh_pr_diff,
  gh_pr_checkout, gh_pr_push, gh_run_watch, gh_search_issues, gh_search_prs, gh_exec, gh_help
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
