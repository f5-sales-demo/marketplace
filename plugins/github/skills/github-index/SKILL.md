---
name: github-index
description: >-
  Top-level intent router for GitHub operations. Routes auth requests
  to github-auth, repo/PR/issue operations to the cli-operator agent,
  and CI/CD watching to existing gh tools. Use when the user mentions
  GitHub, gh CLI, repos, PRs, issues, actions, or any GitHub topic
  but the request does not clearly match a specific skill trigger.
user-invocable: false
---

# GitHub Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication

Keywords: "login", "authenticate", "gh auth", "GitHub login",
"token", "connect GitHub"

- Auth setup -> invoke `github:github-auth` skill
- Auth status check -> delegate to `github:cli-operator` agent:

  ```text
  Agent(
    subagent_type="github:cli-operator",
    description="Check GitHub auth status",
    prompt="Run gh auth status and report the authenticated user, active account, and token scopes."
  )
  ```

### Repository and PR Operations

Keywords: "repo", "repository", "pull request", "PR", "issue",
"merge", "review", "diff", "checkout", "branch"

Delegate to the cli-operator agent:

```text
Agent(
  subagent_type="github:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific gh CLI commands to execute and what to report>"
)
```

Common patterns:

| Topic              | Example delegation prompt                                                              |
| ------------------ | -------------------------------------------------------------------------------------- |
| View repo info     | `Run gh repo view --json nameWithOwner,description,url and report the details.`        |
| List PRs           | `Run gh pr list --json number,title,state,author and format as a table.`               |
| View a PR          | `Run gh pr view <number> --json title,body,state,reviews and summarize.`               |
| PR diff            | `Run gh pr diff <number> and summarize the changes.`                                   |
| Checkout PR        | `Run gh pr checkout <number> and confirm the branch switch.`                           |
| List issues        | `Run gh issue list --json number,title,state,labels and format as a table.`            |
| View an issue      | `Run gh issue view <number> --json title,body,state,comments and summarize.`           |
| Search             | `Run gh search repos <query> --json fullName,description,stars and report top results.`|

### CI/CD and Actions

Keywords: "actions", "workflow", "run", "CI", "CD", "build",
"pipeline", "checks"

- Watching a run -> delegate to cli-operator agent or use the
  existing `gh_run_watch` tool if available
- Listing workflows -> delegate to cli-operator agent:

  ```text
  Agent(
    subagent_type="github:cli-operator",
    description="List GitHub Actions workflow runs",
    prompt="Run gh run list --json databaseId,displayTitle,status,conclusion,headBranch --limit 10 and format as a table."
  )
  ```

### Generic gh Commands

For any gh CLI command not covered above, delegate to the
cli-operator agent with the specific command:

```text
Agent(
  subagent_type="github:cli-operator",
  description="Execute gh CLI command",
  prompt="Run: <the user's requested gh command>. Report the output."
)
```

## Important Notes

- The GitHub plugin provides native MCP tools for common operations
  (gh_repo_view, gh_pr_view, gh_issue_view, etc.) that activate
  automatically
- This router handles cases that fall outside the native tools
- Always check authentication before performing operations
