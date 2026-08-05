---
name: github-index
description: >-
  Top-level intent router and operational mastery guide for Git and GitHub CLI.
  Provides direct native-like mastery of git and gh commands when the GitHub plugin
  is installed from the marketplace on workstations equipped with git and gh CLI tools.
  Routes auth requests to github-auth, repo/PR/issue operations to the cli-operator agent,
  and CI/CD watching to gh tools. Use when the user mentions GitHub, gh CLI, git CLI,
  repos, PRs, issues, actions, or any Git/GitHub topic.
user-invocable: false
---

# GitHub & Git Intent Router & Operational Mastery

When installed from the marketplace on a workstation with `git` and `gh` tools available, this plugin equips `xcsh` with first-class, native-like operational mastery for direct `git` and `gh` CLI execution.

For detailed operational guidance, read `references/git-gh-cli-mastery.md`.

## Routing Rules

### Authentication

Keywords: "login", "authenticate", "gh auth", "GitHub login", "token", "connect GitHub"

- Auth setup -> invoke `github:github-auth` skill
- Auth status check -> delegate to `github:cli-operator` agent:

  ```text
  Agent(
    subagent_type="github:cli-operator",
    description="Check GitHub auth status",
    prompt="Run gh auth status and report the authenticated user, active account, and token scopes."
  )
  ```

### Direct Git Operations

Keywords: "git status", "git diff", "git log", "git branch", "git worktree", "git rebase", "git checkout", "git commit", "git stash", "git fetch", "git pull"

When `git` is available, execute direct native Git CLI operations through the operator agent or main session:
- Status & Staging: `git status --short --branch`, `git diff --cached`, `git add <files>`
- Branching & Worktrees: `git branch -a`, `git checkout -b <name>`, `git worktree add <path> <branch>`, `git worktree remove <path>`
- Sync & Hygiene: `git fetch --prune origin`, `git pull --ff-only origin main`, `git branch -d <name>`

### Repository and PR Operations (`gh`)

Keywords: "repo", "repository", "pull request", "PR", "issue", "merge", "review", "diff", "checkout", "branch"

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

Keywords: "actions", "workflow", "run", "CI", "CD", "build", "pipeline", "checks"

- Watching a run -> delegate to cli-operator agent or use the `gh_run_watch` tool if available
- Listing workflows -> delegate to cli-operator agent:

  ```text
  Agent(
    subagent_type="github:cli-operator",
    description="List GitHub Actions workflow runs",
    prompt="Run gh run list --json databaseId,displayTitle,status,conclusion,headBranch --limit 10 and format as a table."
  )
  ```

### Generic gh Commands

For any gh CLI command not covered above, delegate to the cli-operator agent with the specific command:

```text
Agent(
  subagent_type="github:cli-operator",
  description="Execute gh CLI command",
  prompt="Run: <the user's requested gh command>. Report the output."
)
```

## Important Notes

- **Modular Separation**: Base `xcsh` core does not require or assume `git`/`gh` tools on non-git workstations.
- Installing this marketplace plugin injects full operational knowledge for `git` and `gh` CLI commands when tools are present.
- The GitHub plugin provides native MCP tools for common operations (`gh_repo_view`, `gh_pr_view`, `gh_issue_view`, etc.) that activate automatically.
