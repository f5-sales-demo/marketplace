---
description: Inspect GitHub authentication and the current repository lifecycle state
---

# GitHub operations status

Use `github_workflow` with `action: "status"` when a pull request is known. For authentication or
rate-limit details not covered by the typed status result, use `gh_exec` with argv arrays such as
`["auth", "status"]` or `["api", "rate_limit", "--jq", ".rate"]`.

Return repository identity, branch or pull request identity, base and head SHAs, check state, retry
timing, performed operations, and all advisories. Do not begin preparation, publication, repair, or
cleanup unless the user requested that stage.
