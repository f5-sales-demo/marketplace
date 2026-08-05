# First-Class Native Git & GitHub CLI Mastery Guide

This guide provides deep operational knowledge for direct `git` and `gh` CLI commands when the **GitHub Marketplace Plugin** is installed in `xcsh`.

---

## 1. Modular Separation Architecture

- **Base `xcsh`**: Operates on any workstation regardless of whether `git` or `gh` are installed. Base `xcsh` does not force Git workflows on non-git workstations.
- **Marketplace Plugin Activated (`github` / `github-ops`)**: When installed on a workstation with `git` and `gh`, `xcsh` gains first-class, native-like operational mastery for executing `git` and `gh` CLI commands directly with full technical depth.

---

## 2. Direct Git CLI Operational Knowledge

When the plugin is active, `xcsh` possesses comprehensive native expertise for direct `git` CLI operations:

### Repository Status & Staging
- `git status --short --branch`: Concise, parseable working tree status.
- `git diff`: Unstaged changes in working tree.
- `git diff --cached`: Staged changes ready for commit.
- `git add <file1> <file2>`: Stage specific files only (never `git add -A` or `git add .`).

### Branching & Worktrees
- `git branch -a`: List all local and remote-tracking branches.
- `git checkout -b <prefix>/<issue>-<desc>`: Create feature branch from current HEAD.
- `git worktree add -b <branch> <path> origin/main`: Create isolated worktree for task isolation.
- `git worktree list`: Show all active worktrees across the repository.
- `git worktree remove <path> --force`: Clean up completed worktree.
- `git worktree prune`: Clear stale worktree administrative metadata.

### Commits & History
- `git commit -m "<type>: <description>\n\nCloses #<issue>"`: Conventional commit with mandatory issue linking.
- `git log --oneline -n 10`: Concise commit history inspection.
- `git show <commit-hash>`: View exact commit details and diff.
- `git reflog`: Recover lost commits or HEAD positions.

### Sync, Rebase, & Cleanup
- `git fetch --prune origin`: Update remote-tracking refs and prune deleted branches.
- `git pull --ff-only origin main`: Fast-forward main branch without merge commits.
- `git rebase -i origin/main`: Interactively rebase feature commits onto main.
- `git branch -d <branch>`: Safely delete merged local branch.
- `git push origin --delete <branch>`: Remove merged remote tracking branch.

---

## 3. Direct GitHub CLI (`gh`) Operational Knowledge

`xcsh` executes `gh` CLI commands with native structured JSON output (`--jq`) and error recovery:

### Issues
- `gh issue list --json number,title,state,labels`: List open repository issues.
- `gh issue view <number> --json title,body,state,comments`: Inspect issue context.
- `gh issue create --title "<title>" --body "<body>"`: Create comprehensive issue.
- `gh issue comment <number> --body "<body>"`: Post update or CI diagnostic comment.
- `gh issue close <number> --comment "<reason>"`: Close resolved issue.

### Pull Requests
- `gh pr list --json number,title,state,author,headRefName`: List PRs.
- `gh pr view <number> --json title,body,state,mergeable,reviews`: View PR details.
- `gh pr diff <number>`: View PR diff payload.
- `gh pr checkout <number>`: Switch local branch to PR branch.
- `gh pr create --title "<title>" --body "<body>"`: Open PR with `Closes #N`.
- `gh pr checks <number>`: Check CI status of PR.
- `gh pr merge <number> --squash --delete-branch`: Squash merge PR and delete remote branch.

### Workflows & Actions
- `gh run list --json databaseId,displayTitle,status,conclusion,headBranch`: List CI runs.
- `gh run view <run-id> --log-failed`: Fetch failed step logs for diagnosis.
- `gh run watch <run-id>`: Monitor workflow run until completion.
- `gh run rerun <run-id> --failed`: Retry failed jobs (infrastructure recovery).

### Authentication & Repository Info
- `gh auth status`: Verify active user authentication and token scopes.
- `gh repo view --json nameWithOwner,description,url`: Inspect repository metadata.
- `gh repo sync`: Fast-forward fork or local repository from upstream.
- `gh api <endpoint> --jq '<filter>'`: Direct GitHub REST/GraphQL API queries.

---

## 4. Environment Detection & Fallbacks

Before running `git` or `gh` commands, the plugin checks CLI availability:
1. `command -v git >/dev/null 2>&1`: Confirms Git CLI is available.
2. `command -v gh >/dev/null 2>&1`: Confirms GitHub CLI is available.
3. `gh auth status`: Confirms active GitHub authentication.

If tools are absent on a workstation, the plugin reports clear diagnostics and step-by-step installation instructions without interrupting non-Git workflows.
