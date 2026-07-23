# GitLab Plugin → Capability Contract (Spec 3) — Design

- **Issue:** #803
- **Status:** design approved (single PR)
- **Date:** 2026-07-23

## Context

Spec 3 brings the `gitlab` plugin up to the CLI-Plugin Capability Contract
(`.plans/cli-plugin-contract.md`), mirroring Spec 2's GitHub work. GitLab starts
further along than GitHub did: it already has error-taxonomy classes
(`src/glab/exec.ts`), an extracted formatters module (`src/glab/formatters.ts`), a
`glab api`/GraphQL layer, and the full consistency layer (auth skill, router,
`cli-operator` agent, wizard, hooks, context injection, service status). So Spec 3 is
smaller than Spec 2 — mostly wiring and two new tools.

Registration style differs from GitHub: GitLab uses Azure-style factory functions
`createGlab*Tool(pi)` reading `pi.typebox.Type` (no `setTypebox` shim). New tools slot
in the same way.

## Gaps to close

1. **Error taxonomy wiring.** Classification is inline in `execGlab()`; there is no
   standalone `detectGlabError()`. `detectErrorType()` never maps `GlabNotFoundError`
   → `not_found` (bug), and `errorType` is declared on `GlabToolDetails` but never set.
   No central wrapper.
2. **Signal + hygiene.** `src/tools/shared.ts` `makeExecApi` deliberately does NOT
   thread `AbortSignal` into `Bun.spawn` (a comment documents a prior stale-signal
   false-cancel), and there is no control-char argv hygiene.
3. **No `glab_exec` passthrough, no `glab_help` discovery tool.**
4. **No `--output json` / `glab api` query docs.**
5. **No benchmark/autoresearch harness; thin per-module tests.**
6. **Duplicate `GlabToolDetails`** in `src/renderers/glab-renderer.ts` (missing
   `errorType`).

## Design decisions

- **`detectGlabError(stderr, stdout, code, opts?)`** in `src/glab/exec.ts` returns the
  right subclass (auth / not-found / rate-limit / exec), with a shared `GlabExecError`
  base (mirror GitHub's `Gh*Error` shape). Add `GlabRateLimitError`. Keep messages
  identical to today's inline strings where they exist. Fix `detectErrorType` to map
  `not_found`, and extend `GlabErrorType` to `auth_required | not_found | rate_limited |
  exec_error`. Reconcile the duplicate `GlabToolDetails` down to one definition
  (`shared.ts`) that both the tools and the renderer import.
- **Central `errorType` mapping** in `index.ts`: because tools are factory objects,
  wrap each registered tool's `execute` (a small `withErrorType(tool)` helper applied
  where `pi.registerTool(...)` is called) that catches a thrown `Glab*Error`, re-throws
  abort, and returns an `errorResult` carrying `details.errorType`. Preserves the
  existing per-tool `GlabAuthError`→friendly-text behavior where it already exists
  (apply the wrapper so it does not double-handle auth — the wrapper only adds
  `errorType` on results that are still thrown past the tool).
- **Signal + hygiene:** thread `signal` into `Bun.spawn`, but preserve the fix the
  comment describes — do not pre-check `signal.aborted` in a way that re-introduces the
  false-cancel; add a test. Add `hasControlChars` rejection in the new `glab_exec` path
  (and optionally the shared path).
- **`glab_exec`** (`src/tools/glab-exec.ts` + `src/tools/glab-exec-guard.ts`): read-only
  allowlist keyed on the leaf verb — `READ_VERBS = {list, view, diff, show, get,
  status}`, `READ_TOP = {search, version, help}` — plus `glab api` allowed only when its
  effective method is GET. glab's `api` flags differ from gh: `-F/--field` (typed),
  `-f/--raw-field` (string), `--input`; default method is POST when any body flag is
  present. Adapt GitHub's `effectiveApiMethod` to these names. Block everything else
  (fail-safe). Reuse the argv-no-shell + control-char pattern.
- **`glab_help`** (`src/tools/glab-help.ts`): `glab <path> --help` via the exec layer,
  with the same path guard as GitHub (`/^[a-z][a-z -]*$/`, reject parts starting with
  `-`).
- **Query docs** (`src/prompts/glab-exec.md`, `glab-help.md`): document `--output json`
  and `glab api` (GET-only via `glab_exec`), and explicitly note glab uses `--output
  json` (not GitHub's `--json`/`--jq`) and that `-F`/`-f` semantics are swapped vs
  GitHub. Add pointers in the existing tool prompts.
- **Benchmark + autoresearch harness:** `benchmarks/{mock-glab.sh, scenarios.ts,
  fixtures/*}` + `autoresearch.{sh,checks.sh,md,ideas.md}`, wired to the real
  `createGlab*Tool` exports and gitlab security invariants (`findMutation`,
  `hasControlChars`); reference `plugins/gitlab`.

## Task sequencing (single branch)

1. `detectGlabError` + taxonomy fixes (exec.ts, shared.ts) + reconcile duplicate
   `GlabToolDetails`. 2. Central `errorType` wrapper in index.ts. 3. Signal threading +
   control-char hygiene. 4. `glab_help`. 5. `glab_exec` + guard + query docs. 6.
   Benchmark/autoresearch harness. 7. Verify + PR. Tests (TDD) where there is logic
   (detect, guard, path validation); docs for query prompts.

## Verification

- `cd plugins/gitlab && bun test` green (incl. new `detectGlabError`, guard, help-path,
  and signal tests, and the reconciled details); `bun run benchmarks/scenarios.ts`
  prints a composite metric; `npx biome check plugins/gitlab/src/` clean; markdown +
  textlint (brand capitalization; use the "empty lines" term) clean; pre-commit
  clean.
- Manual smoke (if `glab` authed): `glab_help` returns help; `glab_exec` runs a read
  (`issue list --output json`) and refuses `mr merge` / `api -X POST`; existing tools
  unchanged.
- Workflow: issue #803 → branch `feat/gitlab-contract-parity-803` → PR → CI →
  auto-merge. Never touch `main`.

## Non-goals

- Specs 4–6 (salesforce, aws, gcloud).
- Adding new typed MR/pipeline tools (only the contract-required passthrough/help/docs
  and wiring); typed-tool breadth can be a later enhancement.
