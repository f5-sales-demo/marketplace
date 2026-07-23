Run any read-only `glab` (GitLab CLI) command. Pass arguments as an array without the `glab` prefix, e.g. `["issue", "list", "--output", "json"]`.

## Safety

- Arguments are passed argv-style to `glab` with no shell, so shell metacharacters are inert.
- Read-only by an allowlist (fail-safe: anything unrecognized is blocked). A command is allowed only when its leaf verb is a known read (`list`, `view`, `diff`, `show`, `get`, `status`), plus the top-level `glab search`, `glab version`, and `glab help`.
- `glab api` is allowed only when it resolves to a GET: no `-X`/`--method` naming a mutating method, and no body flag (`-F`/`--field`, `-f`/`--raw-field`, `--input`, `--form`), since any of those makes glab send a POST. Use `glab api` through `glab_exec` for GET reads only.
- Everything else is blocked: write verbs (`create`, `merge`, `close`, `delete`, `update`, ...), `glab api` POST/PUT/PATCH/DELETE requests, and custom aliases. Run writes through an explicitly confirmed path, not `glab_exec`.
- Prefer the typed tools (`glab_issue_view`, `glab_issue_list`, `glab_search`, ...) when they cover your need — they return structured data.

## Querying with `--output json`

The GitLab CLI shapes output with `--output json` (NOT gh's `--json`/`--jq` — glab has no built-in field projection or jq). It emits the full JSON payload; select fields client-side yourself (the tool result is JSON you can read directly):

- Full JSON: `glab issue list --output json`
- Single resource: `glab mr view 5 --output json`

Because there is no projection grammar, narrow results with glab's **server-side filter flags** (they are the query surface), then read the JSON:

- Issues: `--assignee`, `--author`, `--label`, `--milestone`, `--state` (`opened`/`closed`/`all`), `--search`, `--per-page`, `--page` — e.g. `glab issue list --assignee @me --label bug --state opened --output json`
- MRs: `--reviewer`, `--assignee`, `--label`, `--milestone`, `--state`, `--source-branch`, `--target-branch` — e.g. `glab mr list --reviewer @me --state opened --output json`
- Pagination: `--per-page N` (default 30, max 100) plus `--page N`; there is no cursor.

Note the flag differences from the GitHub CLI: glab uses `--output json` where gh uses `--json <fields>`, and glab's `glab api` body flags are `-F`/`--field` (typed field) and `-f`/`--raw-field` (raw string field) — the opposite letters carry different typing semantics than you might expect, so both trigger a POST and are blocked here.

## Discovering flags

Use `glab_help` (e.g. `glab_help` with `command_path: "issue list"`) to discover a command's available flags and output options, then run the actual query through `glab_exec`.
