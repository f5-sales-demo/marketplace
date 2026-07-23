# Salesforce Plugin — Autoresearch Contract

Optimize the Salesforce plugin's intelligence quality: improve prompt accuracy, reduce tool
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
- src/sf/formatters.ts
- src/sf/exec.ts

## Off Limits

- src/index.ts
- src/wizard.ts
- src/context/
- src/pipeline-report/
- test/
- benchmarks/

## Constraints

- All existing tests must pass (bun test). One pre-existing failure is known and tolerated:
  test/integration/extension-load.test.ts (session_start hook resolves undefined). The checks
  gate allows at most that single known failure; any additional failure is a hard fail.
- sf_exec guardrail must stay present: `findMutation` (read-only allowlist) in
  src/tools/sf-exec-guard.ts and `hasControlChars` (argv hygiene) in src/tools/shared.ts. sf is
  spawned argv-only (no shell), so the argv boundary is the injection control — do NOT reintroduce
  per-character shell-metacharacter filtering, which only breaks valid SOQL and field expressions.
- Error taxonomy must stay intact: `detectSfError` remains exported from src/sf/exec.ts and keeps
  classifying messages into SfSessionExpiredError, SfNoDefaultOrgError, SfAuthError, and SfQueryError.
- All 6 tool names must remain stable: sf_setup, sf_query, sf_org_display, sf_pipeline_report,
  sf_help, sf_exec
- Tool parameter names and types must not change
- Biome lint must pass with no new errors (npx biome check plugins/salesforce/src/)

## Notes

- Prompts under src/prompts/ dominate avg_tokens; trim prose before touching structure.
- Salesforce is a brand name — keep it capitalized in prose.
- Formatter output should stay compact: collapse redundant vertical whitespace in detail views.
