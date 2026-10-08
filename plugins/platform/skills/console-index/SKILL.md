---
name: console-index
description: >-
  Intent router for F5 XC console automation. When the user's
  request involves the console but does not clearly match a
  specific skill trigger, this skill determines the correct
  skill to invoke. Execute console operations directly using observed browser capabilities;
  optionally delegate large tasks to console-operator.
user-invocable: false
---

**Canonical skill URI**: `skill://platform:console-index`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# Console Index — Intent Router

Routes ambiguous console-related requests to the correct
skill and ensures browser operations use observed capabilities. Optional delegation to
`console-operator` is available.

## Direct execution and optional delegation

Execute the requested task directly with available tools. For large payloads,
optional delegation is available:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:console-operator",
  description="<short task description>",
  prompt="<task details with env var references>"
)
```

The agent reads the skill reference files itself and executes
autonomously. Review results and continue independent authorized work.

## Routing Table

| User Intent                              | Target Skill          | Agent Prompt                                 |
| ---------------------------------------- | --------------------- | -------------------------------------------- |
| "log in", "authenticate", "sign in"      | `console-auth`        | "Authenticate to the F5 XC console"          |
| "navigate to", "go to", "open" + section | `console-navigator`   | "Navigate to [section] in the F5 XC console" |
| "where am I", "what page"                | `console-navigator`   | "Detect current page in the F5 XC console"   |
| "create", "add" + resource type          | Future workflow skill | —                                            |
| "show", "list" + resource type           | `console-navigator`   | "Navigate to [resource type] list"           |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. Execute the matched task directly; optionally use console-operator
4. Verify the result and respond
5. If DUO MFA is needed, relay the code and re-invoke

## Available Skills (read by the agent)

- **console-auth** — Multi-provider authentication (native
  F5 XC login and Azure SSO with DUO MFA)
- **console-navigator** — Navigate to console sections
  by name, detect current page

## Future Skills (not yet implemented)

- `create-http-lb` — Create HTTP Load Balancer
- `create-origin-pool` — Create Origin Pool
- `create-waf-policy` — Create WAF Policy
- `console-walkthrough` — Narrated console tour
