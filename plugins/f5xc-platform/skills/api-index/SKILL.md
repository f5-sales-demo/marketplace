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

| User Intent | Target Skill | Agent Prompt |
| ----------- | ------------ | ------------ |
| "check token", "validate token" | `api-auth` | "Validate the F5 XC API token" |
| "list namespaces" | `api-auth` (validation) | "List all namespaces via API" |
| "list", "get" + resource type | Future api-operations | "List [resource type] in namespace [ns]" |
| "create" + resource type via API | Future api-operations | "Create [resource type] in namespace [ns]" |
| "delete" + resource type via API | Future api-operations | "Delete [resource type] in namespace [ns]" |
| "cURL", "API call" + custom | Direct delegation | Pass user's request to agent |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. Spawn the `api-operator` agent with the matched task
4. Relay the agent's result to the user

## Available Skills (read by the agent)

- **api-auth** — API token validation and certificate auth

## Future Skills (not yet implemented)

- `api-operations` — CRUD operations for platform resources
  (HTTP LBs, origin pools, app firewalls, sites)
- `api-bulk` — Batch operations across namespaces
- `api-export` — Export configuration as JSON/YAML
