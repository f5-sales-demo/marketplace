---
description: Check cloud service status, incidents, maintenance, and generate operational intelligence reports
argument-hint: "[status|incidents|maintenance|briefing|search <query>|components]"
allowed_tools:
  - Agent
---

Invoke the `cloudstatus:cloud-status` skill with "$ARGUMENTS".

Parse the arguments:

- No argument → operation `full-briefing` (overall status + incidents + maintenance + analysis)
- `status` → operation `overall-status` (quick indicator check)
- `incidents` → operation `active-incidents` (unresolved incidents with timeline and trends)
- `maintenance` → operation `maintenance` (upcoming and active maintenance windows)
- `briefing` → operation `full-briefing` (complete operational intelligence report)
- `search <query>` → operation `search` with everything after "search" as the query
- `components` → operation `list-components` (all components grouped by category with status)

If the argument doesn't match any of the above, treat it as a natural language
request and let the skill's intent routing determine the operation.
