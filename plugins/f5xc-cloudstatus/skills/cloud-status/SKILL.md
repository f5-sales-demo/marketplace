---
name: cloud-status
description: >-
  Cloud service status monitoring and operational intelligence via Atlassian
  Statuspage.io API. Activates when the user asks about cloud status, service
  health, F5 status, active incidents, outages, degraded services, maintenance
  windows, component status, operational status, or requests a status briefing.
  Also activates for: "is [service] up", "any outages", "what's down",
  "status report for stakeholders", "executive status summary". Delegates
  all API calls to the status-operator agent — never runs cURL in the main
  session.
user-invocable: false
compatibility: Requires cURL, jq, and network access to the Statuspage.io API
---

# Cloud Status Skill

Status monitoring via Statuspage.io public API v2.

**Default:** F5 Distributed Cloud at `https://www.f5cloudstatus.com`
**Generic:** Set `STATUSPAGE_URL` env var for any Statuspage.io page.

## Intent Routing

| User Intent | Operation |
| ---------------------------------------------------- | --------------------- |
| "What's the overall status?" / "Is everything OK?" | `overall-status` |
| "Show me all components" / "What services exist?" | `list-components` |
| "Is [service] healthy?" / "Status of [component]" | `check-component` |
| "Any active incidents?" / "Current outages?" | `active-incidents` |
| "Show recent incidents" / "Incident history" | `recent-incidents` |
| "Scheduled maintenance?" / "Maintenance windows?" | `maintenance` |
| "Full status briefing" / "What's going on?" | `full-briefing` |
| "Search for [query]" | `search` |
| "Stakeholder report" / "Executive summary" | `stakeholder-report` |

### Command Argument Mapping (`/cloud-status [arg]`)

| Argument | Operation |
| ---------------- | --------------------- |
| (none) | `full-briefing` |
| `status` | `overall-status` |
| `incidents` | `active-incidents` |
| `maintenance` | `maintenance` |
| `briefing` | `full-briefing` |
| `search <query>` | `search` |
| `components` | `list-components` |

## Delegation

```
Agent(
  subagent_type="f5xc-cloudstatus:status-operator",
  description="<operation> cloud status",
  prompt="Operation: <operation-type>
User request: <user's exact words>
Filters: <component name | status | impact | days | search query | none>

Read skills/cloud-status/references/commands.md and run the
<operation-type> section. Return the formatted report."
)
```

For `check-component`: include the component name or ID as the filter.
For `search`: include the search query as the filter.
For `recent-incidents`: include any days/status/impact filters.

## After Delegation

Present the agent's report as-is. For follow-ups, determine the new
operation and delegate again.
