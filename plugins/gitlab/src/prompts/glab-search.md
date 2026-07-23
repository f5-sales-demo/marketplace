Full-text search across GitLab issue titles, descriptions, labels, and comments via glab CLI.

<instruction>
Use for "find issues about Tempus", "search for login timeout bugs", "bugs mentioning Safari".
Three-tier search: REST API (fast, titles+descriptions), GraphQL (includes comments), client-side dedup.
Supports state filtering and label filtering alongside text search.

For structured field queries or other resource types, use `glab_exec` with `--output json` (glab's JSON flag — NOT gh's `--json`), or `glab api <path>` for GET-only raw API queries.
</instruction>
