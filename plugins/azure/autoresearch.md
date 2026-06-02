# Azure Status Plugin — Autoresearch Contract

Optimize the azure-status plugin's intelligence quality: improve prompt accuracy, reduce tool invocation turns, and minimize token cost while maintaining all security invariants.

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
- src/az/formatters.ts
- src/az/types.ts

## Off Limits

- src/index.ts
- src/wizard.ts
- src/platform.ts
- src/az/exec.ts
- test/
- benchmarks/
- package.json
- tsconfig.json

## Constraints

- All existing tests must pass (bun test exit 0)
- Security validation patterns must remain exported from src/az/types.ts: SAFE_ARG_PATTERN, SUBSCRIPTION_ID_PATTERN, RESOURCE_GROUP_PATTERN, SUBSCRIPTION_NAME_PATTERN, HELP_PATH_PATTERN, RESOURCE_TYPE_PATTERN, TAG_PATTERN
- SAFE_ARG_PATTERN must be used in src/tools/az-exec.ts
- All 6 tool names must remain: az_account, az_group, az_resource, az_vm, az_exec, az_help
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
