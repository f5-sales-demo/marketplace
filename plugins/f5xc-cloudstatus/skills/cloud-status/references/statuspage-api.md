# Statuspage.io Public API v2 Reference

Consumer-facing (read-only) Status API v2. No authentication required
for public pages. No rate limits.

## Base URL

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
```

Set `STATUSPAGE_URL` environment variable to use a different Statuspage.io page.

## Endpoints

| # | Endpoint | Description |
| --- | ---------------------------------------------------- | ---------------------------------------------------------- |
| 1 | `GET /api/v2/status.json` | Overall status rollup (indicator + description) |
| 2 | `GET /api/v2/summary.json` | All-in-one: status + components + incidents + maintenance |
| 3 | `GET /api/v2/components.json` | All components with current statuses |
| 4 | `GET /api/v2/incidents.json` | 50 most recent incidents (all states) |
| 5 | `GET /api/v2/incidents/unresolved.json` | Only Investigating, Identified, or Monitoring |
| 6 | `GET /api/v2/scheduled-maintenances.json` | 50 most recent maintenances (all states) |
| 7 | `GET /api/v2/scheduled-maintenances/upcoming.json` | Only Scheduled state |
| 8 | `GET /api/v2/scheduled-maintenances/active.json` | Only In Progress or Verifying |

## Enumerations

### Status Indicator (page-level)

| Value | Meaning |
| ------------ | -------------------------------- |
| `none` | All systems operational |
| `minor` | Degraded performance somewhere |
| `major` | Partial system outage |
| `critical` | Major system outage |

### Component Status

| Value | Meaning |
| ----------------------- | ----------------------- |
| `operational` | Functioning normally |
| `degraded_performance` | Slower than expected |
| `partial_outage` | Partially unavailable |
| `major_outage` | Completely unavailable |

### Incident Status (lifecycle order)

`investigating` → `identified` → `monitoring` → `resolved` → `postmortem`

### Maintenance Status (lifecycle order)

`scheduled` → `in_progress` → `verifying` → `completed`

### Impact (incidents and maintenance)

`none`, `minor`, `major`, `critical`, `maintenance`

Scheduled maintenances typically return `impact: "maintenance"` rather than the
severity-based values used by incidents.

---

## cURL + jq Command Templates

### Overall Status

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/status.json" | jq '{
  page: .page.name,
  indicator: .status.indicator,
  description: .status.description,
  updated_at: .page.updated_at
}'
```

### Full Summary (counts only)

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | jq '{
  page: .page.name,
  status: .status,
  component_count: (.components | length),
  incident_count: (.incidents | length),
  maintenance_count: (.scheduled_maintenances | length)
}'
```

### Raw Summary (full data for briefings)

For `full-briefing` and `stakeholder-report`, fetch the raw summary without
reducing to counts. This returns full component, incident, and maintenance objects.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | jq '.'
```

### All Components with Group Resolution

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq '
  (.components | map(select(.group == true)) | map({(.id): .name}) | add // {}) as $groups |
  {
    components: [
      .components[]
      | select(.group == false or .group == null)
      | {
          id,
          name,
          status,
          group: (if .group_id then ($groups[.group_id] // "Ungrouped") else "Ungrouped" end),
          description
        }
    ],
    groups: [.components[] | select(.group == true) | {name, id}],
    summary: {
      total: [.components[] | select(.group == false or .group == null)] | length,
      operational: [.components[] | select((.group == false or .group == null) and .status == "operational")] | length,
      degraded: [.components[] | select((.group == false or .group == null) and .status == "degraded_performance")] | length,
      partial_outage: [.components[] | select((.group == false or .group == null) and .status == "partial_outage")] | length,
      major_outage: [.components[] | select((.group == false or .group == null) and .status == "major_outage")] | length
    }
  }
'
```

### Filter Components by Status

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
STATUS="major_outage"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq --arg s "$STATUS" '
  [.components[] | select(.status == $s and (.group == false or .group == null))]
'
```

### Filter Components by Group Name

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
GROUP="Americas"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq --arg g "$GROUP" '
  (.components | map(select(.group == true)) | map(select(.name | ascii_downcase | contains($g | ascii_downcase))) | .[0].id) as $gid |
  [.components[] | select(.group_id == $gid)]
'
```

### Find Component by Name (case-insensitive)

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
NAME="dns"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq --arg n "$NAME" '
  [.components[] | select(.name | ascii_downcase | contains($n | ascii_downcase))]
'
```

### Find Component by ID

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
ID="abc123"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq --arg id "$ID" '
  .components[] | select(.id == $id)
'
```

### All Recent Incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" | jq '[
  .incidents[] | {
    id,
    name,
    status,
    impact,
    created_at,
    updated_at,
    resolved_at,
    shortlink,
    latest_update: (.incident_updates[0].body // "No updates"),
    affected_components: [(.components // [])[] | .name]
  }
]'
```

### Unresolved Incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents/unresolved.json" | jq '[
  .incidents[] | {
    id,
    name,
    status,
    impact,
    created_at,
    updated_at,
    shortlink,
    duration_hours: (((now - (.created_at | fromdateiso8601)) / 3600) | floor),
    latest_update: (.incident_updates[0].body // "No updates"),
    affected_components: [(.components // [])[] | .name]
  }
]'
```

### Filter Incidents by Status

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
STATUS="resolved"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" | jq --arg s "$STATUS" '
  [.incidents[] | select(.status == $s)]
'
```

### Filter Incidents by Impact

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
IMPACT="critical"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" | jq --arg i "$IMPACT" '
  [.incidents[] | select(.impact == $i)]
'
```

### Filter Incidents by Time Window (days)

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
DAYS=7
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" | jq --argjson d "$DAYS" '
  (now - ($d * 86400)) as $cutoff |
  [.incidents[] | select((.created_at | fromdateiso8601) > $cutoff)]
'
```

### All Scheduled Maintenances

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances.json" | jq '[
  .scheduled_maintenances[] | {
    id,
    name,
    status,
    impact,
    scheduled_for,
    scheduled_until,
    shortlink,
    latest_update: (.incident_updates[0].body // "No updates"),
    affected_components: [(.components // [])[] | .name]
  }
]'
```

### Upcoming Maintenances

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances/upcoming.json" | jq '[
  .scheduled_maintenances[] | {
    id,
    name,
    status,
    impact,
    scheduled_for,
    scheduled_until,
    affected_components: [(.components // [])[] | .name]
  }
]'
```

### Active Maintenances

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances/active.json" | jq '[
  .scheduled_maintenances[] | {
    id,
    name,
    status,
    impact,
    scheduled_for,
    scheduled_until,
    affected_components: [(.components // [])[] | .name]
  }
]'
```

### Search Across All Entities (full history)

Fetch and search each endpoint separately to include resolved incidents and
completed maintenances. `summary.json` only contains unresolved/upcoming records.
Use per-endpoint pipes to avoid shell argument-list overflow on large responses.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="dns"

echo "=== Matching Components ==="
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | \
  jq --arg q "$QUERY" '
    ($q | ascii_downcase) as $ql |
    [.components[] | select(.name | ascii_downcase | contains($ql)) | {id, name, status}]
  '

echo "=== Matching Incidents ==="
curl -s --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" | \
  jq --arg q "$QUERY" '
    ($q | ascii_downcase) as $ql |
    [.incidents[]
      | select(
          (.name | ascii_downcase | contains($ql))
          or ((.incident_updates // []) | any(.body | ascii_downcase | contains($ql)))
        )
      | {id, name, status, impact}]
  '

echo "=== Matching Maintenances ==="
curl -s --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances.json" | \
  jq --arg q "$QUERY" '
    ($q | ascii_downcase) as $ql |
    [.scheduled_maintenances[]
      | select(
          (.name | ascii_downcase | contains($ql))
          or ((.incident_updates // []) | any(.body | ascii_downcase | contains($ql)))
        )
      | {id, name, status, scheduled_for}]
  '
```

---

## Response Schemas

### Page Object (present in every response)

```json
{
  "page": {
    "id": "string",
    "name": "string",
    "url": "string",
    "time_zone": "string",
    "updated_at": "ISO 8601 with timezone offset"
  }
}
```

### Component

```json
{
  "id": "string",
  "name": "string",
  "status": "operational | degraded_performance | partial_outage | major_outage",
  "group": "boolean — true means this is a group container, not a real component",
  "group_id": "string | null — parent group ID if this component belongs to a group",
  "description": "string | null",
  "position": "integer — display order",
  "showcase": "boolean",
  "only_show_if_degraded": "boolean",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

Group components (`"group": true`) contain a `"components"` array of child component IDs.
Leaf components have `"group": false` (or null) and may have a `group_id` pointing to their parent.

### Incident

```json
{
  "id": "string",
  "name": "string",
  "status": "investigating | identified | monitoring | resolved | postmortem",
  "impact": "none | minor | major | critical",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601",
  "monitoring_at": "ISO 8601 | null",
  "resolved_at": "ISO 8601 | null",
  "shortlink": "string — short URL to incident page",
  "page_id": "string",
  "incident_updates": [
    {
      "id": "string",
      "incident_id": "string",
      "status": "string",
      "body": "string — human-readable update text",
      "created_at": "ISO 8601",
      "updated_at": "ISO 8601",
      "display_at": "ISO 8601"
    }
  ],
  "components": [
    {
      "id": "string",
      "name": "string",
      "status": "string"
    }
  ]
}
```

### Scheduled Maintenance

Same fields as Incident, plus:

```json
{
  "scheduled_for": "ISO 8601 — planned start time",
  "scheduled_until": "ISO 8601 — planned end time"
}
```

### Summary Response

Contains all of the above:

```json
{
  "page": { ... },
  "status": { "indicator": "string", "description": "string" },
  "components": [ ... ],
  "incidents": [ ... ],
  "scheduled_maintenances": [ ... ]
}
```

The summary endpoint returns only **unresolved** incidents and **upcoming/in-progress**
scheduled maintenances (not historical data).
