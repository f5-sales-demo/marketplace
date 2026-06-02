---
description: >-
  Check GitHub CLI authentication status and connectivity
---

Delegate to the cli-operator agent to check GitHub connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify gh CLI is installed: `gh --version`
2. Check authentication: `gh auth status`
3. If in a git repository, get repo info:
   `gh repo view --json nameWithOwner,defaultBranchRef,url`
4. Report:
   - gh CLI version
   - Authentication status (user, hostname, token type)
   - Active token scopes
   - Current repo name, default branch, and URL (if in a git repo)
5. If not authenticated, suggest using `/github:gh-login`
6. If gh CLI is not installed, suggest using `/github:setup`
