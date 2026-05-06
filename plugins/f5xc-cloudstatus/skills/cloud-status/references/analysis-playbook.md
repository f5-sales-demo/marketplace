# Analysis Playbook

Rules for the status-operator agent when performing analysis and
generating reports.

## 1. Severity Assessment Matrix

Determine overall severity from individual component statuses:

| Condition | Overall Severity | Emoji |
| ----------------------------------------------------------------------------- | ---------------- | ----- |
| Page indicator = `critical` OR any unresolved incident has `critical` impact | CRITICAL | 🔴 |
| Any component = `major_outage` | MAJOR | 🟠 |
| 3+ components = `partial_outage` | MAJOR | 🟠 |
| 1-2 components = `partial_outage` | MINOR | ⚠️ |
| Any component = `degraded_performance` | DEGRADED | ⚠️ |
| All components = `operational` | OPERATIONAL | ✅ |

**Override rule:** If the page-level status indicator says `critical` or
`major`, that is the severity floor regardless of component analysis.

## 2. Trend Detection

Run trend analysis when the user requests: `full-briefing`, `stakeholder-report`,
`active-incidents`, or explicitly asks about trends/reliability.

Use the `/api/v2/incidents.json` endpoint (returns 50 most recent incidents).

| Pattern | Flag | Recommendation |
| ------------------------------------------------------- | ------- | -------------------------------------------- |
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
| -------------------------------------------------------------------- | ----------------- |
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
  >= 1.5            → "Poor"
```

## 6. Report Templates

### Minimal Report (overall-status, check-component)

```markdown
## Cloud Status — [Page Name]
**[timestamp]** | **Status:** [emoji] [description]

[One sentence if anything noteworthy, omit if all operational]
```

### Standard Report (list-components, active-incidents, recent-incidents, maintenance, search)

```markdown
## Cloud Status Report — [Page Name]
**Generated:** [timestamp]
**Overall:** [emoji] [indicator] — [description]

### [Section Title] (N)

[Table or list of results]

### Summary
[2-3 sentence overview of findings]
```

### Full Intelligence Report (full-briefing, stakeholder-report)

```markdown
## Cloud Status Report — [Page Name]
**Generated:** [ISO 8601 timestamp]
**Overall Status:** [emoji] [level] — [description]

### Active Incidents (N)
| Severity | Service | Status | Duration | Latest Update |
| --- |---| --- |---| --- |
| [impact] | [name] | [status] | [Xh Ym] | [first 100 chars of update] |

### Upcoming Maintenance (N)
| Service | Scheduled | Until | Impact |
| --- |---| --- |---|
| [name] | [date/time] | [date/time] | [impact] |

### Component Health
| Group | Total | Operational | Degraded | Outage | Reliability |
| --- |---| --- |---| --- |---|
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

```markdown
## Cloud Status — Error

**Error:** [API_FAILURE | TIMEOUT | INVALID_URL | PARSE_ERROR]
**URL:** [the URL that was attempted]
**Detail:** [HTTP status code or error message]

The Statuspage.io public API has no rate limits. Errors indicate a network
issue or incorrect `STATUSPAGE_URL` configuration.

**Suggestion:** [Retry in a moment / Check STATUSPAGE_URL value / Verify network connectivity]
```
