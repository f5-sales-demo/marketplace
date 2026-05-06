# Correlation Engine: Entity Graph Reference

## Overview

The OSINT correlation engine maintains a JSON entity graph at
`/tmp/osint-graph/`. This graph persists across tool executions within
a single investigation session, enabling agents to build a connected
picture of all discovered intelligence.

Every entity and relationship is stored as a JSON object. The graph
library (`scripts/osint-graph.sh`) provides shell functions for
creating, querying, and reporting on graph data.

---

## Entity Types

| Type | Description | Example |
| ------ | ------------- | --------- |
| `person` | A human individual | `"John Smith"` |
| `company` | A business or organization | `"Acme Corp"` |
| `domain` | A DNS domain name | `"example.com"` |
| `ip` | An IPv4 or IPv6 address | `"198.51.100.1"` |
| `email` | An email address | `"john@example.com"` |
| `username` | An account handle on a platform | `"jsmith"` |
| `phone` | A phone number | `"+1-555-0100"` |
| `hash` | A file hash (MD5, SHA1, SHA256) | `"d41d8cd98f00b204e9800998ecf8427e"` |

---

## Relationship Types

| Relationship | Description | Example |
| ------------- | ------------- | --------- |
| `works_at` | Person is employed by a company | person -> company |
| `owns` | Entity owns another entity | company -> domain, person -> username |
| `uses` | Entity uses another entity | person -> email, person -> phone |
| `related_to` | General association between entities | entity -> entity |
| `member_of` | Entity belongs to a group or org | person -> company |
| `associated_with` | Indirect or inferred connection | domain -> domain |
| `hosts` | Infrastructure hosting relationship | ip -> domain, CDN -> domain |
| `resolves_to` | DNS resolution from domain to IP | domain -> ip |

---

## Confidence Weights by Source

Each entity and relationship carries a confidence weight based on
the tool or data source that produced it.

| Source | Confidence Weight | Rationale |
| -------- | :-----------------: | ----------- |
| DNS / WHOIS | 0.95 | Authoritative registry data |
| SEC EDGAR | 0.95 | Government regulatory filings |
| GitHub API | 0.90 | Verified platform identity |
| ipinfo.io | 0.85 | Curated IP intelligence |
| subfinder | 0.80 | Aggregated passive DNS sources |
| Social media | 0.70 | User-controlled profile data |
| Web search | 0.50 | Unverified public references |
| Inference | 0.30 | Agent-derived logical deduction |

---

## Usage

### Initialization

Source the graph library at the start of every investigation:

```bash
source scripts/osint-graph.sh && osint_graph_init
```

This creates the `/tmp/osint-graph/` directory structure and
initializes the entity and relationship stores.

### Creating Entities and Relationships

After each tool execution, create entities and relationships from
the output.

### Example: GitHub profile discovery

```bash
P_ID=$(osint_entity_add "person" "$NAME" location="$LOC" --tool github-api)
U_ID=$(osint_entity_add "username" "$LOGIN" platform="github" --tool github-api)
osint_rel_add "$P_ID" "$U_ID" "owns" --tool github-api
```

### Example: Domain reconnaissance

```bash
D_ID=$(osint_entity_add "domain" "$DOMAIN" --tool whois)
IP_ID=$(osint_entity_add "ip" "$IP" --tool dig)
osint_rel_add "$D_ID" "$IP_ID" "resolves_to" --tool dig
```

---

## Query Patterns

### Search for entities

```bash
# Find all entities matching a value
osint_entity_search "example.com"

# Query the full graph for a specific entity type
osint_graph_query --type domain
```

### Generate reports

```bash
# Full graph report with all entities, relationships, and confidence scores
osint_graph_report

# Summary statistics (entity counts, relationship counts, coverage)
osint_graph_stats
```

---

## Multi-Source Confidence Fusion

When multiple tools produce the same finding, confidence scores are
fused using the formula:

```
C_fused = 1 - (1 - C_1) * (1 - C_2) * ... * (1 - C_n)
```

Where `C_1` through `C_n` are the individual confidence weights from
each confirming source. This means:

- Two sources at 0.70 each fuse to 0.91
- A 0.95 source confirmed by a 0.50 source fuses to 0.975
- Three weak sources (0.30 each) fuse to 0.657

The fused confidence is stored on the entity and used in the final
investigation report to rank findings by reliability.
