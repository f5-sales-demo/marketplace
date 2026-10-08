---
name: api-index
description: >-
  Intent router for F5 XC REST API operations. When the
  user's request involves the platform API but does not
  clearly match a specific skill trigger, this skill
  determines the correct skill to invoke. API operations
  optionally delegate to the api-operator subagent; configuration
  analysis may optionally use config-analyzer.
  Direct execution is the default.
user-invocable: false
---

**Canonical skill URI**: `skill://platform:api-index`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# API Index — Intent Router

Routes API-related requests to the correct skill and ensures
API operations execute directly. Optional delegation to `api-operator`
is available.

## Direct execution and optional delegation

Execute the requested task directly with available tools. For large payloads,
optional delegation is available:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:api-operator",
  description="<short task description>",
  prompt="<task details with env var references>"
)
```

The agent reads the skill reference files itself and executes
autonomously. Review results and continue independent authorized work.

## Routing Table

| User Intent                                                      | Target Skill                                    |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| "check token", "validate token"                                  | `api-auth`                                      |
| "list namespaces"                                                | `api-auth` (uses namespace list for validation) |
| "list", "get", "create", "update", "delete" + resource           | `api-operations`                                |
| "deploy", "set up", "provision" + resource                       | `api-operations` (workflow mode)                |
| "cURL", "API call" + custom request                              | Direct tools or optional `api-operator`         |
| User provides JSON config + asks question about it               | `config-analysis`                               |
| "analyze", "review", "audit", "explain", "inspect" + config/JSON | `config-analysis`                               |
| "is [feature] enabled/disabled", "what mode", "security posture" | `config-analysis`                               |
| "how to change/enable/disable/add/remove" + config context       | `config-analysis`                               |
| "what does this config do", "show me the settings"               | `config-analysis`                               |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. **Distinguish CRUD from analysis**: If the user's message
   contains a JSON configuration blob (or references one shared
   earlier) AND the intent is interrogative (asking about the
   config rather than requesting a platform operation), route to
   `config-analysis`. CRUD requests target the platform ("create
   this LB", "delete that pool"). Analysis requests target a
   provided config ("is WAF enabled on this?", "explain this
   config", "what violations are disabled?").
4. Execute directly or optionally delegate the matched task
5. Verify the result and respond

## Available Skills (read by the agent)

- **api-auth** — API token validation and certificate auth
- **api-operations** — Spec-aware CRUD for 95 resource types
  across 38 domains, with endpoint paths, payload templates,
  dependency ordering, and multi-step workflow compositions
- **config-analysis** — Configuration analysis and advisory Q&A.
  Analyzes customer JSON configurations against the same resource
  profiles as api-operations. Answers questions about security
  posture, feature enablement, mode settings, and best practices.

## Future Skills (not yet implemented)

- `api-bulk` — Batch operations across namespaces
- `api-export` — Export configuration as JSON/YAML
