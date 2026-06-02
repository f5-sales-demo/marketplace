---
description: >-
  Check GitHub CLI authentication, rate limits, and repository state
---

Delegate to the github-ops agent to check GitHub operations readiness.

## Delegation

Spawn the github-ops agent with the following instructions:

1. Verify gh CLI is installed: `gh --version`
2. Check authentication: `gh auth status`
3. Check rate limits: `gh api rate_limit --jq '.rate | "remaining: \(.remaining)/\(.limit), resets: \(.reset | todate)"'`
4. If in a git repository, get repo info: `gh repo view --json nameWithOwner,defaultBranchRef,url`
5. Check current branch and worktree state: `git branch --show-current` and `git status --short | head -5`
6. Report:
   - gh CLI version
   - Authentication status (user, hostname, token type)
   - Rate limit remaining/total and reset time
   - Current repo name and default branch (if in a git repo)
   - Current branch and uncommitted changes count
7. If not authenticated, suggest using `/github:gh-login`
8. If gh CLI is not installed, suggest using `/github:setup`
