---
description: >-
  Authenticate to GitHub using container-adapted auth methods
  (token env var or browser login)
argument-hint: "[hostname]"
---

Delegate to the cli-operator agent to handle GitHub authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Run `gh auth status` to check existing authentication.
2. If already authenticated, report the user, account, and token type.
   Ask the user if they want to re-authenticate.
3. For a new login, check credentials in order -- use the first fully
   satisfied option:
   - `GH_TOKEN` env var is set ->
     run `gh auth status` (gh CLI reads it automatically)
   - `GITHUB_TOKEN` env var is set ->
     report that the user should export it as `GH_TOKEN` instead,
     or run `echo "$GITHUB_TOKEN" | gh auth login --with-token`
   - Neither set -> suggest `gh auth login` (interactive browser)
     or `gh auth login --with-token` (paste token via stdin)
4. If `$ARGUMENTS` is provided, use it as the hostname:
   `gh auth login --hostname $ARGUMENTS`
5. Do NOT choose an option unless the required env var is present.
6. After auth, run `gh auth status` to confirm.
7. Never echo tokens in output.

## After Authentication

Report the result:

- **Connected:** Show authenticated user, hostname, token type, and active scopes
- **Failed:** Show the error and suggest checking credentials or token scopes
- **No credentials:** Explain how to set up `GH_TOKEN` environment variable
