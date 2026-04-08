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

# OSINT Catalog — Tool Discovery

Browse and search 1,084 free/freemium OSINT tools across 34 categories.

## Usage

### Browse Categories

Read `skills/osint-catalog/references/tree-index.md` for the full
category listing with tool counts.

### Search for Tools

Delegate to the researcher agent:

```
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
