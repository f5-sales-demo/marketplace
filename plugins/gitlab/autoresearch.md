# GitLab Plugin — Autoresearch Contract

Optimize the GitLab plugin's intelligence quality: improve prompt accuracy, reduce tool
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
- src/glab/formatters.ts
- src/glab/exec.ts

## Off Limits

- src/index.ts
- src/tools/shared.ts
- src/wizard.ts
- test/
- benchmarks/

## Constraints

- All existing tests must pass (bun test exit 0)
- glab_exec guardrail must stay present: `findMutation` (read-only allowlist) and `hasControlChars`
  (argv hygiene) remain in src/tools/glab-exec-guard.ts and src/tools/shared.ts. glab is spawned
  argv-only (no shell), so the argv boundary is the injection control — do NOT reintroduce
  per-character shell-metacharacter filtering, which only breaks valid glab expressions.
- Error taxonomy must stay intact: `detectGlabError` remains exported from src/glab/exec.ts and keeps
  classifying stderr into GlabAuthError, GlabRateLimitError, and GlabNotFoundError.
- All 6 tool names must remain stable: glab_setup, glab_issue_list, glab_issue_view, glab_search,
  glab_help, glab_exec
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
