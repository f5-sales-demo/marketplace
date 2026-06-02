---
name: gitlab-index
description: >-
  Top-level intent router for GitLab operations. Routes auth requests
  to gitlab-auth, project/MR/issue operations to the cli-operator
  agent, and pipeline queries to the cli-operator. Use when the user
  mentions GitLab, glab CLI, merge requests, MRs, pipelines, or any
  GitLab topic but the request does not clearly match a specific
  skill trigger.
user-invocable: false
---

# GitLab Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication and Access

Keywords: "login", "authenticate", "glab auth", "gitlab token",
"connect to gitlab", "auth status"

- Auth setup -> invoke `gitlab:gitlab-auth` skill
- Auth status check -> delegate to `gitlab:cli-operator` agent:

  ```text
  Agent(
    subagent_type="gitlab:cli-operator",
    description="Check GitLab auth status",
    prompt="Run glab auth status and report the logged-in user, hostname, and token type."
  )
  ```

### Project and Repository Operations

Keywords: "project", "repo", "repository", "fork", "clone",
"glab repo"

Delegate to the cli-operator agent:

```text
Agent(
  subagent_type="gitlab:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific glab CLI commands to execute and what to report>"
)
```

### Merge Request Operations

Keywords: "merge request", "MR", "glab mr", "diff", "review",
"approve", "merge"

Delegate to the cli-operator agent:

```text
Agent(
  subagent_type="gitlab:cli-operator",
  description="<brief description of the MR operation>",
  prompt="<specific glab mr commands to execute and what to report>"
)
```

### Issue Operations

Keywords: "issue", "glab issue", "bug", "task", "incident"

Delegate to the cli-operator agent:

```text
Agent(
  subagent_type="gitlab:cli-operator",
  description="<brief description of the issue operation>",
  prompt="<specific glab issue commands to execute and what to report>"
)
```

### Pipeline Operations

Keywords: "pipeline", "CI", "CD", "CI/CD", "build", "job",
"glab pipeline", "glab ci"

Delegate to the cli-operator agent:

```text
Agent(
  subagent_type="gitlab:cli-operator",
  description="<brief description of the pipeline query>",
  prompt="<specific glab pipeline/ci commands to execute and what to report>"
)
```

### Generic glab CLI Commands

For any other glab CLI operations (search, labels, milestones,
snippets, releases), delegate to the cli-operator agent:

```text
Agent(
  subagent_type="gitlab:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific glab commands to execute and what to report>"
)
```

## Important Notes

- The glab CLI must be installed and authenticated before operations
- Always check authentication status before project operations
- The cli-operator agent handles all glab CLI execution — never run
  glab commands in the main session
- Use `--output json` where available for structured output
