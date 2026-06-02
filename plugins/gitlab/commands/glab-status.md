---
description: >-
  Check GitLab CLI authentication status and connectivity
---

Delegate to the cli-operator agent to check GitLab connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify glab CLI is installed: `glab --version`
2. Check authentication: `glab auth status`
3. If inside a git repository, run:
   `glab repo view --output json`
4. Report:
   - glab CLI version
   - Authentication status (hostname, user, token type)
   - Git protocol configured
   - Current project (if in a git repo with GitLab remote)
   - Project URL and default branch
5. If not authenticated, suggest using `/gitlab:glab-login`
