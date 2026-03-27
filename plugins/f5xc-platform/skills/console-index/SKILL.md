---
name: console-index
description: >-
  Intent router for F5 XC console automation. When the user's
  request involves the console but does not clearly match a
  specific skill trigger, this skill determines the correct
  skill to invoke. All console operations MUST be delegated to
  the console-operator subagent to keep browser automation
  tokens out of the main session.
user-invocable: false
---

# Console Index — Intent Router

Routes ambiguous console-related requests to the correct
skill and ensures all browser operations are delegated to
the `console-operator` subagent.

## Critical: Subagent Delegation

**Never run Chrome DevTools MCP tools in the main session.**
Browser snapshots are token-heavy. All console operations
must be delegated to the `console-operator` agent:

```
Agent(
  subagent_type="f5xc-platform:console-operator",
  description="<short task description>",
  prompt="<task details with env var references>"
)
```

The agent reads the skill reference files itself and executes
autonomously. The main session only receives the result.

## Routing Table

| User Intent | Target Skill | Agent Prompt |
| ------------- | -------------- | -------------- |
| "log in", "authenticate", "sign in" | `console-auth` | "Authenticate to the F5 XC console" |
| "navigate to", "go to", "open" + section | `console-navigator` | "Navigate to [section] in the F5 XC console" |
| "where am I", "what page" | `console-navigator` | "Detect current page in the F5 XC console" |
| "create", "add" + resource type | Future workflow skill | — |
| "show", "list" + resource type | `console-navigator` | "Navigate to [resource type] list" |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. Spawn the `console-operator` agent with the matched task
4. Relay the agent's result to the user
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
