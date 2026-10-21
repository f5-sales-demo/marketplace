---
name: osint-catalog
description: >-
  Browse and search the OSINT tool catalog across all categories.
  Use when the user wants to find OSINT tools, browse categories,
  list available tools, or search for specific capabilities.
  Activates for "what OSINT tools", "show me tools for",
  "list categories", "find a tool that", "OSINT catalog".
user-invocable: false
---

**Canonical skill URI**: `skill://osint-framework:osint-catalog`

# OSINT Catalog — Tool Discovery

Browse and search the installed free/freemium OSINT reference catalog. Derive current totals
from the installed tree index; catalog counts describe entries rather than installed executables.

## Evidence and reporting

Lead with the selected category, query or authorized target, the sources inspected, important
findings, warnings and stage completion. Label catalog-only discovery and recommendations;
record actual executed commands, results and conclusions separately. A listed tool or URL does
not prove installation, availability or a completed investigation.

Use the first twelve rows as the default list preview, with total and shown counts, readable
columns and an explicit continuation. Supply the complete safe evidence once when expanded or
requested. Keep counts separate from units, URLs and command text. Preserve zero, false, empty
strings, unknown values and literal corrective guidance; missing evidence is unknown rather than
an empty successful result. Identify unavailable, partial and failed sources and the exact next
action. Do not repeat the same evidence in both summary and expanded sections.

For executed operations, show the exact executable and argv with effective scope and flags.
Quote literal target values, and label install or usage examples as recommendations until run.
Retain existing authorization, write and OPSEC guards; catalog browsing does not start an
investigation, install software or contact external targets.

## Usage

### Browse Categories

Read `skills/osint-catalog/references/tree-index.md` for the full
category listing with tool counts.

### Search for Tools

Delegate to the researcher agent:

```text
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="OSINT catalog search: [query]",
  prompt="Search the OSINT tool catalog for: [query]\n\n
    1. Read skills/osint-catalog/references/tree-index.md to identify matching categories\n
    2. Read the references/tools.md file for each matching category skill\n
    3. Return a structured table of matching tools with name, type, URL, and description"
)
```

### Browse a Specific Category

Read the category's reference file directly:
`skills/<skill-name>/references/tools.md`

## Categories

See `references/tree-index.md` for the complete index.

Key categories:

- **username-recon** — Username enumeration (18 tools)
- **email-recon** — Email search, verification, breach data (28 tools)
- **domain-recon** — WHOIS, DNS, subdomains, certificates (131 tools)
- **ip-address-recon** — Geolocation, port scanning, reputation (55 tools)
- **social-networks** — Platform-specific OSINT (63 tools)
- **images-videos** — Reverse image search, metadata, face recognition (89 tools)
- **search-engines** — General and specialized search (73 tools)
- **threat-intelligence** — IOC, malware, phishing intelligence (38 tools)
- **geolocation** — Maps, satellite, location intelligence (47 tools)
- **opsec** — Operational security tools (47 tools)
