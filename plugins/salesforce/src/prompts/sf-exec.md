Run any read-only `sf` (Salesforce CLI) command. Pass arguments as an array without the `sf` prefix, e.g. `["org", "list", "--json"]`.

## Safety

- Arguments are passed argv-style to `sf` with no shell, so shell metacharacters are inert. Control characters are rejected.
- Read-only by an allowlist (fail-safe: anything unrecognized is blocked). A command is allowed only when its normalized command path starts with a known read prefix:
  - `data query`, `data search`, `data export`, `data resume`
  - `org list`, `org display`
  - `apex list`, `apex get`, `apex tail`
  - `sobject describe`, `sobject list`, `schema sobject list`, `schema sobject describe`
  - `limits api display`
  - the single top-level commands `version`, `help`, `commands`, `which`, `info`
- `sf api request rest|graphql` is allowed only when it resolves to a GET: no `-X`/`--method` naming a mutating method, and no `--body`/`--file` (a body payload can carry a mutating method the guard cannot inspect). Use it for GET reads only.
- Everything else is blocked: `apex run`, `data create`/`update`/`delete`/`import`/`upsert`, `project deploy`/`delete`, `org create`/`delete`/`login`/`logout`, `config set`, `alias set`, and all package/agent writes. Run writes through an explicitly confirmed path, not `sf_exec`.
- Prefer the typed tools (`sf_query`, `sf_org_display`, `sf_help`, ...) when they cover your need — they return structured data.

## Command grammar (colon or space)

Salesforce accepts both the `topic command` (space) and `topic:command` (colon) forms — `org list` and `org:list` are the same command. The guard normalizes the colon form to the space form before the allowlist check, so `org:create` is blocked exactly like `org create`. Pass either form as separate array elements (`["org", "list"]`) or as a single colon token (`["org:list"]`).

## Querying with `--json` and `--result-format`

The Salesforce CLI shapes output with the global `--json` flag (full structured JSON
payload) or, on commands that support it, `--result-format` (e.g. `csv`, `human`,
`json`). This is NOT the GitHub CLI's `--json <fields>`/`--jq` projection, and NOT the
GitLab CLI's `--output json` — `sf` has no built-in field selection or jq projection,
so it emits the full payload and you post-process fields yourself:

- Full JSON: `sf org list --json`
- SOQL as JSON: `sf data query --query "SELECT Id FROM Account" --json`
- CSV export shape: `sf data query --query "SELECT Id FROM Account" --result-format csv`

## Discovering flags

Use `sf_help` (e.g. `command_path: "data query"` or `"org:list"`) to discover a command's available flags and output options, then run the actual query through `sf_exec`.
