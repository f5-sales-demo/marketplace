# cURL Command Templates

One section per operation. Agent: run ONLY the section matching your operation.

BASE is always: `${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2`

## overall-status

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/status.json" | tr -d '\000-\011\013-\014\016-\037' | jq '{
  page: .page.name,
  indicator: .status.indicator,
  description: .status.description,
  updated_at: .page.updated_at
}'
```

## list-components

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/components.json" | tr -d '\000-\011\013-\014\016-\037' | jq '
  (.components | map(select(.group == true))
    | map({(.id): .name}) | add // {}) as $groups |
  [.components[]
    | select(.group == false or .group == null)
    | {name, status,
       group: (if .group_id then ($groups[.group_id] // "Ungrouped")
               else "Ungrouped" end)}]
  | group_by(.group)
  | map({
      group: .[0].group,
      total: length,
      operational: [.[] | select(.status == "operational")] | length,
      degraded: [.[] | select(.status != "operational") | .name]
    })'
```

## check-component

Replace COMPONENT_NAME with the user's query (case-insensitive search).

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
NAME="COMPONENT_NAME"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | tr -d '\000-\011\013-\014\016-\037' | jq --arg n "$NAME" \
  '[.components[] | select(.name | ascii_downcase
    | contains($n | ascii_downcase)) | {name, status, description}]'
```

## active-incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents/unresolved.json" | tr -d '\000-\011\013-\014\016-\037' | jq '[.incidents[] | {
    name, status, impact, created_at, shortlink,
    duration_h: (((now - (.created_at
      | sub("\\.[0-9]+"; "") | fromdateiso8601)) / 3600) | floor),
    latest_update: (.incident_updates[0].body // "No updates")[0:300],
    affected: [(.components // [])[] | .name]
  }]'
```

## recent-incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents.json" | tr -d '\000-\011\013-\014\016-\037' | jq '[.incidents[] | {
    name, status, impact, created_at, resolved_at, shortlink,
    latest_update: (.incident_updates[0].body // "No updates")[0:200],
    affected: [(.components // [])[] | .name]
  }]'
```

Optional filters (add inside the array brackets):

- By days: `select((.created_at | sub("\\.[0-9]+"; "")
  | fromdateiso8601) > (now - (DAYS * 86400)))`
- By status: `select(.status == "STATUS")`
- By impact: `select(.impact == "IMPACT")`

## maintenance

Run whichever endpoints the user requested (default: both).

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
FILTER='[.scheduled_maintenances[] | {
  name, status, impact, scheduled_for, scheduled_until,
  affected: [(.components // [])[] | .name]}]'

echo "=== Upcoming ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances/upcoming.json" | tr -d '\000-\011\013-\014\016-\037' | jq "$FILTER"

echo "=== Active ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances/active.json" | tr -d '\000-\011\013-\014\016-\037' | jq "$FILTER"
```

## full-briefing

Run all three commands in a single Bash call.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"

echo "===STATUS===" && \
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | tr -d '\000-\011\013-\014\016-\037' | jq '{
  page: .page.name,
  status: .status,
  incidents: [.incidents[] | {
    name, status, impact, created_at,
    duration_h: (((now - (.created_at
      | sub("\\.[0-9]+"; "") | fromdateiso8601)) / 3600) | floor),
    latest_update: (.incident_updates[0].body // "None")[0:300],
    affected: [(.components // [])[] | .name]
  }],
  maintenance: [.scheduled_maintenances[] | {
    name, status, impact, scheduled_for, scheduled_until,
    affected: [(.components // [])[] | .name]
  }]
}'

echo "===COMPONENTS===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/components.json" | tr -d '\000-\011\013-\014\016-\037' | jq '
  (.components | map(select(.group == true))
    | map({(.id): .name}) | add // {}) as $groups |
  [.components[]
    | select(.group == false or .group == null)
    | {name, status,
       group: (if .group_id then ($groups[.group_id] // "Ungrouped")
               else "Ungrouped" end)}]
  | group_by(.group)
  | map({
      group: .[0].group,
      total: length,
      operational: [.[] | select(.status == "operational")] | length,
      degraded: [.[] | select(.status != "operational") | .name]
    })'

echo "===TRENDS===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents.json" | tr -d '\000-\011\013-\014\016-\037' | jq '[.incidents[] | {
    name, impact, created_at,
    resolved_at: (.resolved_at // null),
    affected: [(.components // [])[] | .name]
  }]'
```

## search

Replace SEARCH_QUERY with the user's query.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="SEARCH_QUERY"

echo "=== Components ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/components.json" \
  | tr -d '\000-\011\013-\014\016-\037' | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.components[] | select(.name | ascii_downcase
      | contains($ql)) | {name, status}]'

echo "=== Incidents ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents.json" \
  | tr -d '\000-\011\013-\014\016-\037' | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.incidents[] | select((.name | ascii_downcase | contains($ql))
      or ((.incident_updates // [])
        | any(.body | ascii_downcase | contains($ql))))
      | {name, status, impact, created_at}]'

echo "=== Maintenances ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances.json" \
  | tr -d '\000-\011\013-\014\016-\037' | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.scheduled_maintenances[]
      | select((.name | ascii_downcase | contains($ql))
        or ((.incident_updates // [])
          | any(.body | ascii_downcase | contains($ql))))
      | {name, status, scheduled_for}]'
```

## stakeholder-report

Same commands as `full-briefing`.
