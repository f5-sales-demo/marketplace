# gh_exec

Run any read-only `gh` (GitHub CLI) command. Pass arguments as an array without the `gh` prefix, e.g. `["pr", "list", "--json", "number,title"]`.

## Safety

- Arguments are passed argv-style to `gh` with no shell — shell metacharacters are inert.
- Read-only by an allowlist (fail-safe: anything unrecognized is blocked). A command is allowed only when its leaf verb is a known read (`list`, `view`, `diff`, `checks`, `status`, `download`, `watch`, ...), plus the top-level `gh search` and `gh status`.
- `gh api` is allowed only when it resolves to a GET: no `-X`/`--method` naming a mutating method, and no body flag (`-f`/`-F`/`--field`/`--raw-field`/`--input`), since any of those makes gh send a POST. `gh api graphql` with a body (queries or mutations) is therefore blocked — use `gh_exec` `api` only for GET reads.
- Everything else is blocked: write verbs (`create`, `merge`, `delete`, `run`, `install`, `publish`, ...), `gh api` POST/PUT/PATCH/DELETE requests, and custom aliases. Run writes through an explicitly confirmed path, not `gh_exec`.
- Prefer the typed tools (`gh_repo_view`, `gh_pr_view`, `gh_issue_view`, `gh_search_prs`, ...) when they cover your need — they return structured data.

## Querying with `--json` / `--jq`

The GitHub CLI shapes output with `--json <fields>` (a comma-separated field list, per subcommand) and an optional `--jq '<expr>'` (jq syntax — NOT JMESPath):

- Field projection: `gh pr list --json number,title,author`
- Filter with jq: `gh pr list --json number,state --jq '.[] | select(.state=="OPEN") | .number'`
- Single value: `gh repo view --json nameWithOwner --jq .nameWithOwner`

Use `gh_help` (e.g. `gh_help` with `command_path: "pr list"`) to discover a command's available `--json` fields.
