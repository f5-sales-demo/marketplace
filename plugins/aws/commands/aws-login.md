---
description: >-
  Authenticate to AWS using container-adapted auth methods
  (env vars, SSO, or interactive configure)
argument-hint: "[profile-name]"
---

Delegate to the cli-operator agent to handle AWS authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Run `aws sts get-caller-identity --output json` to check if
   already authenticated.
2. If already authenticated, report the current identity (Account,
   ARN, UserId) and stop.
3. The user-provided profile is `$ARGUMENTS` (use default if empty).
4. Check credentials in order -- use the first fully satisfied option:
   - `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` both set ->
     already authenticated via env vars, validate with
     `aws sts get-caller-identity --output json`
   - `AWS_PROFILE` set (or `$ARGUMENTS` provided) ->
     `aws sso login --profile "${ARGUMENTS:-$AWS_PROFILE}"`
   - Neither satisfied -> suggest `aws configure`
5. Do NOT choose an option unless all required env vars are present.
6. After auth, run `aws sts get-caller-identity --output json` to
   confirm.
7. Never echo access keys or session tokens in output.

## After Authentication

Report the result:

- **Connected:** Show Account ID, ARN, region, and profile name
- **Failed:** Show the error and suggest checking credentials
- **No credentials:** Explain how to set up environment variables
