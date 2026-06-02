---
description: >-
  Authenticate to Azure using container-adapted auth methods
  (managed identity, service principal, device code, or browser login)
argument-hint: "[subscription-name-or-id]"
---

Delegate to the cli-operator agent to handle Azure authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. The user-provided subscription is `$ARGUMENTS` (skip subscription
   selection if empty).
2. Run `az account list --output json` to check existing sessions.
3. If sessions exist, report them and ask if the user wants to reuse one.
4. For a new session, check credentials in order — use the first fully
   satisfied option:
   - `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` + `AZURE_TENANT_ID`
     all set -> `az login --service-principal`
   - None fully satisfied -> `az login --use-device-code`
5. Do NOT choose an option unless all required env vars are present.
6. If `$ARGUMENTS` is set or `AZURE_SUBSCRIPTION_ID` is set, run
   `az account set --subscription <value>` after login.
7. After auth, run `az account show --output json` to confirm.
8. Never echo client secrets or tokens in output.

## After Authentication

Report the result:

- **Connected:** Show subscription name, subscription ID, tenant ID,
  and user/service principal name
- **Failed:** Show the error and suggest checking credentials
- **No credentials:** Explain how to set up environment variables
