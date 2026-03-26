---
name: console-index
description: >-
  Intent router for F5 XC console automation. When the user's
  request involves the console but does not clearly match a
  specific skill trigger, this skill determines the correct
  skill to invoke. Routes to console-auth for authentication,
  console-navigator for navigation, or future workflow skills.
user-invocable: false
---

# Console Index — Intent Router

Routes ambiguous console-related requests to the correct
skill.

## Routing Table

| User Intent | Target Skill |
| ------------- | -------------- |
| "log in", "authenticate", "sign in" | `console-auth` |
| "navigate to", "go to", "open" + section | `console-navigator` |
| "where am I", "what page" | `console-navigator` (state detection) |
| "create", "add" + resource type | Future workflow skill |
| "show", "list" + resource type | `console-navigator` + future list skill |
| "configure", "edit" + resource | Future workflow skill |

## How to Route

1. Parse the user's request for intent keywords
2. Match against the routing table
3. Invoke the matched skill
4. If no match, ask the user to clarify what they'd like
   to do in the console

## Available Skills

- **console-auth** — Azure SSO authentication (cached
  session and full MFA)
- **console-navigator** — Navigate to console sections
  by name, detect current page

## Future Skills (not yet implemented)

- `create-http-lb` — Create HTTP Load Balancer
- `create-origin-pool` — Create Origin Pool
- `create-waf-policy` — Create WAF Policy
- `console-walkthrough` — Narrated console tour
