# CLI-Plugin Progressive-Discovery Parity — Design

- **Issue:** #799 (Spec 1)
- **Status:** design approved; Spec 1 scoped for implementation
- **Date:** 2026-07-22

## Context

The marketplace ships six CLI-integration plugins — `azure`, `aws`, `gcloud`,
`gitlab`, `salesforce`, `github` — that let the xcsh agent drive a cloud/dev CLI.
They diverged badly in how the agent **progressively discovers and safely uses**
each CLI. This effort followed the `azure` plugin's `az_exec` bug fix (#797), where
a fair question was raised: was that a one-off, or is there systemic inconsistency?

An audit confirmed systemic inconsistency across three tiers:

| Capability | Azure | aws | gcloud | GitLab | salesforce | GitHub |
|---|---|---|---|---|---|---|
| Native tools | 6 | 0 | 0 | 4 | 4 | 9 |
| `*_exec` passthrough | yes | no | no | no | SOQL-only | no |
| `*_help` discovery tool | yes | no | no | no | no | no |
| Query-language docs | yes | no | no | thin | best | thin |
| Error taxonomy (typed) | yes | no | no | yes | richest | weakest |
| Read-only guardrail (code) | yes | n/a | n/a | n/a | n/a | **no + ships mutating tools** |
| argv exec, no shell | yes | agent | agent | yes | yes | yes |
| Auth/router/wizard/context/hooks | yes | yes | yes | yes | yes | yes |
| Benchmarks + autoresearch harness | yes | no | no | no | no | no |

Two findings drive the work:

1. **Progressive discovery is uneven.** Only `azure` teaches its CLI's query
   language and has a discovery (`*_help`) tool. `aws`/`gcloud` have no native tools
   at all — everything is a Bash subagent call.
2. **A real safety defect, not just a parity gap:** `github` ships intentional
   mutating tools (`gh_pr_checkout`, `gh_pr_push` → branch reset,
   `git push --force-with-lease`) with **no code-level guardrail** — only agent
   prose asking nicely.

**Intended outcome:** one written standard ("what a conformant xcsh CLI plugin has"),
then each plugin brought up to it. Reference is **best-of-breed**, not "copy Azure":
Azure supplies structure, `salesforce` the error taxonomy + query-doc depth,
`aws`/`gcloud` richer service-status and cloud-native auth, `github` signal-aware exec.

## The program (full structural parity), decomposed

Too large for one spec; sequenced as independent sub-specs (each its own issue →
branch → PR). The contract is written first so 2–6 are conformance work against a
fixed yardstick and can run in parallel.

1. **Spec 1 (this doc):** the Capability Contract + GitHub safety fix.
2. **Spec 2:** GitHub → contract (error taxonomy, `gh_help`, `gh_exec`, `--json/--jq`
   docs, formatters module, per-tool tests, benchmarks, autoresearch).
3. **Spec 3:** GitLab → contract (`glab_exec`, `glab_help`, query docs, tests, benchmarks).
4. **Spec 4:** salesforce → contract (gap-fill: `sf_exec`, `sf_help`, benchmarks,
   autoresearch — already strongest).
5. **Spec 5:** aws → contract (build tool layer from zero: typed tools, `aws_exec`,
   `aws_help`, JMESPath `--query` docs, `src/aws/` service layer, formatters, tests,
   benchmarks).
6. **Spec 6:** gcloud → contract (from zero, `--filter`/`--format` docs).

## Spec 1, Part A — the CLI-Plugin Capability Contract

A written standard committed at `.plans/cli-plugin-contract.md` — kept in the tracked,
non-i18n `.plans/` tree deliberately, so it does not trigger translation regeneration
across the language directories (it is an internal engineering standard, not end user
docs; `docs/superpowers/` is gitignored and the `docs/<lang>/` trees are auto-translated).
It defines the conformant capability set and ships a **conformance checklist**
(PRESENT / PARTIAL / MISSING per plugin) as the objective definition of done for specs 2–6.

Contract dimensions (best-of-breed source in parentheses):

- **Execution & hygiene** — argv-only `Bun.spawn` with no shell (universal invariant);
  control-char/NUL rejection (Azure `hasControlChars`); signal-aware/cancellable exec
  (GitHub's `git.ts` pattern; Azure currently ignores the signal — reconcile into one
  documented policy).
- **Discovery** — a `*_help` tool that shells the CLI's own `--help` (Azure `az_help`);
  query-language docs in each CLI's **native** grammar in the passthrough/query prompt:
  - aws: JMESPath `--query` (+ server-side `--filters`)
  - gcloud: `--filter` (server) + `--format` projection (client)
  - GitHub: `--json` + `--jq`
  - GitLab: `--output json`
  - salesforce: SOQL (the 134-line `sf-query.md` playbook is the depth bar)
- **Error taxonomy** — shared shape `auth_required | session_expired | not_found |
  exec_error` (+ domain-specific), stderr-matched, surfaced as `details.errorType`, with
  teaching messages that name the fix (salesforce's 6-class model is the reference).
- **Safety policy (two modes):**
  - *Generic passthrough tools* (`*_exec`): read-only by default via a fail-safe
    mutating-verb check on every non-flag token (Azure `MUTATING_VERBS`/`findMutatingVerb`).
  - *Purpose-built mutating tools* (e.g. GitHub push/checkout): explicit **confirmed
    mutation** (Part B is the reference implementation).
- **Typed tools + formatters** — 3–5 typed reads per CLI: TypeBox params, per-field
  regex validation, JSON→struct normalizers, markdown tables with empty states.
- **Consistency layer (already largely met fleet-wide)** — container-adapted auth skill;
  intent-router skill (`user-invocable:false`); leaf `cli-operator` agent (Bash;
  `Write/Edit/Agent` disallowed); `*:setup` wizard with platform/MDM detection and
  secret-safe auth; `*-login`/`*-status` commands; SessionStart hook; `before_agent_start`
  context injection (sanitized, `display:false`); service-status registration (adopt
  aws/gcloud's richer stderr classification).
- **Testing & optimization** — per-tool tests; a mock-CLI + fixtures benchmark emitting a
  composite metric; the autoresearch contract trio (`autoresearch.md` scope/off-limits/
  invariants, `.ideas.md` backlog, `.checks.sh` keep/reject gate), with identifiers kept
  in sync with source.
- **Recommended host enhancement (out of scope, noted):** the tool contract has no
  declarative `readOnly`/`mutates`/`needsConfirmation` field; enforcement is per-plugin
  today. The contract recommends adding one to the xcsh runtime later.

## Spec 1, Part B — GitHub mutation safety fix

GitHub has exactly two intentional mutators — `gh_pr_checkout`
(`plugins/github/src/tools/gh.ts:2224`) and `gh_pr_push` (`gh.ts:2356`) — with no
code-level gate. Azure-style "block and delegate" is wrong (mutation is their purpose).
The framework already delivers `ctx.ui.confirm()`/`ctx.hasUI` to every tool
(`xcsh/.../extensions/wrapper.ts` → `runner.createContext()`), but GitHub discards it,
narrowing `ctx` to `{cwd}` via `ctx as any` (`gh.ts:120-122`, `index.ts:83-88`).

Design:

1. **Stop discarding `ctx`** — widen the plugin's `AgentToolContext` type in `gh.ts` and
   pass the full context in `index.ts` (remove the `{cwd}` narrowing), exposing
   `ctx.ui` and `ctx.hasUI`.
2. **Confirm before writing** — in each mutating tool, `await ctx.ui.confirm(...)` before
   the first mutating command, showing the concrete action: for push, the resolved
   `remote branch:targetRef` and whether force-with-lease; for checkout, the worktree
   path and any branch reset.
3. **Fail safe when headless** (`hasUI === false`, print/RPC mode) — refuse with an
   instructive error unless an explicit opt-in is set: a registered flag
   (`pi.registerFlag('github-allow-push', …)` + `pi.getFlag`) or an env var. Never push
   unconfirmed silently.
4. **Extra confirm for history-rewriting paths** — `force` (branch reset, `gh.ts:2298`)
   and `forceWithLease` (`gh.ts:2389`) each get their own confirmation even if the base
   action was approved.
5. This becomes the contract's reference implementation of the confirmed-mutation pattern.

### Files (Part B)

- `plugins/github/src/tools/gh.ts` — context type; confirm gates in `gh_pr_checkout` /
  `gh_pr_push`; force-path confirms.
- `plugins/github/src/index.ts` — pass full `ctx`; register the opt-in flag.
- `plugins/github/test/` — new tests (see verification).

## Verification

**Part A (contract):**

- Contract doc exists with the per-plugin conformance matrix and every dimension above.
- Markdown lint + spelling (pre-commit) pass; no i18n regeneration side-effects.

**Part B (GitHub), TDD:**

1. `gh_pr_push` with `hasUI` mock true + confirm→true: push proceeds (mock exec).
2. confirm→false: no push; returns a clear "cancelled" result.
3. `hasUI` false + no opt-in: refused with instructive message; no git command runs.
4. `hasUI` false + opt-in flag/env set: proceeds.
5. `forceWithLease`/`force`: additional confirm required; denial blocks the rewrite.
6. `gh_pr_checkout` mirrors 1–5 for branch reset / worktree creation.

- `cd plugins/github && bun test` green; biome clean; pre-commit clean.
- Manual smoke (if `gh` authed): a read tool (`gh_pr_view`) is unaffected; a push in a
  throwaway branch prompts and only proceeds on approval.

**Workflow:** linked issue #799 → branch `feat/cli-plugin-parity-contract-799` → PR →
required CI (Lint, linked-issue, Claude review) → auto-merge. Never touch `main`.

## Non-goals

- Specs 2–6 (separate issues).
- The host-runtime declarative mutation-metadata field (future xcsh enhancement).
- Changing any read-only tool's behavior or existing tool names/params.
