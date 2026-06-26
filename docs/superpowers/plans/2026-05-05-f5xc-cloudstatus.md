# f5xc-cloudstatus Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a marketplace agent skill plugin that monitors Atlassian Statuspage.io-powered status pages, porting all functionality from the f5xc-cloudstatus-mcp server and adding operational intelligence capabilities.

**Architecture:** Thin skill + fat agent. A single skill (`cloud-status`) routes user intent to operations, and a single agent (`status-operator`) executes `cURL` + `jq` against the Statuspage.io public API v2 and produces structured Markdown reports. Three reference files provide API documentation, F5 domain knowledge, and analysis rules.

**Tech Stack:** Markdown skill definitions, cURL + jq for API access, no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-05-05-f5xc-cloudstatus-design.md`

---

## File Map

| File | Responsibility | Created/Modified |
| --- | --- | --- |
| `plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json` | Plugin manifest | Create |
| `plugins/f5xc-cloudstatus/skills/cloud-status/references/statuspage-api.md` | Generic Statuspage.io API v2 reference with cURL + jq templates | Create |
| `plugins/f5xc-cloudstatus/skills/cloud-status/references/f5xc-context.md` | F5 Distributed Cloud domain knowledge | Create |
| `plugins/f5xc-cloudstatus/skills/cloud-status/references/analysis-playbook.md` | Analysis rules, thresholds, report templates | Create |
| `plugins/f5xc-cloudstatus/agents/status-operator.md` | Autonomous cURL + jq agent for API calls and analysis | Create |
| `plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md` | Skill definition: intent routing + delegation | Create |
| `plugins/f5xc-cloudstatus/commands/cloud-status.md` | `/cloud-status` slash command | Create |
| `plugins/f5xc-cloudstatus/README.md` | User-facing plugin documentation | Create |
| `.xcsh-plugin/marketplace.json` | Marketplace registry | Modify (add plugin entry) |

---

### Task 1: Bootstrap plugin scaffold and manifest

**Files:**

- Create: `plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p plugins/f5xc-cloudstatus/.xcsh-plugin
mkdir -p plugins/f5xc-cloudstatus/agents
mkdir -p plugins/f5xc-cloudstatus/commands
mkdir -p plugins/f5xc-cloudstatus/skills/cloud-status/references
```

- [ ] **Step 2: Write plugin.json**

Create `plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json`:

```json
{
  "name": "f5xc-cloudstatus",
  "description": "Cloud service status monitoring and operational intelligence via Atlassian Statuspage.io API — status checks, incident tracking, maintenance windows, trend analysis, regional impact assessment, and stakeholder briefings. Generic Statuspage.io engine with F5 XC domain knowledge layered via reference files.",
  "version": "1.0.0",
  "author": {
    "name": "f5-sales-demo",
    "url": "https://github.com/f5-sales-demo"
  },
  "homepage": "https://github.com/f5-sales-demo/marketplace/tree/main/plugins/f5xc-cloudstatus",
  "keywords": [
    "status",
    "monitoring",
    "incidents",
    "maintenance",
    "statuspage",
    "operational-intelligence",
    "f5xc",
    "atlassian"
  ],
  "license": "Apache-2.0",
  "repository": "https://github.com/f5-sales-demo/marketplace"
}
```

- [ ] **Step 3: Verify JSON is valid and directory structure is correct**

Run: `jq . plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json && find plugins/f5xc-cloudstatus -type d | sort`

Expected: JSON parses cleanly, all 5 directories listed.

- [ ] **Step 4: Commit**

```bash
git add plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json
git commit -m "feat(cloudstatus): bootstrap plugin scaffold and manifest"
```

---

### Task 2: Write the Statuspage.io API reference

**Files:**

- Create: `plugins/f5xc-cloudstatus/skills/cloud-status/references/statuspage-api.md`

- [ ] **Step 1: Write statuspage-api.md**

Create `plugins/f5xc-cloudstatus/skills/cloud-status/references/statuspage-api.md`:

````Markdown
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
|---|----------|-------------|
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
|-------|---------|
| `none` | All systems operational |
| `minor` | Degraded performance somewhere |
| `major` | Partial system outage |
| `critical` | Major system outage |

### Component Status

| Value | Meaning |
|-------|---------|
| `operational` | Functioning normally |
| `degraded_performance` | Slower than expected |
| `partial_outage` | Partially unavailable |
| `major_outage` | Completely unavailable |

### Incident Status (lifecycle order)

`investigating` → `identified` → `monitoring` → `resolved` → `postmortem`

### Maintenance Status (lifecycle order)

`scheduled` → `in_progress` → `verifying` → `completed`

### Impact (incidents and maintenance)

`none`, `minor`, `major`, `critical`

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

### Full Summary (all-in-one)

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

### Search Across All Entities

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
QUERY="dns"
curl -s --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | jq --arg q "$QUERY" '
  ($q | ascii_downcase) as $ql |
  {
    matching_components: [
      .components[]
      | select(.name | ascii_downcase | contains($ql))
      | {id, name, status}
    ],
    matching_incidents: [
      .incidents[]
      | select(
          (.name | ascii_downcase | contains($ql))
          or
          ((.incident_updates // []) | any(.body | ascii_downcase | contains($ql)))
        )
      | {id, name, status, impact}
    ],
    matching_maintenances: [
      .scheduled_maintenances[]
      | select(
          (.name | ascii_downcase | contains($ql))
          or
          ((.incident_updates // []) | any(.body | ascii_downcase | contains($ql)))
        )
      | {id, name, status, scheduled_for}
    ]
  }
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
````

- [ ] **Step 2: Verify API connectivity by running key cURL commands**

Run each against the live F5 Cloud Status API to confirm the templates work:

```bash
BASE="https://www.f5cloudstatus.com/api/v2"

# Test 1: status endpoint
curl -s --connect-timeout 10 --max-time 15 "${BASE}/status.json" | jq '{indicator: .status.indicator, description: .status.description}'

# Test 2: components endpoint — get count
curl -s --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq '{total: (.components | length), groups: [.components[] | select(.group == true) | .name]}'

# Test 3: summary endpoint — verify all fields present
curl -s --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | jq '{page: .page.name, has_status: (.status | type == "object"), has_components: (.components | type == "array"), has_incidents: (.incidents | type == "array"), has_maintenance: (.scheduled_maintenances | type == "array")}'
```

Expected: All three return valid JSON with expected field names. No HTTP errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/f5xc-cloudstatus/skills/cloud-status/references/statuspage-api.md
git commit -m "feat(cloudstatus): add Statuspage.io API v2 reference with cURL templates"
```

---

### Task 3: Write F5 domain knowledge reference

**Files:**

- Create: `plugins/f5xc-cloudstatus/skills/cloud-status/references/f5xc-context.md`

- [ ] **Step 1: Fetch live topology to inform the context file**

Run: `curl -s "https://www.f5cloudstatus.com/api/v2/components.json" | jq '[.components[] | select(.group == true) | .name]'`

This reveals the actual component group names on F5's status page. Use this output to populate the region mapping in the context file.

- [ ] **Step 2: Write f5xc-context.md**

Create `plugins/f5xc-cloudstatus/skills/cloud-status/references/f5xc-context.md`:

````Markdown
# F5 Distributed Cloud — Status Page Context

Domain knowledge for interpreting the F5 Cloud Status page.

**Live page:** https://www.f5cloudstatus.com
**API base:** https://www.f5cloudstatus.com/api/v2

## What is F5 Distributed Cloud?

F5 Distributed Cloud (F5 XC) is a SaaS platform that delivers multi-cloud
networking, security, and application delivery services. It operates a
globally distributed network of **Regional Edge (RE) sites** — physical
Points of Presence (PoPs) in major markets worldwide — through which all
customer traffic flows.

**Core service categories:**

| Category | Services |
|---|---|
| Networking | App Connect, Network Connect, SD-WAN, service mesh |
| Security | WAF, API Security, Bot Defense, DDoS Protection, Client-Side Defense |
| Application Delivery | HTTP/HTTPS Load Balancing, CDN, DNS, Rate Limiting |
| Compute | Distributed Apps, Edge Compute |
| Observability | Analytics, Logging, Metrics, AI Assistant |
| Platform | Console, API, Identity/Auth, Terraform Provider |

## Regional Edge (RE) Coverage

F5 XC Regional Edges serve as the distributed backbone. The status page
organizes components into groups. These group names may vary — discover the
current topology by reading `/api/v2/summary.json` at runtime.

Typical geographic groupings:

| Region Group | Coverage |
|---|---|
| Americas | US, Canada, Latin America |
| EMEA | Europe, Middle East, Africa |
| Asia Pacific | APAC, Southeast Asia, India, Australia, Japan |
| Global | Cross-region: console, API, control plane |

**Agent instruction:** When you fetch `summary.json`, map the actual
component group names to these categories. If group names don't match
these patterns (they may use city names, datacenter codes, or service
names instead), adapt your regional analysis accordingly.

## Service Dependency Map

Upstream issues cascade downstream:

```
Console / API (Control Plane)
  ├── Configuration Management
  │     └── All traffic-path services depend on config being deliverable
  └── Identity / Auth
        └── Required for all management operations

DNS
  └── Required for all new client connections (semi-independent)

Regional Edge Sites (per-region)
  └── Load Balancing / CDN
        └── WAF / API Security / Bot Defense
              └── Origin Connectivity → Customer Applications
```

**Key dependency insight:** A control plane outage prevents *configuration
changes* but does not stop existing traffic rules from enforcing. DNS
outages are more severe for end-user impact than control plane outages.

## Severity Interpretation Guide

| Condition | Likely Customer Impact |
|---|---|
| Single RE site degraded | Low — traffic auto-reroutes to nearest healthy RE |
| Multiple RE sites in same region degraded | Moderate — regional users see latency or partial failures |
| Control plane (Console/API) degraded | Moderate — cannot make config changes; traffic still flows |
| Control plane outage | High — no config changes possible; existing rules still enforce |
| Security services (WAF/Bot) degraded | High — reduced security posture, potential policy bypass |
| DNS degraded/outage | Critical — new connections cannot resolve; existing connections unaffected |
| Multiple regions simultaneously affected | Critical — global impact |

## Stakeholder Communication Template

When generating status reports for stakeholders, use this tone and structure:

**Tone:** Factual, calm, non-alarmist. State facts, timelines, and impact scope.

**Avoid these words** unless the status page itself says `critical`: "emergency",
"disaster", "catastrophic", "dire", "serious"

**Template:**

```
F5 Distributed Cloud Status Update — [date/time UTC]

Current Status: [indicator] — [description from status.json]
Affected Services: [component names from unresolved incidents]
Customer Impact: [assessment using dependency map + severity guide above]
Status Page: [shortlink from incident, or https://www.f5cloudstatus.com]
Estimated Resolution: [from latest incident_update, or "Monitoring — no ETA"]
Next Update Expected: [estimate based on incident update frequency]
```
````

- [ ] **Step 3: Commit**

```bash
git add plugins/f5xc-cloudstatus/skills/cloud-status/references/f5xc-context.md
git commit -m "feat(cloudstatus): add F5 XC domain knowledge reference"
```

---

### Task 4: Write analysis playbook reference

**Files:**

- Create: `plugins/f5xc-cloudstatus/skills/cloud-status/references/analysis-playbook.md`

- [ ] **Step 1: Write analysis-playbook.md**

Create `plugins/f5xc-cloudstatus/skills/cloud-status/references/analysis-playbook.md`:

````Markdown
# Analysis Playbook

Rules for the status-operator agent when performing analysis and
generating reports.

## 1. Severity Assessment Matrix

Determine overall severity from individual component statuses:

| Condition | Overall Severity | Emoji |
|---|---|---|
| Page indicator = `critical` OR any component = `major_outage` with `critical` impact | CRITICAL | :red_circle: |
| Any component = `major_outage` | MAJOR | :orange_circle: |
| 3+ components = `partial_outage` | MAJOR | :orange_circle: |
| 1-2 components = `partial_outage` | MINOR | :warning: |
| Any component = `degraded_performance` | DEGRADED | :warning: |
| All components = `operational` | OPERATIONAL | :white_check_mark: |

**Override rule:** If the page-level status indicator says `critical` or
`major`, that is the severity floor regardless of component analysis.

## 2. Trend Detection

Run trend analysis when the user requests: `full-briefing`, `stakeholder-report`,
`active-incidents`, or explicitly asks about trends/reliability.

Use the `/api/v2/incidents.json` endpoint (returns 50 most recent incidents).

| Pattern | Flag | Recommendation |
|---|---|---|
| Same component: 3+ incidents in 7 days | WARNING | Note as recurring reliability concern |
| Same component: 5+ incidents in 30 days | ALERT | Recommend escalation or engineering review |
| 2+ critical-impact incidents in 30 days | ALERT | Recommend executive awareness |
| Mean time to resolution > 4 hours (last 5 incidents) | WARNING | Note slow response time |
| Incident started during a maintenance window | INFO | Mark as likely correlated (see Section 3) |

**Calculation:** Group incidents by affected component name. For each group,
count incidents within the time window using `created_at` timestamps.

## 3. Cross-Reference Rules (Incidents vs. Maintenance)

Compare incident and maintenance data to classify outages.

| Condition | Classification |
|---|---|
| Incident `created_at` within 2 hours of maintenance `scheduled_for` | LIKELY_CORRELATED |
| Incident affects same component listed in maintenance `components` | LIKELY_CORRELATED |
| Both conditions above | CORRELATED |
| Incident `created_at` > 24 hours before any maintenance | UNPLANNED |
| No active or recent maintenance exists | UNPLANNED |

When LIKELY_CORRELATED or CORRELATED, add to report:
> "This incident appears correlated with scheduled maintenance: [maintenance name]"

## 4. Regional Impact Algorithm

1. Identify affected components (status is not `operational`)
2. Look up each component's `group_id` → resolve to parent group name
3. Group affected components by their group
4. Per group:
   - All components in group affected → "Region-wide impact"
   - Multiple components affected → "Significant regional impact"
   - Single component affected → "Partial regional impact"
5. Unaffected groups → "Operational"

Report format:

```
- Americas: Operational
- EMEA: Partial regional impact — [component names] experiencing [status]
- Asia Pacific: Region-wide impact — all [N] components affected
```

If groups don't map to geographic regions (e.g., they're organized by
service type), adapt the analysis to group by service category instead.

## 5. Reliability Scoring

Score each component group using the 50 most recent incidents.

```
Weights: critical=4, major=2, minor=1, none=0

weighted_count = SUM of weight(incident.impact) for incidents affecting this group
time_window_days = (now - oldest_incident.created_at) / 86400

If time_window_days = 0 or no incidents: score = "Excellent"
Otherwise:
  normalized = weighted_count / time_window_days

  normalized < 0.1  → "Excellent"
  0.1 to 0.5        → "Good"
  0.5 to 1.5        → "Fair"
  >= 1.5             → "Poor"
```

## 6. Report Templates

### Minimal Report (overall-status, check-component)

```Markdown
## Cloud Status — [Page Name]
**[timestamp]** | **Status:** [emoji] [description]

[One sentence if anything noteworthy, omit if all operational]
```

### Standard Report (list-components, active-incidents, recent-incidents, maintenance, search)

```Markdown
## Cloud Status Report — [Page Name]
**Generated:** [timestamp]
**Overall:** [emoji] [indicator] — [description]

### [Section Title] (N)

[Table or list of results]

### Summary
[2-3 sentence overview of findings]
```

### Full Intelligence Report (full-briefing, stakeholder-report)

```Markdown
## Cloud Status Report — [Page Name]
**Generated:** [ISO 8601 timestamp]
**Overall Status:** [emoji] [level] — [description]

### Active Incidents (N)
| Severity | Service | Status | Duration | Latest Update |
|---|---|---|---|---|
| [impact] | [name] | [status] | [Xh Ym] | [first 100 chars of update] |

### Upcoming Maintenance (N)
| Service | Scheduled | Until | Impact |
|---|---|---|---|
| [name] | [date/time] | [date/time] | [impact] |

### Component Health
| Group | Total | Operational | Degraded | Outage | Reliability |
|---|---|---|---|---|---|
| [group] | [N] | [N] | [N] | [N] | [score] |

### Regional Impact
- [Region]: [status summary with affected service names]

### Analysis
- **Trends:** [observations from trend detection]
- **Correlations:** [incident/maintenance cross-references]
- **Concerns:** [reliability flags from scoring]

### Recommendations
- [actionable item based on findings]
```

For stakeholder-report: also append the stakeholder communication template
from f5xc-context.md (the formal status update block).

## 7. Error Response Format

```Markdown
## Cloud Status — Error

**Error:** [API_FAILURE | TIMEOUT | INVALID_URL | PARSE_ERROR]
**URL:** [the URL that was attempted]
**Detail:** [HTTP status code or error message]

The Statuspage.io public API has no rate limits. Errors indicate a network
issue or incorrect `STATUSPAGE_URL` configuration.

**Suggestion:** [Retry in a moment / Check STATUSPAGE_URL value / Verify network connectivity]
```
````

- [ ] **Step 2: Commit**

```bash
git add plugins/f5xc-cloudstatus/skills/cloud-status/references/analysis-playbook.md
git commit -m "feat(cloudstatus): add analysis playbook with severity matrix, trend detection, and report templates"
```

---

### Task 5: Write the status-operator agent

**Files:**

- Create: `plugins/f5xc-cloudstatus/agents/status-operator.md`

- [ ] **Step 1: Write status-operator.md**

Create `plugins/f5xc-cloudstatus/agents/status-operator.md`:

````Markdown
---
name: status-operator
description: >-
  Autonomous API + analysis agent for Statuspage.io-powered status pages.
  Executes cURL + jq sequences against the public Status API v2 and
  produces structured intelligence reports. Handles overall-status,
  list-components, check-component, active-incidents, recent-incidents,
  maintenance, full-briefing, search, and stakeholder-report operations.
  Skills MUST delegate to this agent — never run status API calls in the
  main session. This keeps the main session context lean since API JSON
  payloads can be verbose.
disallowedTools: Write, Edit, Agent
tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# Status Operator Agent

## Identity

You are the **Status Operator** — an autonomous agent that queries
Statuspage.io-powered status pages and produces operational intelligence
reports. You use `cURL` + `jq` to fetch data from the public API v2 and
apply the analysis playbook to generate structured reports.

You do **NOT** have `Write`, `Edit`, or `Agent`. You are execution-only.

## Why This Agent Exists

Statuspage API responses contain verbose JSON. Running them in a subagent
keeps the main session context lean. The main session receives only your
structured Markdown report, not the raw API data.

## Initialization (Every Invocation)

**Step 1:** Read all three reference files. These are relative to the plugin
root directory. Find the plugin root by looking for the nearest
`.xcsh-plugin/plugin.json` ancestor directory.

1. `skills/cloud-status/references/statuspage-api.md` — cURL + jq templates
2. `skills/cloud-status/references/f5xc-context.md` — domain knowledge (or read `$STATUSPAGE_CONTEXT_FILE` if set)
3. `skills/cloud-status/references/analysis-playbook.md` — analysis rules + report templates

**Step 2:** Set the base URL:

```bash
BASE="${STATUSPAGE_URL:-https://www.f5cloudstatus.com}/api/v2"
```

**Step 3:** Run a connectivity check:

```bash
curl -sf --connect-timeout 5 --max-time 10 "${BASE}/status.json" > /dev/null
```

If this fails, return the Error Response Format from the analysis playbook
and stop. Do not proceed with the main operation.

## Operations

### overall-status

1. Fetch status.json using the "Overall Status" cURL template
2. Report using the **Minimal Report** template
3. If indicator is not `none`, add a sentence noting which level

### list-components

1. Fetch components.json using the "All Components with Group Resolution" cURL template
2. If user specified a status filter, apply "Filter Components by Status"
3. If user specified a group filter, apply "Filter Components by Group Name"
4. Report using the **Standard Report** template with a table of components grouped by group name
5. Include the summary counts (total, operational, degraded, outage)

### check-component

1. If user gave a name: use "Find Component by Name" template
2. If user gave an ID: use "Find Component by ID" template
3. Report using **Minimal Report** template with component details
4. If no match: report "No component matching '[query]' found on [page name]."

### active-incidents

1. Fetch unresolved incidents using "Unresolved Incidents" template
2. If results exist, also fetch all incidents for trend analysis
3. Run trend detection (Section 2 of playbook) for affected components
4. Report using **Standard Report** template with incidents table + any trend flags

### recent-incidents

1. Fetch all incidents using "All Recent Incidents" template
2. If user specified a days filter: apply "Filter Incidents by Time Window"
3. If user specified a status filter: pipe through `select(.status == $s)`
4. If user specified an impact filter: apply "Filter Incidents by Impact"
5. Report using **Standard Report** template with incidents table

### maintenance

1. Determine which endpoint based on user request:
   - "upcoming" → Upcoming Maintenances template
   - "active" or "current" → Active Maintenances template
   - Unspecified → fetch both upcoming and active
2. Report using **Standard Report** template with maintenance table

### full-briefing

1. Fetch summary.json using "Full Summary" template (one API call)
2. Then fetch full components.json for group resolution
3. Then fetch full incidents.json for trend analysis (summary only has unresolved)
4. Run ALL analysis:
   - Severity assessment (Section 1)
   - Trend detection (Section 2)
   - Cross-reference incidents vs. maintenance (Section 3)
   - Regional impact (Section 4)
   - Reliability scoring (Section 5)
5. Report using **Full Intelligence Report** template

### search

1. Fetch summary.json and apply the "Search Across All Entities" template with user's query
2. Report matching results from each category using **Standard Report** template
3. If no matches: "No results matching '[query]' found on [page name]."

### stakeholder-report

1. Execute the same data collection and analysis as `full-briefing`
2. Use **Full Intelligence Report** template
3. Append the **Stakeholder Communication Template** from f5xc-context.md
4. Adjust tone: factual, non-alarmist, executive-appropriate

## Error Handling

For every `cURL` call, capture HTTP status:

```bash
response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 15 "$URL")
http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "000" ]; then
  # Connection failed — network issue
  echo "TIMEOUT: Could not connect to $URL"
elif [ "$http_code" != "200" ]; then
  echo "API_FAILURE: HTTP $http_code from $URL"
fi
```

For jq parse failures:

```bash
echo "$body" | jq . > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "PARSE_ERROR: Response from $URL was not valid JSON"
fi
```

On any error, use the Error Response Format from the analysis playbook and stop.

## Report Delivery

Always provide the complete structured report at the end of your response.
The main session does not have access to raw API data — your report is all
it will see. Do not truncate or summarize the report.
````

- [ ] **Step 2: Verify the agent frontmatter is valid YAML**

Run: `head -15 plugins/f5xc-cloudstatus/agents/status-operator.md | grep -E '^(name|description|disallowedTools|tools):' | wc -l`

Expected: 4 (all four frontmatter fields present)

- [ ] **Step 3: Commit**

```bash
git add plugins/f5xc-cloudstatus/agents/status-operator.md
git commit -m "feat(cloudstatus): add status-operator agent with 9 operation types"
```

---

### Task 6: Write the cloud-status skill

**Files:**

- Create: `plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md`:

````Markdown
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

Cloud service status monitoring and operational intelligence by querying
a Statuspage.io-powered status page via its public API v2.

**Default target:** F5 Distributed Cloud at `https://www.f5cloudstatus.com`
**Generic:** Set `STATUSPAGE_URL` env var to use any Statuspage.io page.

## Intent Routing

Map the user's request to an operation type, then delegate to the
`status-operator` agent.

| User Intent | Operation | Notes |
|---|---|---|
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
|---|---|
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
````

- [ ] **Step 2: Verify the skill frontmatter**

Run: `head -15 plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md | grep -E '^(name|description|user-invocable|compatibility):' | wc -l`

Expected: 4 (all four frontmatter fields present)

- [ ] **Step 3: Commit**

```bash
git add plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md
git commit -m "feat(cloudstatus): add cloud-status skill with intent routing and delegation"
```

---

### Task 7: Write the /cloud-status command

**Files:**

- Create: `plugins/f5xc-cloudstatus/commands/cloud-status.md`

- [ ] **Step 1: Write cloud-status.md command**

Create `plugins/f5xc-cloudstatus/commands/cloud-status.md`:

```Markdown
---
description: Check cloud service status, incidents, maintenance, and generate operational intelligence reports
argument-hint: "[status|incidents|maintenance|briefing|search <query>|components]"
allowed_tools:
  - Agent
---

Invoke the `f5xc-cloudstatus:cloud-status` skill with "$ARGUMENTS".

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
```

- [ ] **Step 2: Commit**

```bash
git add plugins/f5xc-cloudstatus/commands/cloud-status.md
git commit -m "feat(cloudstatus): add /cloud-status slash command"
```

---

### Task 8: Write README.md

**Files:**

- Create: `plugins/f5xc-cloudstatus/README.md`

- [ ] **Step 1: Write README.md**

Create `plugins/f5xc-cloudstatus/README.md`:

````Markdown
# f5xc-cloudstatus

Cloud service status monitoring and operational intelligence plugin for
Claude Code. Queries Atlassian Statuspage.io-powered status pages via the
public API v2.

No API keys. No authentication. The Statuspage.io public API is rate-limit-free.

**Default target:** F5 Distributed Cloud at https://www.f5cloudstatus.com

## Skills

| Skill | Purpose |
|-------|---------|
| `cloud-status` | Auto-activates on status/incident/maintenance queries; delegates to status-operator agent |

## Agents

| Agent | Purpose |
|-------|---------|
| `status-operator` | Executes cURL + jq against Statuspage.io API; 9 operation types with structured analysis reports |

## Commands

| Command | Purpose |
|---------|---------|
| `/cloud-status` | Quick access to status checks and operational intelligence |
| `/cloud-status status` | Overall status indicator |
| `/cloud-status incidents` | Active/unresolved incidents with trend analysis |
| `/cloud-status maintenance` | Upcoming and active maintenance windows |
| `/cloud-status briefing` | Full operational intelligence report |
| `/cloud-status search <query>` | Search across components, incidents, and maintenances |
| `/cloud-status components` | All components grouped by category with status |

## Operations

### Quick Status Check

```
/cloud-status status
```

### Full Operational Briefing

```
/cloud-status briefing
```

Includes: overall status, active incidents, upcoming maintenance, component
health by group, regional impact assessment, trend detection, reliability
scoring, and actionable recommendations.

### Incident Investigation

```
/cloud-status incidents
```

Shows unresolved incidents with severity, duration, affected components,
and trend analysis for recurring issues.

### Maintenance Awareness

```
/cloud-status maintenance
```

Shows scheduled and in-progress maintenance windows with affected
components and timelines.

### Stakeholder Report

Ask naturally: "Generate a stakeholder status report"

Produces an executive-ready status update using the F5 stakeholder
communication template.

### Search

```
/cloud-status search dns
```

Searches across components, incidents, and maintenances for matches.

## Configuration

| Environment Variable | Default | Purpose |
|---|---|---|
| `STATUSPAGE_URL` | `https://www.f5cloudstatus.com` | Target any Statuspage.io page |
| `STATUSPAGE_CONTEXT_FILE` | (none) | Custom domain knowledge file path |

### Using with a Different Status Page

Set `STATUSPAGE_URL` to target any Statuspage.io-powered status page:

```bash
export STATUSPAGE_URL=https://status.github.com
```

The plugin auto-discovers the page topology from the API. For best results,
create a custom context file describing the page's service categories and
set `STATUSPAGE_CONTEXT_FILE` to its path.

## Analysis Capabilities

Beyond raw data retrieval, the plugin provides:

- **Severity Assessment** — composite scoring from individual component statuses
- **Trend Detection** — recurring incident patterns per component/group
- **Cross-Reference Analysis** — correlates incidents with maintenance windows
- **Regional Impact Mapping** — geographic scope from component group structure
- **Reliability Scoring** — weighted composite per component group
- **Stakeholder Briefings** — executive-ready communication templates

## Ported From

This plugin replaces the [f5xc-cloudstatus-mcp](https://github.com/example-user/f5xc-cloudstatus-mcp)
MCP server. All 6 MCP tools are ported with full feature parity, plus new
operational intelligence capabilities. The MCP server's infrastructure
(Playwright browser, connection pooling, in-memory caching) is replaced by
direct `cURL` + `jq` calls against the public API.
````

- [ ] **Step 2: Commit**

```bash
git add plugins/f5xc-cloudstatus/README.md
git commit -m "feat(cloudstatus): add README with usage documentation"
```

---

### Task 9: Register plugin in marketplace.json

**Files:**

- Modify: `.xcsh-plugin/marketplace.json`

- [ ] **Step 1: Add the f5xc-cloudstatus entry to the plugins array**

Insert before the closing `]` of the plugins array (after the last existing plugin entry, `salesforce`), add:

```json
    ,
    {
      "name": "f5xc-cloudstatus",
      "description": "Cloud service status monitoring and operational intelligence via Atlassian Statuspage.io API — status checks, incident tracking, maintenance windows, trend analysis, regional impact assessment, and stakeholder briefings",
      "version": "1.0.0",
      "author": {
        "name": "f5-sales-demo"
      },
      "source": "./plugins/f5xc-cloudstatus",
      "category": "productivity",
      "homepage": "https://github.com/f5-sales-demo/marketplace/tree/main/plugins/f5xc-cloudstatus",
      "license": "Apache-2.0",
      "keywords": ["status", "monitoring", "incidents", "maintenance", "statuspage", "operational-intelligence", "f5xc", "atlassian"],
      "tags": ["status", "monitoring", "ops", "f5xc"],
      "repository": "https://github.com/f5-sales-demo/marketplace"
    }
```

- [ ] **Step 2: Validate the complete marketplace.json is valid JSON**

Run: `jq . .xcsh-plugin/marketplace.json > /dev/null && echo "Valid JSON" || echo "INVALID JSON"`

Expected: "Valid JSON"

- [ ] **Step 3: Verify the new plugin is listed**

Run: `jq '.plugins[] | select(.name == "f5xc-cloudstatus") | {name, version, source}' .xcsh-plugin/marketplace.json`

Expected:

```json
{
  "name": "f5xc-cloudstatus",
  "version": "1.0.0",
  "source": "./plugins/f5xc-cloudstatus"
}
```

- [ ] **Step 4: Commit**

```bash
git add .xcsh-plugin/marketplace.json
git commit -m "feat(cloudstatus): register f5xc-cloudstatus in marketplace manifest"
```

---

### Task 10: End-to-end validation

**Files:** None (read-only verification)

- [ ] **Step 1: Verify all files exist**

Run:

```bash
echo "=== File check ===" && \
test -f plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json && echo "OK: plugin.json" && \
test -f plugins/f5xc-cloudstatus/README.md && echo "OK: README.md" && \
test -f plugins/f5xc-cloudstatus/agents/status-operator.md && echo "OK: status-operator.md" && \
test -f plugins/f5xc-cloudstatus/commands/cloud-status.md && echo "OK: cloud-status.md" && \
test -f plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md && echo "OK: SKILL.md" && \
test -f plugins/f5xc-cloudstatus/skills/cloud-status/references/statuspage-api.md && echo "OK: statuspage-api.md" && \
test -f plugins/f5xc-cloudstatus/skills/cloud-status/references/f5xc-context.md && echo "OK: f5xc-context.md" && \
test -f plugins/f5xc-cloudstatus/skills/cloud-status/references/analysis-playbook.md && echo "OK: analysis-playbook.md" && \
echo "=== All 8 files present ==="
```

Expected: All 8 "OK" lines printed.

- [ ] **Step 2: Validate plugin.json**

Run: `jq '.name, .version' plugins/f5xc-cloudstatus/.xcsh-plugin/plugin.json`

Expected: `"f5xc-cloudstatus"` and `"1.0.0"`

- [ ] **Step 3: Smoke test the live API**

Run:

```bash
BASE="https://www.f5cloudstatus.com/api/v2"
echo "=== Status ===" && \
curl -sf --connect-timeout 10 --max-time 15 "${BASE}/status.json" | jq '{indicator: .status.indicator, description: .status.description}' && \
echo "=== Components ===" && \
curl -sf --connect-timeout 10 --max-time 15 "${BASE}/components.json" | jq '{total: (.components | length), groups: [.components[] | select(.group == true) | .name]}' && \
echo "=== Summary ===" && \
curl -sf --connect-timeout 10 --max-time 15 "${BASE}/summary.json" | jq '{page: .page.name, components: (.components | length), incidents: (.incidents | length), maintenances: (.scheduled_maintenances | length)}'
```

Expected: Three valid JSON blocks confirming API connectivity and data shape.

- [ ] **Step 4: Verify marketplace.json plugin count**

Run: `jq '.plugins | length' .xcsh-plugin/marketplace.json`

Expected: Previous count + 1 (should be 23 if there were 22 before).

- [ ] **Step 5: Verify YAML frontmatter consistency across all Markdown files**

Run:

```bash
for f in plugins/f5xc-cloudstatus/agents/status-operator.md plugins/f5xc-cloudstatus/skills/cloud-status/SKILL.md plugins/f5xc-cloudstatus/commands/cloud-status.md; do
  echo "=== $(basename $f) ===" && head -3 "$f" | grep -c "^---$"
done
```

Expected: Each file shows "1" (confirming frontmatter delimiter is present on the first line).
