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

## Agents

### workflow-ops

Autonomous Git operations agent that any plugin can
spawn to handle the full Git lifecycle: issue creation,
branch naming, commits, PR creation, CI polling,
post-merge monitoring, and branch cleanup.

**Spawned by:** Other skills/agents that need to land
changes following organization governance. The agent
executes Git operations for changes that have already
been decided — it does not decide what to change.

**Delegation pattern:**

```
# From any skill or agent, spawn workflow-ops with:
Agent(
  subagent_type="f5xc-repo-governance:workflow-ops",
  prompt="<type>: <description>\n\nChanges:\n- <file>: <what to change>\n\nWhy: <motivation>"
)
```

## Installation

```bash
claude /install f5xc-repo-governance@f5xc-salesdemos-marketplace
```
