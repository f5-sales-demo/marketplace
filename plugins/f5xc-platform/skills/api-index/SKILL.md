---
name: api-index
description: >-
  Intent router for F5 XC REST API operations. When the
  user's request involves the platform API but does not
  clearly match a specific skill trigger, this skill
  determines the correct skill to invoke. All API operations
  MUST be delegated to the api-operator subagent to keep
  large JSON payloads out of the main session.
user-invocable: false
---

# API Index — Intent Router

Routes API-related requests to the correct skill and ensures
all API operations are delegated to the `api-operator`
subagent.

## Critical: Subagent Delegation

**Never run large curl/API sequences in the main session.**
API JSON responses can be verbose. All API operations must
be delegated to the `api-operator` agent:

```
Agent(
  subagent_type="f5xc-platform:api-operator",
  description="<short task description>",
  prompt="<task details with env var references>"
)
```

The agent reads the skill reference files itself and executes
autonomously. The main session only receives the result.

## Routing Table

| User Intent | Target Skill |
| ----------- | ------------ |
| "check token", "validate token" | `api-auth` |
| "list namespaces" | `api-auth` (uses namespace list for validation) |
| "list", "get", "create", "update", "delete" + resource | `api-operations` |
| "deploy", "set up", "provision" + resource | `api-operations` (workflow mode) |
| "cURL", "API call" + custom request | Direct delegation to `api-operator` |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. Spawn the `api-operator` agent with the matched task
4. Relay the agent's result to the user

## Available Skills (read by the agent)

- **api-auth** — API token validation and certificate auth
- **api-operations** — Spec-aware CRUD for 98 resource types
  across 38 domains, with endpoint paths, payload templates,
  dependency ordering, and multi-step workflow compositions

## Future Skills (not yet implemented)

- `api-bulk` — Batch operations across namespaces
- `api-export` — Export configuration as JSON/YAML
