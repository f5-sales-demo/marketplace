# GitHub Plugin → Capability Contract (Spec 2) — Design

- **Issue:** #801
- **Status:** design approved (single-PR, all six areas)
- **Date:** 2026-07-22

## Context

Spec 1 authored the CLI-Plugin Capability Contract (`.plans/cli-plugin-contract.md`) and
fixed the GitHub plugin's mutation-safety gap. Spec 2 brings the `github` plugin up to the
rest of the contract. GitHub is the deepest plugin (9 typed tools) but the weakest on
progressive discovery and robustness: no general passthrough, no discovery tool, a single
generic `ToolError` (auth is the only classified stderr condition), no query-language docs,
all rendering inline in a 2,753-line `src/tools/gh.ts`, and no optimization harness.

Reference implementation: the `azure` plugin (`az_exec`, `az_help`, `src/az/exec.ts`
taxonomy, `src/az/formatters.ts`, `benchmarks/`, `autoresearch.*`). Spec 2 mirrors those
patterns while fixing two staleness bugs found in Azure's own harness (see area F).

**Intended outcome:** one PR that makes `github` conformant on error taxonomy, discovery
(`gh_help`), a read-only-by-default passthrough (`gh_exec`), query docs, a formatters
module, and a benchmark/autoresearch harness — without disturbing the Spec 1 mutation gates.

## Areas and key decisions

### A. Typed error taxonomy

- **Create** `src/gh/exec.ts`: `GhExecError`, `GhAuthError`, `GhNotFoundError`,
  `GhRateLimitError` (+ a `detectGhError(stderr, exitCode)` that actually returns each —
  avoiding Azure's bug where `AzNotFoundError` is declared but never returned), and a
  `GhErrorType = 'auth_required' | 'not_found' | 'rate_limited' | 'exec_error'`.
  Signals: auth → `gh auth login` / `not logged into any GitHub hosts`; not-found →
  `Could not resolve to a` / `HTTP 404` / `no pull requests found`; rate-limit →
  `API rate limit exceeded` / `secondary rate limit` / `HTTP 403|429`.
- **Modify** `src/utils/git.ts`: `github.json`/`github.text` throw `detectGhError(...)`
  instead of the string-only `formatGhFailure` (keep the repo-context message as a
  `GhExecError` submessage). **Modify** `GhToolDetails` (`gh.ts`) to add `errorType?`.
- **Central mapping (the load-bearing decision):** the `index.ts` registration wrapper
  catches a thrown `Gh*Error` and returns an `errorResult` carrying `details.errorType`,
  rather than editing all 9 tools' happy paths. `ToolAbortError` re-propagates. This keeps
  the mutation-safety `throw new ToolError(HEADLESS_BLOCKED_MESSAGE)` sites and their
  direct-execute tests (which assert the verbatim throw) intact, because those tests call
  the tool class directly, not through the wrapper.

### B. `gh_exec` passthrough

- **Create** `src/tools/gh-exec.ts` + `src/prompts/gh-exec.md`. Param `args: string[]`
  (no `gh` prefix). Build on `github.run` (raw, non-throwing) so error mapping flows
  through A. Reuse the Spec 1 argv-hygiene idea (`hasControlChars` → reject control/NUL).
- **Read-only-by-default guardrail** (gh-specific): block a `MUTATING_VERBS` set
  (`create`, `edit`, `delete`, `close`, `reopen`, `merge`, `comment`, `review`, `rerun`,
  `cancel`, `sync`, `fork`, `rename`, `lock`, `unlock`, `pin`, `transfer`, `set`, `add`,
  `remove`, `disable`, `enable`, `revoke`, `import`, `upload`, …) using the fail-safe
  "any non-flag token" scan from Spec 1's helper approach. **Plus** block `gh api` with a
  mutating method: any `-X`/`--method` value that is not `GET` (POST/PUT/PATCH/DELETE).
  Refusal message points to the confirmed-mutation path, consistent with Spec 1.
- **Register** in `index.ts` after the class loop (Azure-style `pi.registerTool(create…)`),
  keeping it off the `setTypebox` class path.

### C. `gh_help` discovery tool

- **Create** `src/tools/gh-help.ts` + `src/prompts/gh-help.md`. Optional `command_path`,
  validate with `HELP_PATH_PATTERN` (`/^[a-z][a-z -]*$/`), run `gh <parts> --help` via
  `github.run`, return `stdout || stderr`. Mirror `az-help.ts`.

### D. Query-language docs

- A "Querying with `--json` / `--jq`" section in `gh-exec.md` — gh uses **jq**, and `--json`
  is per-subcommand with an explicit field list (unlike Azure's universal `--output json`).
  Add one-line `--json`/`--jq` pointers to the existing tool prompts where relevant.

### E. Formatters module

- **Create** `src/gh/formatters.ts`: extract the ~25 pure render/format functions from
  `gh.ts` (`formatShortSha`, `formatAuthor`, `formatLabels`, the `renderJobsSection` /
  `renderRunSection` / `formatRunWatch*` cluster, `formatRepoView`, `formatIssueView`,
  `formatPrView`, `formatPrFiles`, `formatPrCheckoutResult`, `formatPrPushResult`,
  `formatSearchResults`, comment/review sections, …). Keep the render-calls-render cluster
  together; do **not** cross the fetch/format boundary (fetchers stay in `gh.ts`).
- **Modify** `gh.ts` to import them (2,753 → ~1,900 lines). **Create**
  `test/gh/formatters.test.ts` (none exists) covering representative renderers with fixture
  inputs. This area follows A in task order (both touch `gh.ts`).

### F. Benchmark + autoresearch harness

- **Create** `benchmarks/{scenarios.ts, mock-gh.sh, fixtures/*.json}` and
  `autoresearch.{sh,checks.sh,md,ideas.md}`, mirrored from Azure. Wire scenarios to gh's
  **real** exports (`GhRepoViewTool.createIf(...)`, `createGhExecTool`, …) — not Azure's
  stale `createAz*Tool` names — and set gh security invariants in the contract
  (`autoresearch.md`): mutation-safety gate + argv hygiene + read-only guardrail present.
  `autoresearch.checks.sh` must reference `plugins/github` (Azure's says `plugins/azure-status`).
  Fixtures: `repo-view.json`, `issue-view.json`, `pr-view.json`, `pr-diff.txt`,
  `search-issues.json`, `search-prs.json`, `run-list.json`, `run-jobs.json`. No `src/` changes.

## Task sequencing (single branch)

A (taxonomy) → B (`gh_exec`) + C (`gh_help`) + D (query docs) → E (formatters extraction).
F (benchmarks) is independent of `src/` and may land anytime. E must follow A (both edit
`gh.ts`). Each area is TDD where it has testable logic (A `detectGhError`, B guardrail,
C path validation, E renderers); D is docs; F is harness.

## Verification

- `cd plugins/github && bun test` green, including: `detectGhError` classification;
  `gh_exec` control-char + mutating-verb + `gh api` method refusals; `gh_help` path guard;
  extracted formatters; and the unchanged Spec 1 mutation-safety suites.
- `bun run benchmarks/scenarios.ts` runs and prints a composite metric.
- `npx biome check plugins/github/src/` clean; markdown + textlint (brand capitalization)
  clean; all pre-commit hooks pass.
- Manual smoke (if `gh` authed): `gh_help` returns help; `gh_exec` runs a read
  (`repo view --json nameWithOwner`) and refuses `pr merge` / `api -X POST` with a clear
  message; existing read tools behave as before.
- Workflow: issue #801 → branch `feat/github-contract-parity-801` → PR → CI (Lint,
  linked-issue, Claude review) → auto-merge. Never touch `main`.

## Non-goals

- Specs 3–6 (GitLab, salesforce, aws, gcloud).
- Converting the 9 existing tools from throw to `errorResult` (central wrapper mapping
  makes that unnecessary).
- A host-runtime declarative mutation-metadata field (future xcsh enhancement).
