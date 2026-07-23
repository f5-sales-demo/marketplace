List GitLab issues with structured filters via glab CLI. Returns a markdown summary table.

<instruction>
Use for "show open bugs", "list issues assigned to X", "show high priority issues".
Supports: state (opened/closed/all), labels, assignee, search text, milestone, sort field, order direction, limit.
Defaults to the configured project. Pass project explicitly to override.

For ad-hoc reads beyond these filters, use `glab_exec` with `--output json` (glab's JSON flag — NOT gh's `--json`), or `glab api <path>` for GET-only raw API queries.
</instruction>
