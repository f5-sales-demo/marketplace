---
description: Check current cloud service status, incidents, maintenance, components, or generate a status briefing
argument-hint: "[status|incidents|maintenance|briefing|search <query>|components]"
---

# Cloud service status

Invoke the installed `cloudstatus:monitor` skill with `$ARGUMENTS`.

Map arguments as follows:

- No argument or `briefing`: `full-briefing`
- `status`: `overall-status`
- `incidents`: `active-incidents`
- `maintenance`: `maintenance`
- `search <query>`: `search`, using the remaining text as its filter
- `components`: `list-components`

For other text, let the monitor skill choose the closest status operation. This
command is intentionally limited to status operations.
