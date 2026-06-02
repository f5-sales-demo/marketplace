# Azure Status Plugin — Autoresearch Contract

Optimize the azure-status plugin's intelligence quality: improve prompt accuracy, reduce tool invocation turns, and minimize token cost while maintaining all security invariants.

## Benchmark

- command: `bash autoresearch.sh`
- primary metric: `composite_score`
- metric unit:
- direction: higher
- secondary metrics: accuracy, avg_turns, avg_tokens, live_accuracy

## Composite Formula

```
composite = accuracy * (1 / (1 + avg_turns / 10)) * (1 / (1 + avg_tokens / 10000))
```

- `accuracy` (0-1): Fraction of 15 mock scenarios producing correct output
- `avg_turns` (number): Average tool invocations needed per multi-step task
- `avg_tokens` (number): Total bytes of prompt .md files
- `live_accuracy` (0-1): Fraction of live az CLI spot-checks that parse correctly

## Files in Scope

- `src/prompts/`
- `src/tools/`
- `src/az/formatters.ts`
- `src/az/types.ts`

## Off Limits

- `src/index.ts`
- `src/wizard.ts`
- `src/platform.ts`
- `src/az/exec.ts`
- `test/`
- `benchmarks/`
- `package.json`
- `tsconfig.json`
- `autoresearch.*`

## Constraints

1. All existing tests must pass (`bun test` exit 0)
2. Security validation patterns must remain exported from `src/az/types.ts`:
   SAFE_ARG_PATTERN, SUBSCRIPTION_ID_PATTERN, RESOURCE_GROUP_PATTERN,
   SUBSCRIPTION_NAME_PATTERN, HELP_PATH_PATTERN, RESOURCE_TYPE_PATTERN, TAG_PATTERN
3. SAFE_ARG_PATTERN must be used in `src/tools/az-exec.ts`
4. All 6 tool names must remain: az_account, az_group, az_resource, az_vm, az_exec, az_help
5. Tool parameter names and types must not change
6. Biome lint must pass with no new errors
