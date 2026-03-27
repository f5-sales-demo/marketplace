---
name: platform-index
description: >-
  Top-level intent router for F5 XC platform automation.
  Routes requests to either console-index (web UI operations)
  or api-index (REST API operations) based on user intent.
  Use when the user's request involves the F5 XC platform
  but does not clearly indicate console or API preference.
user-invocable: false
---

# Platform Index — Top-Level Router

Routes platform management requests to the correct domain:
**console** (web UI via browser) or **API** (REST via cURL).

## Routing Logic

### Route to Console (→ `console-index`)

Keywords: "browser", "navigate", "click", "console", "UI",
"login", "sign in", "web interface", "page", "screen",
"walkthrough", "show me"

Invoke the `console-index` skill which handles all browser-
based operations via the `console-operator` agent.

### Route to API (→ `api-index`)

Keywords: "API", "cURL", "REST", "token", "programmatic",
"JSON", "endpoint", "list via API", "get via API",
"create via API", "check token", "validate token"

Invoke the `api-index` skill which handles all REST API
operations via the `api-operator` agent.

### Ambiguous Requests

When the user says "list load balancers" or "show namespaces"
without specifying console or API:

1. If a browser session is already active (user recently
   logged in via console), default to **console**
2. If no browser session exists but `F5XC_API_TOKEN` is set,
   default to **API**
3. If unclear, ask the user: "Would you like me to use the
   web console or the REST API?"

## Domain Skills

### Console Domain
- **console-index** — Routes console UI requests
- **console-auth** — Browser authentication (Azure SSO, DUO)
- **console-navigator** — Navigate console sections by name
- Agent: `f5xc-platform:console-operator`

### API Domain
- **api-index** — Routes API requests
- **api-auth** — API token and certificate authentication
- Agent: `f5xc-platform:api-operator`

## Shared Context

Both domains share these environment variables:
- `F5XC_API_URL` — Tenant base URL
- `F5XC_NAMESPACE` — Default namespace
- `F5XC_USERNAME` — User email (console auth)
