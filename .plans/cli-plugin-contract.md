# xcsh CLI-Plugin Capability Contract

The standard every xcsh CLI-integration plugin (Azure, aws, gcloud, GitLab,
salesforce, GitHub) conforms to. Best-of-breed: each dimension names the plugin
whose current implementation is the reference.

## Dimensions

1. **Execution & hygiene** — spawn the CLI argv-style via `Bun.spawn([cli, ...args])`;
   never a shell, never `shell:true`, never a command string. Reject arguments
   containing control/NUL bytes. Support cancellation by threading `AbortSignal`
   into the spawn. (Ref: Azure argv model + `hasControlChars`; GitHub signal-aware exec.)
2. **Discovery** — ship a `<cli>_help` tool that runs the CLI's own `--help`, and
   document the CLI's native query grammar in the passthrough/query prompt:
   - aws: JMESPath `--query` (+ server-side `--filters`)
   - gcloud: `--filter` (server) + `--format` projection (client)
   - GitHub: `--json` + `--jq`
   - GitLab: `--output json`
   - salesforce: SOQL
   (Ref: Azure `az_help`; salesforce `sf-query.md` for depth.)
3. **Error taxonomy** — classify stderr into `auth_required | session_expired |
   not_found | exec_error` (+ domain-specific), surface as `details.errorType`, and
   return teaching messages naming the fix. (Ref: salesforce's 6-class model.)
4. **Safety policy** — two modes:
   - Generic passthrough (`<cli>_exec`): read-only by default; block mutating verbs
     via a fail-safe check on every non-flag token. (Ref: Azure `MUTATING_VERBS`.)
   - Purpose-built mutating tools: explicit confirmed mutation via `ctx.ui.confirm`,
     fail-safe refusal when headless unless an explicit opt-in is set, and an extra
     confirm for history-rewriting operations. (Ref: GitHub, this spec.)
5. **Typed tools + formatters** — 3–5 typed reads with TypeBox params, per-field
   validation, JSON→struct normalizers, and markdown tables with empty states.
6. **Consistency layer** — container-adapted auth skill; intent-router skill
   (`user-invocable:false`); leaf `cli-operator` agent (Bash; `Write/Edit/Agent`
   disallowed); `<plugin>:setup` wizard with platform/MDM detection and secret-safe
   auth; `<cli>-login` / `<cli>-status` commands; SessionStart hook;
   `before_agent_start` context injection (sanitized, `display:false`);
   service-status registration with stderr classification. (Ref: aws/gcloud status.)
7. **Testing & optimization** — per-tool tests; a mock-CLI + fixtures benchmark
   emitting a composite metric; the autoresearch trio (`autoresearch.md`,
   `.ideas.md`, `.checks.sh`) with identifiers kept in sync with source.

## Recommended host enhancement (not required for conformance)

The xcsh tool contract has no declarative `readOnly`/`mutates`/`needsConfirmation`
field; safety is enforced per-plugin. A future xcsh enhancement should add one so the
harness can gate mutations centrally.

## Conformance matrix

Legend: ✅ present · ◑ partial · ❌ missing

| Dimension | Azure | aws | gcloud | GitLab | salesforce | GitHub |
|---|---|---|---|---|---|---|
| 1 argv/no-shell | ✅ | n/a | ✅ | ✅ | ✅ | ✅ |
| 1 control-char hygiene | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 1 signal-aware exec | ❌ | n/a | ✅ | ❌ | ❌ | ✅ |
| 2 `<cli>_help` tool | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 2 query-language docs | ✅ | ❌ | ✅ | ◑ | ✅ | ◑ |
| 3 error taxonomy | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| 4 read-only guardrail | ✅ | n/a | ✅ | n/a | n/a | ❌ |
| 4 confirmed-mutation | n/a | n/a | n/a | n/a | n/a | ◑ (this spec) |
| 5 typed tools + formatters | ✅ | ❌ | ✅ | ✅ | ✅ | ◑ |
| 6 consistency layer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 tests + benchmark + autoresearch | ✅ | ◑ | ✅ | ◑ | ◑ | ◑ |

Follow-on specs (2 GitHub, 3 GitLab, 4 salesforce, 5 aws, 6 gcloud) drive each
column to ✅.
