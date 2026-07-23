# gcloud Plugin → Capability Contract (Spec 6) — Design

- **Issue:** #809
- **Status:** design approved (single PR)
- **Date:** 2026-07-23

## Context

Spec 6 is the final CLI-plugin parity spec. Unlike Specs 2–5, gcloud starts as a
**status-only** plugin: `src/index.ts` (setup command, service-status registration,
`before_agent_start` config-context injection, `session_start` notice),
`src/platform.ts`, `src/wizard.ts`, the consistency layer (`agents/cli-operator.md`,
`commands/`, `skills/`, `hooks/`), and shell tests under `scripts/tests/`. There is **no
`src/tools/` directory, no exec layer, no error taxonomy, no formatters, no typed tools,
no benchmark/autoresearch harness**. So Spec 6 is a from-zero build of the tool layer —
the heaviest spec on new-file volume, but it has the fullest set of merged references.

The **reference for the tool layer is aws (Spec 5, #812)** for structure (from-zero
`src/<cli>/` + `src/tools/` split, signal-aware `shared.ts`, charCode `hasControlChars`,
`withErrorType` wrapper in `index.ts`, typed-tool + formatter + benchmark shape) and
**Azure (Spec 1) for the guard model**: gcloud's grammar is deep
`gcloud <group> [<subgroup>…] <verb> [args] [--flags]` with a leaf verb and trailing
positional args — the same shape Azure's `az` guard solved, NOT aws's flat 2-level
`<service> <operation>` prefix model. So the `gcloud_exec` guard ports Azure's
scan-all-positionals fail-safe design, adapted to gcloud verbs, inverted to a **read
allowlist** (gcloud has too many mutating verbs and dangerous non-`create/delete`
execution vectors — `get-credentials`, `ssh`, `scp`, `connect`, `call` — to enumerate as a
denylist safely).

Registration style: gcloud uses the aws/Azure `ExtensionFactory` + `createGcloud*Tool(pi)`
factory idiom reading `pi.typebox.Type` (no `setTypebox` shim).

## Gaps to close (all contract dimensions)

1. **Execution & hygiene** — no exec layer. Add `src/gcloud/exec.ts` (`execGcloudJson`/
   `execGcloudRaw`) and `src/tools/shared.ts` `makeExecApi` with the aws signal-aware
   `Bun.spawn` (`...(signal && !signal.aborted ? { signal } : {})`) and charCode
   `hasControlChars`.
2. **Discovery** — no `gcloud_help`; no query-grammar docs. Add `gcloud_help` +
   `gcloud-exec.md`/`gcloud-help.md` documenting `--filter` (server) + `--format` (client
   projection) + `--project`/`--limit`/`--sort-by`.
3. **Error taxonomy** — none. Add `Gcloud*Error` classes + `detectGcloudError` +
   `detectErrorType` → `errorType`.
4. **Safety** — no read-only guard. Add `gcloud_exec` + `gcloud-exec-guard.ts`
   (read-allowlist, fail-safe).
5. **Typed tools + formatters** — none. Add 4 typed reads + `src/gcloud/formatters.ts`.
6. **Consistency layer** — already ✅ (present). Leave as-is except registering the new
   tools in `index.ts`.
7. **Testing & optimization** — only shell tests. Add per-tool `bun test` suites +
   `benchmarks/` (mock-gcloud + fixtures + scenarios.ts) + autoresearch trio.

## Design decisions

### `gcloud_exec` guard — the hard part (gcloud grammar)

gcloud grammar: `gcloud [alpha|beta] <group> [<subgroup>…] <verb> [positional args] [--flags]`.
The action **verb is the leaf of the command path, but NOT the last positional** — trailing
positional args (project IDs, resource names, `gs://` URIs) follow it
(`gcloud projects describe my-proj` → verb `describe`, arg `my-proj`).

Guard algorithm (`gcloud-exec-guard.ts`), fail-safe **read allowlist**:

- `getPositionals(args)` — every non-flag token (Azure's fail-safe model: do NOT try to
  exclude flag values; a `--filter`/`--format` value that happens to equal a mutating verb
  is blocked rather than risk a destructive false negative — a rare, safe failure that
  gcloud filter/format values do not trigger in practice since they are `key=value` /
  `projection(...)` shaped, not bare verbs).
- `findVerb(positionals)` — the **leftmost** positional that is a recognized verb (in
  `READ_EXACT` ∪ `READ_PREFIXES` ∪ `MUTATING_VERBS` ∪ `DANGEROUS_VERBS`). Tokens before it
  are the group path; tokens after are args. (Leftmost, because the group path is nouns and
  the first recognized action word is the verb.)
- Decision:
  1. If any positional is in `DANGEROUS_VERBS` (execution/credential-exfil vectors) →
     **block** with a specific message, regardless of position (defense in depth).
  2. If any positional is in `MUTATING_VERBS` → **block** (defense in depth, Azure-style
     scan-anywhere).
  3. Else if `findVerb` resolves to a `READ_EXACT` / `READ_PREFIXES` verb → **allow**.
  4. Else → **block** (fail-safe: unrecognized verb).

Verb sets (grounded in the gcloud surface):

- `READ_EXACT` = `list`, `describe`, `get-iam-policy`, `get-value`, `get-server-config`,
  `get-ancestors`, `list-grantable-roles`, `print-settings`, `version`, `info`.
  (`print-access-token` / `print-identity-token` are NOT reads — they mint/print usable
  bearer credentials to stdout, so they live in `DANGEROUS_VERBS`.)
- `READ_PREFIXES` = `list-` (e.g. `list-instances`), `describe-`.
- `READ_TOP` (top-level, no group/verb) = `version`, `info`, `help`, `topic`,
  `cheat-sheet`. These resolve when positionals[0] is one of them.
- `DANGEROUS_VERBS` = `ssh`, `scp`, `connect`, `call`, `execute` (`run jobs execute`,
  `workflows execute` — code execution), `interactive`, `login`, `revoke`,
  `get-credentials` (writes kubeconfig + grants cluster access — a `get-*` that is NOT a
  read), `print-access-token`, `print-identity-token` (mint/print usable bearer
  credentials to stdout — credential exposure), `reset-windows-password`,
  `simulate-maintenance-event`, `enable-service`, `configure-docker`.
  (NB: `run` is intentionally excluded — it collides with the Cloud Run group and would
  block reads like `gcloud run services list`; `functions call` is covered by `call` and
  `run deploy` by `deploy`.)
- `MUTATING_VERBS` = `create`, `delete`, `update`, `patch`, `remove`, `add`, `set`,
  `set-iam-policy`, `add-iam-policy-binding`, `remove-iam-policy-binding`, `deploy`,
  `import`, `export`, `apply`, `enable`, `disable`, `start`, `stop`, `restart`, `resize`,
  `suspend`, `resume`, `reset`, `rollback`, `promote`, `migrate`, `undelete`, `restore`,
  `activate`, `deactivate`, `attach`, `detach`, `bind`, `unbind`, `clear`, `move`,
  `clone`, `copy`, `wait`, `abandon`, `recreate`, `rotate`, `acknowledge`, `publish`,
  `seek`, `purge`, `cancel`, `override`, `unset`, `snapshot`, `upgrade`, `downgrade`,
  `repair`, `drain`, `uncordon`, `cordon`, `add-tags`, `remove-tags`.

Verbs appearing in BOTH `MUTATING_VERBS` and `DANGEROUS_VERBS`: none — `call` is
dangerous only; `set-iam-policy` is mutating. `set` covers `config set`, `set-*` covered
explicitly where the hyphenated form matters.

`buildGcloudArgs(args)` — append `--format=json` only when the caller supplied no
`--format`; respect a caller `--format=table(...)`/`yaml`/`csv`/`value(...)`. (gcloud uses
`--format`, not `--output`.)

### The rest (ports of aws Spec 5)

- **`src/tools/shared.ts`**: `GcloudErrorType = auth_required | session_expired |
  not_found | permission_denied | exec_error`; `GcloudToolDetails` (tool, action, the
  typed struct arrays, `errorType`); `textResult`/`errorResult`; `detectErrorType`
  (maps the `Gcloud*Error` subclasses); `renderError`; charCode `hasControlChars`
  (reject `c<=8`, `11`, `12`, `14–31`, `127`; allow tab/LF/CR); signal-aware `makeExecApi`.
- **`src/gcloud/exec.ts`**: `GcloudExecError` base + `GcloudAuthError`,
  `GcloudSessionExpiredError`, `GcloudNotFoundError`, `GcloudPermissionError`.
  `detectGcloudError(stderr, exitCode)` precedence auth → session-expired → permission →
  not-found → generic. `parseGcloudJsonOutput`, `execGcloudJson`/`execGcloudRaw` (append
  `--format=json`, `gcloud` binary).
  Classification signatures (lowercased stderr):
  - auth: `do not currently have an active account`, `gcloud auth login`,
    `does not have any valid credentials`, `no active account`.
  - session-expired: `reauthentication required`, `reauthentication failed`,
    `invalid_grant`, `token has been expired or revoked`.
  - permission: `permission_denied`, `does not have permission`, `permission denied`,
    `caller does not have permission`, `403`, `forbidden`.
  - not-found: `not_found`, `was not found`, `does not exist`, `404`.
- **`index.ts`**: add the aws `withErrorType` wrapper; register the 6 tools guarded by an
  existing `gcloudAvailable` check (mirror aws — move the availability probe up and gate
  `registerTool`). Keep the existing service-status + context-injection + session_start
  blocks unchanged.
- **`gcloud_help`** (`src/tools/gcloud-help.ts`): `gcloud <path> --help` via the exec
  layer, `HELP_PATH_PATTERN = /^[a-z][a-z0-9 -]*$/`, reject parts starting with `-`.
- **Typed reads (4)** mirroring aws/Azure, each with a prompt + formatter + validation:
  1. `gcloud_config_list` — `gcloud config list --format=json` → active project / account
     / region / zone (context + identity; mirrors `az_account_show`).
  2. `gcloud_projects_list` — `gcloud projects list --format=json` → projectId / name /
     projectNumber / lifecycleState.
  3. `gcloud_compute_instances_list` — `gcloud compute instances list --format=json` →
     name / zone / machineType / status / internal+external IP.
  4. `gcloud_storage_buckets_list` — `gcloud storage buckets list --format=json` → name /
     location / storageClass / created. (Falls back cleanly on empty.)
- **`src/gcloud/types.ts`**: struct interfaces, `PluginInterface`, `GcloudRawResult`, and
  validation patterns (`PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/`,
  `ZONE_PATTERN = /^[a-z]+-[a-z]+\d-[a-z]$/`, `HELP_PATH_PATTERN`,
  `RESOURCE_NAME_PATTERN` first-char-non-dash like aws).
- **`src/gcloud/formatters.ts`**: normalizers (raw gcloud JSON → structs) + markdown-table
  formatters with empty states (mirror aws formatters).
- **query docs** (`src/prompts/gcloud-exec.md`, `gcloud-help.md`, + one per typed tool):
  document `--filter` (server-side, `key=value`, `AND`/`OR`, `:` substring) and `--format`
  (client projection: `json`, `value(field)`, `table(...)`, `csv`, `yaml`, `flattened`),
  `--limit`, `--sort-by`. Explicitly contrast with az `--query` (JMESPath) and note gcloud
  splits server filter vs client format. State the read-only allowlist and delegation path.
- **benchmark + autoresearch** (`benchmarks/{mock-gcloud,scenarios.ts,fixtures/*}`,
  `autoresearch.{md,ideas.md,checks.sh}`): port aws's; real `createGcloud*Tool` exports;
  fixtures for config-list / projects-list / instances-list; guardrail scenarios incl.
  `compute instances delete` blocked, `container clusters get-credentials` blocked,
  `compute ssh` blocked, `sql connect` blocked, and a valid `--filter`/`--format` read
  allowed.

## Task sequencing (single PR, TDD)

1. `package.json` test script + devDeps; `src/tools/shared.ts` (types, result helpers,
   `hasControlChars`, signal-aware `makeExecApi`, `detectErrorType`, `renderError`).
2. `src/gcloud/exec.ts` error taxonomy + `detectGcloudError` + exec helpers (TDD on
   `detectGcloudError`).
3. `src/gcloud/types.ts` + `src/gcloud/formatters.ts` (TDD on normalizers/formatters).
4. `gcloud-exec-guard.ts` (heaviest test surface: leftmost-verb, read allowlist, mutating
   scan-anywhere, dangerous vectors, `get-credentials` NOT read, `--format` passthrough,
   control chars) + `gcloud_exec` tool + `gcloud-exec.md`.
5. `gcloud_help` + path validation + `gcloud-help.md`.
6. The 4 typed read tools + prompts (TDD on param validation + normalize/format via mock
   exec).
7. `index.ts` wiring (`withErrorType` + registration).
8. benchmark + autoresearch harness.
9. Verify + PR.

## Verification

- `cd plugins/gcloud && bun test` green (new suites); `npx biome ci plugins/gcloud` exit 0;
  `bun run benchmarks/scenarios.ts` prints a composite metric; `autoresearch.checks.sh`
  passes; prose brand-capitalized (Google Cloud / gcloud / Azure / AWS / GitHub / GitLab),
  no "empty lines" phrasing issues, doc lines < 400; existing `scripts/tests/*.sh`
  structure/security/hook tests still pass (they assert plugin shape — update
  `test_structure.sh` only if it enumerates files).
- Manual smoke (if `gcloud` authed): `gcloud_help` returns help; `gcloud_exec` runs
  `compute instances list --filter=...` and refuses `compute instances delete`,
  `container clusters get-credentials`, `compute ssh`, `sql connect`, `config set`;
  typed tools return structured data.
- Workflow: issue #809 → branch `feat/gcloud-contract-parity-809` → PR → CI → auto-merge.
  Keep the implementation plan file UNTRACKED. Verify with `biome ci` (whole plugin)
  before pushing. Never touch `main`.

## Non-goals

New mutating gcloud tools (writes stay behind the `cli-operator` agent). Touching the
`platform.ts`/`wizard.ts`/consistency-layer subsystems beyond registering tools. Adding a
`get-*`-is-read blanket rule (fail-safe allowlist only; `get-credentials` stays blocked).
