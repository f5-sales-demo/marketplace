---
description: Authenticate to the F5 Distributed Cloud console
argument-hint: "[tenant-url]"
---

Delegate authentication to the `console-operator` subagent.
Do NOT run browser MCP tools in the main session — browser
snapshots are token-heavy and must stay in the subagent.

## Delegation

Spawn the console-operator agent with:

```
Agent(
  subagent_type="f5xc-platform:console-operator",
  description="Authenticate to F5 XC console",
  prompt="Authenticate to the F5 Distributed Cloud console.\n\n
    Tenant URL: ${F5XC_API_URL} (or $ARGUMENTS if provided)\n
    Username: ${F5XC_USERNAME}\n
    Password: read from F5XC_CONSOLE_PASSWORD env var\n\n
    Read the auth skill and reference files first, then
    execute the authentication flow. Auto-detect the login
    type (native or Azure SSO) from the page content.\n\n
    If DUO MFA is required, report the 3-digit verification
    code in your response with NEEDS_USER_INPUT status."
)
```

## Handling DUO MFA

If the agent returns `NEEDS_USER_INPUT` with a DUO code:

1. Display the code prominently to the user
2. Wait for the user to confirm they approved on their phone
3. Re-invoke the agent to continue the flow (or the agent
   may have already waited and completed)

## After Authentication

Report the agent's result to the user. If successful, the
browser is now authenticated and ready for navigation or
workflow operations.
