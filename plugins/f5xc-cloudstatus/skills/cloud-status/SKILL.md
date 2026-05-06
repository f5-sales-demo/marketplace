---
name: cloud-status
description: >-
  Cloud service status monitoring and operational intelligence via Atlassian
  Statuspage.io API. Activates when the user asks about cloud status, service
  health, F5 status, active incidents, outages, degraded services, maintenance
  windows, component status, operational status, or requests a status briefing.
  Also activates for: "is [service] up", "any outages", "what's down",
  "status report for stakeholders", "executive status summary". Delegates
  all API calls to the status-operator agent — never runs curl in the main
  session.
user-invocable: false
compatibility: Requires curl, jq, and network access to the Statuspage.io API
---

# Cloud Status Skill

Cloud service status monitoring and operational intelligence by querying
a Statuspage.io-powered status page via its public API v2.

**Default target:** F5 Distributed Cloud at `https://www.f5cloudstatus.com`
**Generic:** Set `STATUSPAGE_URL` env var to use any Statuspage.io page.

## Intent Routing

Map the user's request to an operation type, then delegate to the
`status-operator` agent.

| User Intent | Operation | Notes |
| ---------------------------------------------------- | --------------------- | ------------------------------------------ |
| "What's the overall status?" / "Is everything OK?" | `overall-status` | Quick indicator check |
| "Show me all components" / "What services exist?" | `list-components` | Full component list with groups |
| "Is [service] healthy?" / "Status of [component]" | `check-component` | Provide the service name or ID as filter |
| "Any active incidents?" / "Current outages?" | `active-incidents` | Unresolved only + trend analysis |
| "Show recent incidents" / "Incident history" | `recent-incidents` | Pass filters: days, status, impact |
| "Scheduled maintenance?" / "Maintenance windows?" | `maintenance` | upcoming, active, or all |
| "Full status briefing" / "What's going on?" | `full-briefing` | Complete operational intelligence |
| "Search for [query]" | `search` | Text search across all entities |
| "Stakeholder report" / "Executive summary" | `stakeholder-report` | Full briefing + stakeholder template |

### Command Argument Mapping

When invoked via `/cloud-status [arg]`:

| Argument | Operation |
| ------------------ | ---------------------------- |
| (none) | `full-briefing` |
| `status` | `overall-status` |
| `incidents` | `active-incidents` |
| `maintenance` | `maintenance` |
| `briefing` | `full-briefing` |
| `search <query>` | `search` with the query text |
| `components` | `list-components` |

## Delegation

For every operation, delegate to the `status-operator` agent:

```
Agent(
  subagent_type="f5xc-cloudstatus:status-operator",
  description="<operation> cloud status",
  prompt="Read these reference files first (relative to your plugin root):
  1. skills/cloud-status/references/statuspage-api.md
  2. skills/cloud-status/references/f5xc-context.md
  3. skills/cloud-status/references/analysis-playbook.md

  Operation: <operation-type>
  User request: <user's exact words>
  Base URL: ${STATUSPAGE_URL:-https://www.f5cloudstatus.com}
  Filters: <any user-specified filters, or 'none'>

  Execute the operation per your agent instructions and return the report."
)
```

**Substitutions:**

- `<operation>` — short description for the Agent description field (e.g., "full-briefing", "check DNS component")
- `<operation-type>` — one of: `overall-status`, `list-components`, `check-component`, `active-incidents`, `recent-incidents`, `maintenance`, `full-briefing`, `search`, `stakeholder-report`
- `<user's exact words>` — the user's original request verbatim
- `<any user-specified filters>` — extracted parameters like: component name, status filter, impact filter, days window, search query, maintenance scope (upcoming/active/all)

## After Delegation

Present the agent's report to the user as-is. The agent's report is the
complete output — add no extra commentary. If the user asks follow-up
questions, determine the new operation type and delegate again.
