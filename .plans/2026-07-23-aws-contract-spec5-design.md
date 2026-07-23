# AWS Plugin → Capability Contract (Spec 5) — Design

- **Issue:** #808
- **Status:** design approved (single PR); from-zero tool layer
- **Date:** 2026-07-23

## Context

The `aws` plugin registers zero native tools — an auth-and-status shell (wizard,
`cli-operator` Bash agent, skills, `aws_hint` context injection, service status). Spec 5
builds the native tool layer from scratch, mirroring the conformant Azure structure and
porting the corrected GitLab guard. Everything in the consistency layer is preserved
untouched; the new tool block slots into a fresh
`if (awsAvailable && typeof pi.registerTool === 'function')` gate.

`aws` grammar is `aws <service> <operation>` (space-separated, 2-deep). Output: global
`--output json|text|table` + client-side `--query` (JMESPath — SAME engine as Azure, so
do NOT strip shell metacharacters) + per-service `--filters`. There is NO `api`
passthrough subcommand, so NO `effectiveApiMethod` is needed (simpler than gh/glab/sf).

## Build (files to create)

- `src/aws/types.ts` — interfaces + validation regexes (`INSTANCE_ID_PATTERN`,
  `REGION_PATTERN`, `S3_URI_PATTERN`, `RESOURCE_NAME_PATTERN`, `HELP_PATH_PATTERN`).
- `src/aws/exec.ts` — `Aws*Error` taxonomy (`AwsExecError` base + `AwsAuthError`,
  `AwsSessionExpiredError`, `AwsNotFoundError`, `AwsThrottlingError`,
  `AwsAccessDeniedError`) + `detectAwsError` (stderr precedence: auth → session-expired →
  throttling → access-denied → not-found → exec) + signal-aware argv exec
  (`signal && !signal.aborted` wire) + `execAwsJson`/`execAwsRaw`.
- `src/tools/shared.ts` — `AwsErrorType`, `AwsToolDetails`, `textResult`/`errorResult`,
  `detectErrorType`, local `renderError`, charCode `hasControlChars`, `makeExecApi`,
  normalizers.
- `src/aws/formatters.ts` — `formatIdentityDetail`, `formatBucketTable`,
  `formatS3ObjectTable`, `formatInstanceTable` (markdown, empty states).
- Typed reads: `src/tools/aws-sts-whoami.ts` (`aws sts get-caller-identity`),
  `aws-s3-ls.ts` (`aws s3 ls` / `s3api list-buckets`), `aws-ec2-describe-instances.ts`.
- `src/tools/aws-exec.ts` + `src/tools/aws-exec-guard.ts` (read-only passthrough).
- `src/tools/aws-help.ts` (`aws <path> help` — note `help`, not `--help`).
- `src/prompts/*.md` (aws-exec.md documents JMESPath `--query` + `--filters` + read-only
  policy).
- `src/index.ts` — `withErrorType` wrapper + tool gate (preserve all existing blocks).
- `package.json` scripts + devDeps (`@sinclair/typebox`, `bun-types`); `tsconfig.json`.
- `benchmarks/{mock-aws.sh, scenarios.ts, fixtures/*}` + `autoresearch.{sh,checks.sh,md,ideas.md}`.
- Per-tool tests + `test/aws/{exec,formatters}.test.ts`.

## `aws_exec` guard (`aws-exec-guard.ts`)

Fail-safe read-only allowlist on the operation token (`positionals[1]`), with GitLab's
flag-value exclusion (exclude the token after any flag) and `hasControlChars`:

- `READ_PREFIXES` = `describe- list- get- lookup- search- batch-get- head- estimate-
  simulate- preview- filter- check- resolve-`; `READ_EXACT` = `ls wait help scan select
  query`.
- **s3 special-case** (`service === 's3'`): allow `ls`; BLOCK `cp mv rm sync mb rb`
  (S3 writes) and anything else fail-safe.
- Generic services: allow iff `op` is READ_EXACT or starts with a READ_PREFIX; else
  BLOCK (unknown → blocked). This inherently blocks `create-*/delete-*/put-*/run-*/
  terminate-*/update-*/modify-*/…` and any unrecognized op.
- No `effectiveApiMethod` (aws has no api-method passthrough).
- Tool: reject empty; `hasControlChars` per arg; block per guard with cli-operator
  delegation message; default `--output json` unless caller set `--output`/`-o`; cap
  output; classify failures via `detectAwsError`. Do NOT strip shell metacharacters
  (argv exec; JMESPath needs `|`/backticks).

## Task sequencing (single PR)

1. `types.ts` + `exec.ts` (taxonomy + signal exec) + `shared.ts` (TDD detector/hygiene).
2. `formatters.ts` + the 3 typed read tools + their prompts (TDD).
3. `aws-exec-guard.ts` + `aws-exec.ts` + `aws-help.ts` + prompts (TDD, adversarial guard).
4. `index.ts` wiring (withErrorType + gate) + package.json/tsconfig + extension test.
5. benchmark + autoresearch harness (`mock-aws`).
6. verify + PR.

## Verification

`cd plugins/aws && bun test` green; `npx biome ci plugins/aws` exit 0; `bun run
benchmarks/scenarios.ts` composite; `autoresearch.checks.sh` passes; prose
brand-capitalized (AWS/Azure/GitHub/GitLab); doc lines < 400. Manual smoke (if `aws`
authed): `aws_sts_whoami` returns identity; `aws_exec` runs `ec2 describe-instances` and
refuses `ec2 run-instances`, `s3 rm`, `iam create-user`. Workflow: issue #808 → branch
`feat/aws-contract-parity-808` → PR → CI → auto-merge. Plan file UNTRACKED; verify with
`biome ci` before pushing. Never touch `main`.

## Non-goals

Spec 6 (gcloud). Preserve the auth skill / cli-operator agent / wizard / context
injection / service status unchanged.
