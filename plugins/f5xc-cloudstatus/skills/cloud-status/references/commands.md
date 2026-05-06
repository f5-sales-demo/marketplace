# cURL Command Templates

One section per operation. Agent: run ONLY the section matching your operation.

BASE is always: `${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2`

**JSON sanitizer (used in every command):**
`python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)"`
This re-serializes the response through Python's JSON parser, stripping any
embedded control characters that cause jq parse failures.

## overall-status

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/status.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq '{
      page: .page.name,
      indicator: .status.indicator,
      description: .status.description,
      updated_at: .page.updated_at
    }'
```

## list-components

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq '
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

Replace COMPONENT\_NAME with the user's query (case-insensitive search).

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
NAME="COMPONENT_NAME"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq --arg n "$NAME" \
    '[.components[] | select(.name | ascii_downcase
      | contains($n | ascii_downcase)) | {name, status, description}]'
```

## active-incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents/unresolved.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq '[.incidents[] | {
      name, status, impact, created_at, shortlink,
      duration_h: (((now - (.created_at
        | sub("\\.[0-9]+"; "") | fromdateiso8601)) / 3600) | floor),
      latest_update: (.incident_updates[0].body
        // "No updates")[0:300],
      affected: [(.components // [])[] | .name]
    }]'
```

## recent-incidents

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/incidents.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq '[.incidents[] | {
      name, status, impact, created_at, resolved_at, shortlink,
      latest_update: (.incident_updates[0].body
        // "No updates")[0:200],
      affected: [(.components // [])[] | .name]
    }]'
```

Optional filters (add `select(...)` inside the array brackets):

- By days: `select((.created_at | sub("\\.[0-9]+"; "")
  | fromdateiso8601) > (now - (DAYS * 86400)))`
- By status: `select(.status == "STATUS")`
- By impact: `select(.impact == "IMPACT")`

## maintenance

Run whichever endpoints the user requested (default: both).

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
SANITIZE='python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)"'
FILTER='[.scheduled_maintenances[] | {
  name, status, impact, scheduled_for, scheduled_until,
  affected: [(.components // [])[] | .name]}]'

echo "=== Upcoming ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances/upcoming.json" \
  | eval "$SANITIZE" | jq "$FILTER"

echo "=== Active ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances/active.json" \
  | eval "$SANITIZE" | jq "$FILTER"
```

## full-briefing

Single API call. summary.json already contains all 153 components
(identical to components.json), active incidents, and upcoming maintenance.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/summary.json" \
  | python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)" \
  | jq '
    (.components | map(select(.group == true))
      | map({(.id): .name}) | add // {}) as $groups |
    {
      page: .page.name,
      status: {
        indicator: .status.indicator,
        description: .status.description,
        emoji: (if .status.indicator == "none" then "OK"
                elif .status.indicator == "minor" then "DEGRADED"
                elif .status.indicator == "major" then "PARTIAL_OUTAGE"
                else "MAJOR_OUTAGE" end)
      },
      component_health: (
        [.components[]
          | select(.group == false or .group == null)
          | {name, status,
             group: (if .group_id then
               ($groups[.group_id] // "Ungrouped")
               else "Ungrouped" end)}]
        | group_by(.group)
        | map({
            group: .[0].group,
            total: length,
            operational: ([.[] | select(.status == "operational")]
              | length),
            degraded: [.[]
              | select(.status != "operational") | .name]
          })
      ),
      active_incidents: [.incidents[] | {
        name, status, impact, created_at,
        duration_h: (((now - (.created_at
          | sub("\\.[0-9]+"; "")
          | fromdateiso8601)) / 3600) | floor),
        latest_update: (.incident_updates[0].body
          // "None")[0:300],
        affected: [(.components // [])[] | .name]
      }],
      upcoming_maintenance: [.scheduled_maintenances[] | {
        name, status, impact,
        scheduled_for, scheduled_until,
        affected: [(.components // [])[] | .name]
      }],
      stats: {
        total_components: ([.components[]
          | select(.group == false or .group == null)]
          | length),
        degraded_count: ([.components[]
          | select((.group == false or .group == null)
            and .status != "operational")] | length),
        active_incidents: (.incidents | length),
        upcoming_maintenance: (.scheduled_maintenances | length)
      }
    }'
```

## search

Replace SEARCH\_QUERY with the user's query.

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="SEARCH_QUERY"
SANITIZE='python3 -c "import sys,json; json.dump(json.load(sys.stdin),sys.stdout)"'

echo "=== Components ===" && \
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/components.json" \
  | eval "$SANITIZE" \
  | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.components[] | select(.name | ascii_downcase
      | contains($ql)) | {name, status}]'

echo "=== Incidents ===" && \
curl -sL --connect-timeout 10 --max-time 15 "${BASE}/incidents.json" \
  | eval "$SANITIZE" \
  | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.incidents[] | select((.name | ascii_downcase | contains($ql))
      or ((.incident_updates // [])
        | any(.body | ascii_downcase | contains($ql))))
      | {name, status, impact, created_at}]'

echo "=== Maintenances ===" && \
curl -sL --connect-timeout 10 --max-time 15 \
  "${BASE}/scheduled-maintenances.json" \
  | eval "$SANITIZE" \
  | jq --arg q "$QUERY" '($q | ascii_downcase) as $ql |
    [.scheduled_maintenances[]
      | select((.name | ascii_downcase | contains($ql))
        or ((.incident_updates // [])
          | any(.body | ascii_downcase | contains($ql))))
      | {name, status, scheduled_for}]'
```

## stakeholder-report

Same command as `full-briefing`.
