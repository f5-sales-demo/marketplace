View a single GitLab issue with full details, description, and comments via glab CLI.

<instruction>
Use when the user asks to "show issue #N" or "view details of issue X".
Returns structured markdown with title, state, author, labels, assignee, milestone, description, and comments thread.
System notes (automated messages) are filtered out.

For other resource types (merge requests, pipelines, ...), use `glab_exec` with `--output json` (glab's JSON flag — NOT gh's `--json`), or `glab api <path>` for GET-only raw API queries.
</instruction>
