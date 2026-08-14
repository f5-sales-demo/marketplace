# Statuspage command reference

Run only the section selected by the monitor skill. The default API root is
`${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2`. Every request has a
connection bound and a 15-second total bound. Filters arrive in
`CLOUDSTATUS_QUERY` through the Bash tool environment.

The Python step parses and reserializes JSON before `jq` handles it.

## overall-status

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/status.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '{page: .page.name, indicator: .status.indicator, description: .status.description, observed_at: .page.updated_at}'
```

## list-components

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '(.components | map(select(.group == true)) | map({(.id): .name}) | add // {}) as $groups
    | [.components[] | select(.group != true)
      | {name, status, updated_at,
         group: (if .group_id then ($groups[.group_id] // "Ungrouped") else "Ungrouped" end)}]
    | group_by(.group)
    | map({group: .[0].group, total: length,
           operational: ([.[] | select(.status == "operational")] | length),
           affected: [.[] | select(.status != "operational") | {name, status}]})'
```

## check-component

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="${CLOUDSTATUS_QUERY:-}"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq --arg query "$QUERY" '[.components[]
      | select(.group != true)
      | select(.name | ascii_downcase | contains($query | ascii_downcase))
      | {name, status, description, updated_at}]'
```

## active-incidents

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/incidents/unresolved.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '[.incidents[] | {name, status, impact, created_at, updated_at, shortlink,
      latest_update: (.incident_updates[0] // null),
      affected: [(.components // [])[] | {name, status}]}]'
```

## recent-incidents

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '[.incidents[] | {name, status, impact, created_at, updated_at, resolved_at,
      shortlink, latest_update: (.incident_updates[0] // null),
      affected: [(.components // [])[] | {name, status}]}]'
```

## maintenance

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
printf '%s\n' 'Upcoming maintenance'
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances/upcoming.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '[.scheduled_maintenances[] | {name, status, impact, scheduled_for, scheduled_until,
      shortlink, affected: [(.components // [])[] | {name, status}]}]'
printf '%s\n' 'Active maintenance'
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances/active.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '[.scheduled_maintenances[] | {name, status, impact, scheduled_for, scheduled_until,
      shortlink, affected: [(.components // [])[] | {name, status}]}]'
```

## full-briefing

The summary response supplies overall status, current components, active
incidents, and upcoming maintenance in one request.

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/summary.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq '(.components | map(select(.group == true)) | map({(.id): .name}) | add // {}) as $groups
    | {page: .page.name, observed_at: .page.updated_at, status: .status,
       component_health: ([.components[] | select(.group != true)
         | {name, status, group: (if .group_id then ($groups[.group_id] // "Ungrouped") else "Ungrouped" end)}]
         | group_by(.group)
         | map({group: .[0].group, total: length,
                operational: ([.[] | select(.status == "operational")] | length),
                affected: [.[] | select(.status != "operational") | {name, status}]})),
       active_incidents: [.incidents[] | {name, status, impact, created_at, updated_at, shortlink,
         latest_update: (.incident_updates[0] // null), affected: [(.components // [])[] | .name]}],
       upcoming_maintenance: [.scheduled_maintenances[] | {name, status, impact,
         scheduled_for, scheduled_until, shortlink, affected: [(.components // [])[] | .name]}]}'
```

## search

```bash
set -o pipefail
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="${CLOUDSTATUS_QUERY:-}"
printf '%s\n' 'Components'
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq --arg query "$QUERY" '[.components[] | select(.group != true)
      | select(.name | ascii_downcase | contains($query | ascii_downcase))
      | {name, status, updated_at}]'
printf '%s\n' 'Incidents'
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq --arg query "$QUERY" '[.incidents[]
      | select((.name | ascii_downcase | contains($query | ascii_downcase))
        or ((.incident_updates // []) | any(.body | ascii_downcase | contains($query | ascii_downcase))))
      | {name, status, impact, created_at, resolved_at, shortlink}]'
printf '%s\n' 'Maintenance'
curl -fsSL --connect-timeout 10 --max-time 15 "${BASE}/scheduled-maintenances.json" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin),sys.stdout)' \
  | jq --arg query "$QUERY" '[.scheduled_maintenances[]
      | select((.name | ascii_downcase | contains($query | ascii_downcase))
        or ((.incident_updates // []) | any(.body | ascii_downcase | contains($query | ascii_downcase))))
      | {name, status, impact, scheduled_for, scheduled_until, shortlink}]'
```

## stakeholder-report

Run `full-briefing`, then translate only its current evidence into a stakeholder
summary. Do not add an ETA unless an incident update supplies one.
