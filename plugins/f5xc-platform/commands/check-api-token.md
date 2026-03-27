---
description: Validate your F5 XC API token
argument-hint: "[api-url]"
---

Delegate token validation to the `api-operator` subagent.
Do NOT run large API sequences in the main session — API
JSON payloads can be verbose and must stay in the subagent.

## Delegation

Spawn the api-operator agent with:

```
Agent(
  subagent_type="f5xc-platform:api-operator",
  description="Validate F5 XC API token",
  prompt="Validate the F5 XC API token.\n\n
    Tenant URL: ${F5XC_API_URL} (or $ARGUMENTS if provided)\n
    API Token: read from F5XC_API_TOKEN env var\n\n
    Read the api-auth skill and reference files first, then
    execute the token validation procedure.\n\n
    Report: token validity, accessible namespaces, and any
    permission issues."
)
```

## After Validation

Report the agent's result to the user:

- **Valid token**: show accessible namespaces and confirm
  the token is working
- **Invalid/expired token**: explain how to generate a new
  one (System → Tenant Management → API Credentials)
- **Missing env var**: tell the user to set `F5XC_API_TOKEN`
