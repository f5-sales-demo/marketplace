# f5xc-repo-governance

Repository governance workflow plugin for
`f5xc-salesdemos` — enforces the full task lifecycle
from issue creation through post-merge verification.

## Skills

### workflow-lifecycle

Full repository workflow: issue creation, branch naming,
PR lifecycle, CI polling, post-merge monitoring,
verification, and task completion criteria.

**Activates when:** Starting a new task, creating PRs,
merging, monitoring CI, verifying outcomes, or
encountering GitHub API rate limit issues.

**Reference files:**

- `polling-protocol.md` — Single-shot polling patterns
  for PR checks and workflow runs
- `rate-limit-management.md` — Consumption zones,
  banned commands, budget estimates, 403 recovery
- `task-completion-checklist.md` — Done criteria
  checklist

## Installation

```bash
claude /install f5xc-repo-governance@f5xc-salesdemos-marketplace
```
