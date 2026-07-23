# AWS Plugin — Autoresearch Contract

Optimize the AWS plugin's intelligence quality: improve prompt accuracy, reduce tool
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
- src/aws/formatters.ts
- src/aws/exec.ts

## Off Limits

- src/index.ts
- src/wizard.ts
- src/platform.ts
- test/
- benchmarks/

## Constraints

- All existing tests must pass (bun test exit 0)
- The aws_exec guardrail must stay present: `findMutation` (read-only allowlist) in
  src/tools/aws-exec-guard.ts and `hasControlChars` (argv hygiene) in src/tools/shared.ts.
  aws is spawned argv-only (no shell), so the argv boundary is the injection control — do
  NOT reintroduce per-character shell-metacharacter filtering, which only breaks valid
  aws expressions such as `--query` JMESPath syntax.
- Error taxonomy must stay intact: `detectAwsError` remains exported from src/aws/exec.ts and
  keeps classifying stderr into AwsAuthError, AwsSessionExpiredError, AwsThrottlingError,
  AwsAccessDeniedError, and AwsNotFoundError.
- All 5 tool names must remain stable: aws_sts_whoami, aws_s3_ls, aws_ec2_describe_instances,
  aws_help, aws_exec
- Tool parameter names and types must not change
- Biome lint must pass with no new errors
