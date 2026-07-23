# gcloud Plugin — Autoresearch Contract

Optimize the gcloud plugin's intelligence quality: improve prompt accuracy, reduce tool
invocation turns, and minimize token cost while maintaining all security invariants.

Composite formula: `accuracy * (1 / (1 + avg_turns / 10)) * (1 / (1 + avg_tokens / 10000))`

## Benchmark

- command: bun run benchmarks/scenarios.ts
- primary metric: composite_score
- metric unit:
- direction: higher
- secondary metrics: accuracy, avg_turns, avg_tokens, live_accuracy

## Files in Scope

- src/prompts/
- src/tools/
- src/gcloud/formatters.ts
- src/gcloud/exec.ts

## Off Limits

- src/index.ts
- src/wizard.ts
- src/platform.ts
- test/
- benchmarks/

## Constraints

- All existing tests must pass (bun test exit 0)
- The gcloud_exec guardrail must stay present: `checkGcloud` (read-only allowlist) with its
  `getPositionals` / `findMutating` / `findDangerous` helpers in src/tools/gcloud-exec-guard.ts,
  and `hasControlChars` (argv hygiene) in src/tools/shared.ts. gcloud is spawned argv-only (no
  shell), so the argv boundary is the injection control — do NOT reintroduce per-character
  shell-metacharacter filtering, which only breaks valid gcloud expressions such as `--filter`
  and `--format` syntax.
- Error taxonomy must stay intact: `detectGcloudError` remains exported from src/gcloud/exec.ts and
  keeps classifying stderr into GcloudAuthError, GcloudSessionExpiredError, GcloudPermissionError,
  and GcloudNotFoundError.
- All 6 tool names must remain stable: gcloud_config_list, gcloud_projects_list,
  gcloud_compute_instances_list, gcloud_storage_buckets_list, gcloud_exec, gcloud_help
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
