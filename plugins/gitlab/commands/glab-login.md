---
description: >-
  Authenticate to GitLab using container-adapted auth methods
  (token env var or browser login)
argument-hint: "[hostname]"
---

Delegate to the cli-operator agent to handle GitLab authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. The user-provided hostname is `$ARGUMENTS` (use `${GITLAB_HOST:-gitlab.com}` if empty).
2. Run `glab auth status` to check existing authentication.
3. If already authenticated, report the current user and hostname
   and ask if the user wants to re-authenticate.
4. For new authentication, check credentials in order — use the first
   fully satisfied option:
   - `GITLAB_TOKEN` set ->
     `echo "$GITLAB_TOKEN" | glab auth login --stdin --hostname <host>`
   - `CI_JOB_TOKEN` set ->
     `echo "$CI_JOB_TOKEN" | glab auth login --stdin --hostname <host>`
   - `GITLAB_PAT` set ->
     `echo "$GITLAB_PAT" | glab auth login --stdin --hostname <host>`
   - None fully satisfied -> suggest `glab auth login --hostname <host> --web`
5. Do NOT choose an option unless the required env var is present.
6. After auth, run `glab auth status` to confirm.
7. Suppress update nag: `glab config set check_update false`
8. Never echo tokens in output.

## After Authentication

Report the result:

- **Connected:** Show hostname, username, token type, and git protocol
- **Failed:** Show the error and suggest checking token/credentials
- **No credentials:** Explain how to set up `GITLAB_TOKEN` environment variable
