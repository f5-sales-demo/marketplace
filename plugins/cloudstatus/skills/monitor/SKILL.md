---
name: monitor
description: Monitors cloud service health through live Statuspage evidence. Use for F5 Distributed Cloud status, overall health, components, outages, active or recent incidents, maintenance windows, service searches, operational briefings, and stakeholder summaries. This skill is status-only; use the location or network-intelligence skill for physical location, routing, peering, or diagnostics.
---

# Cloud status monitor

Use the F5 Distributed Cloud page by default. Respect an existing
`STATUSPAGE_URL` setting when the user is clearly asking about another
Statuspage-backed service.

## Intent routing

| Intent | Operation |
| --- | --- |
| Overall status or “is it up?” | `overall-status` |
| List components | `list-components` |
| Health of one component | `check-component` |
| Current outages | `active-incidents` |
| Incident history | `recent-incidents` |
| Maintenance windows | `maintenance` |
| Complete operational briefing | `full-briefing` |
| Search status records | `search` |
| Executive or stakeholder summary | `stakeholder-report` |

For `/cloud-status`, map no argument and `briefing` to `full-briefing`; map
`status`, `incidents`, `maintenance`, `search <query>`, and `components` to the
corresponding operations above.

## Execution

Use the xcsh `task` tool with this shape:

```yaml
agent: cloudstatus-status-operator
context: >-
  Goal: answer the status-only request from current Statuspage evidence.
  Use the assigned operation, derive counts from the response, and preserve
  source failures as limitations.
tasks:
  - id: RunCloudStatus
    description: Collect current cloud service status
    assignment: |-
      ## Target
      Run the selected status operation for the exact user request.

      ## Change
      Read `skill://cloudstatus:monitor/references/commands.md`, execute only
      the matching command, and format the result.

      ## Edge Cases
      Pass any filter through `CLOUDSTATUS_QUERY`. Preserve partial responses
      and never invent an ETA or operational total.

      ## Acceptance
      Return a source-linked report that answers the request and labels any
      limitation.
```

Give the task the selected operation, the user's exact request, and any filter.
Present the returned report without silently strengthening its claims.
