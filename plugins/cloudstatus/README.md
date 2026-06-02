# cloudstatus

Cloud service status monitoring and operational intelligence plugin for
Claude Code. Queries Atlassian Statuspage.io-powered status pages via the
public API v2.

No API keys. No authentication. The Statuspage.io public API is rate-limit-free.

**Default target:** F5 Distributed Cloud at <https://www.f5cloudstatus.com>

## Skills

| Skill | Purpose |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `cloud-status` | Auto-activates on status/incident/maintenance queries; delegates to status-operator agent |

## Agents

| Agent | Purpose |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `status-operator` | Executes cURL + jq against Statuspage.io API; 9 operation types with structured analysis reports |

## Commands

| Command | Purpose |
| -------------------------------- | ----------------------------------------------------------- |
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
| ------------------------ | --------------------------------- | --------------------------------- |
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

This plugin replaces the [cloudstatus-mcp](https://github.com/example-user/cloudstatus-mcp)
MCP server. All 6 MCP tools are ported with full feature parity, plus new
operational intelligence capabilities. The MCP server's infrastructure
(Playwright browser, connection pooling, in-memory caching) is replaced by
direct `cURL` + `jq` calls against the public API.
