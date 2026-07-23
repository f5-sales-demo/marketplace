# Salesforce Plugin → Capability Contract (Spec 4) — Design

- **Issue:** #805
- **Status:** design approved (single PR)
- **Date:** 2026-07-23

## Context

Spec 4 brings the `salesforce` plugin to the CLI-Plugin Capability Contract. It is the
strongest plugin already: a 6-class error taxonomy (`detectSfError`), per-tool
`errorType`, a modularized formatters module, an excellent SOQL prompt (`sf-query.md`),
a profile collector + pipeline subsystems, and 12 test files. So Spec 4 is mostly two
new tools plus wiring — the lightest of the CLI specs on volume, but the `sf_exec`
guard is the hardest single piece because the `sf` CLI grammar is unusual.

The **reference guard is now GitLab's** `src/tools/glab-exec-guard.ts` — it embeds two
fixes the merge-gating review required (a flag-value-shift bypass and a pflag
short-flag-cluster bypass) that the earlier GitHub/Azure guards predate. Port from
GitLab, not GitHub.

## Gaps to close

1. No general `sf_exec` passthrough; no `sf_help` discovery tool.
2. Exec layer does not thread `AbortSignal` into `Bun.spawn` (documented stale-signal
   avoidance) and has no control-char hygiene.
3. No central `index.ts` `withErrorType` wrapper (errorType is set per-tool);
   `sf-pipeline-report.ts` has a duplicate `detectErrorType`.
4. No benchmark/autoresearch harness.

## Design decisions

### `sf_exec` guard — the hard part (sf grammar)

`sf` (v2) uses **space- and colon-separated** topic→subtopic→command, up to 3 deep, and
accepts BOTH `sf org list` and `sf org:list`. Design:

- **Normalize** every arg by splitting on `:` (so `org:list` → `org`, `list`) before
  analysis, so the colon form cannot evade a space-based check.
- **Port GitLab's guard core**: `hasControlChars` (charCode-based, no regex/suppression),
  flag-value exclusion when computing positionals (exclude the token after any flag —
  closes the flag-value-shift bypass), and `effectiveApiMethod` with **single-dash
  short-flag-cluster parsing** (inspect each char for value-taking shorts — closes the
  cluster bypass).
- **Read-PREFIX allowlist** (not a single leaf verb — sf is 3-deep): allow only known
  read command prefixes on the normalized positionals: `data query`, `data search`,
  `data export`, `org list`, `org display`, `org list metadata`/`metadata-types`,
  `apex list`, `apex get`, `apex tail`, `sobject describe`/`list`, `schema` (read subs),
  `limits api display`, plus top-level `version`/`help`/`commands`/`info`/`which`. Block
  everything else fail-safe — critically `apex run` (arbitrary Apex execution),
  `data create/update/delete/import/upsert`, `project deploy/delete`, `org create/delete`,
  `config set`, `alias set`, package/agent writes.
- **`sf api request`**: sf has an api passthrough (`sf api request rest|graphql` with
  `-X`/`--method` default GET, and `--body`/`--file`). Reuse `effectiveApiMethod`
  (adapt flag names) and additionally BLOCK when `--file`/`--body` is present with a
  non-GET/implied-write method (a file can carry the method/body the guard cannot see).

### The rest (direct ports of GitLab Spec 3)

- **signal + hygiene**: adopt GitLab's `...(signal && !signal.aborted ? { signal } : {})`
  wire in `src/tools/shared.ts`; add the charCode `hasControlChars`.
- **central `withErrorType`** in `index.ts` (mirror GitLab): wrap each `createSf*Tool`
  registration; local `renderError`; re-throw the cancellation error untouched; delete
  the duplicate `detectErrorType` in `sf-pipeline-report.ts` (import from `shared.ts`).
  (Adding a `not_found` class to `SfErrorType` is optional; sf classifies by SF error
  codes, no not-found bug.)
- **`sf_help`**: `sf <path> --help`, path guard allowing the colon form
  (`/^[a-z][a-z :-]*$/`), reject parts starting with `-`.
- **query docs** (`sf-exec.md`, `sf-help.md`): sf global `--json` + `--result-format`
  (`csv|json|human`), the read-only allowlist, the colon/space grammar — distinct from
  GitHub `--json/--jq` and GitLab `--output json`. Leave the excellent `sf-query.md`
  as-is.
- **benchmark + autoresearch harness** (`mock-sf`): port GitLab's; real `createSf*Tool`
  exports; fixtures for org-list/data-query/org-display; guardrail scenarios incl.
  `apex run` blocked and `data:create` (colon form) blocked.

## Task sequencing (single PR)

1. signal + `hasControlChars` in shared.ts. 2. central `withErrorType` + delete pipeline
duplicate. 3. `sf_help`. 4. `sf_exec` + `sf-exec-guard.ts` (colon normalize + GitLab
guard port + read-prefix allowlist + `apex run` + `sf api request`) + query docs. 5.
benchmark/autoresearch harness. 6. verify + PR. TDD where logic exists (guard is the
heaviest test surface: colon evasion, `apex run`, cluster/flag-value, api method/file).

## Verification

- `cd plugins/salesforce && bun test` green; `npx biome ci plugins/salesforce` exit 0;
  `bun run benchmarks/scenarios.ts` composite; `autoresearch.checks.sh` passes; prose
  brand-capitalized (Salesforce/GitHub/GitLab/Azure), no "empty lines" phrasing issues,
  doc lines < 400.
- Manual smoke (if `sf` authed): `sf_help` returns help; `sf_exec` runs `sf org list
  --json` and refuses `sf apex run`, `sf data:create`, `sf api request rest --method
  POST`; existing tools unchanged.
- Workflow: issue #805 → branch `feat/salesforce-contract-parity-805` → PR → CI →
  auto-merge. Keep the implementation plan file UNTRACKED. Verify with `biome ci`
  (whole plugin) before pushing. Never touch `main`.

## Non-goals

Specs 5–6 (aws, gcloud). New typed SObject tools. Touching the profile/pipeline/context
subsystems beyond removing the duplicate `detectErrorType`.
