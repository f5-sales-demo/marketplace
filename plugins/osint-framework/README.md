# OSINT Framework Plugin

Claude Code plugin for open-source intelligence gathering — 1,064 free tools across 34 categories, mapped from [osintframework.com](https://osintframework.com).

## Overview

This plugin provides category-based OSINT skills, investigation agents, and executable command pipelines for intelligence gathering. All tools are free or freemium — no paywalled or subscription-only resources.

**Key numbers:**

- 1,064 cataloged tools (filtered from 1,166 — paid/dead/invite-only removed)
- 34 investigation categories with enriched skills
- 138 CLI-installable tools with verified install commands
- 50 tools verified installable via pip/go/apt
- 5 executable investigation pipelines with output parsing

## Architecture

```
osint-index (router)
    |
    +-- osint-catalog (browse/search)
|  |
    |       +-- investigation-pipelines.md (executable command chains)
    |
    +-- 33 category skills (e.g. username-recon, domain-recon, ...)
    |       +-- references/tools.md (per-category tool database)
    |
    +-- osint-investigator (multi-tool orchestration agent)
    +-- osint-researcher (read-only catalog lookup agent)
    +-- osint-executor (single-tool CLI execution agent)
```

### How It Works

1. **User request** hits `osint-index` which auto-detects the target type (email, domain, IP, username, etc.)
2. Routes to the matching **category skill** (e.g., `domain-recon` for domains)
3. The skill **delegates to an agent**:
   - `osint-researcher` for tool recommendations (read-only)
   - `osint-investigator` for multi-tool investigations
   - `osint-executor` for single-tool execution
4. Agents read the category's `references/tools.md` for tool details
5. Results returned as structured reports with confidence levels and OPSEC labels

## Commands

| Command | Usage | Description |
| --------- | ------- | ------------- |
| `/osint-search` | `/osint-search subdomain enumeration` | Search the tool catalog |
| `/osint-catalog` | `/osint-catalog domain` | Browse tools by category |
| `/osint-investigate` | `/osint-investigate example.com` | Run a multi-tool investigation |

## Categories

| Category | Skill | Tools |
| ---------- | ------- | ------- |
| Username | `username-recon` | 18 |
| Email Address | `email-recon` | 28 |
| Domain Name | `domain-recon` | 131 |
| Cloud Infrastructure | `cloud-recon` | 23 |
| IP & MAC Address | `ip-address-recon` | 55 |
| Images / Videos / Docs | `images-videos` | 89 |
| Social Networks | `social-networks` | 63 |
| Instant Messaging | `messaging-comms` | 20 |
| People Search Engines | `people-search` | 18 |
| Telephone Numbers | `phone-recon` | 13 |
| Public Records | `public-records` | 45 |
| Compliance & Risk | `compliance-risk` | 18 |
| Business Records | `business-records` | 28 |
| Transportation | `transportation` | 21 |
| Geolocation / Maps | `geolocation` | 47 |
| Search Engines | `search-engines` | 73 |
| Online Communities | `online-communities` | 16 |
| Archives | `archives-cache` | 21 |
| Language Translation | `language-translation` | 16 |
| Mobile OSINT | `mobile-osint` | 29 |
| Dark Web | `dark-web` | 13 |
| Disinfo & Verification | `disinfo-verification` | 17 |
| Blockchain & Crypto | `blockchain-crypto` | 31 |
| Classifieds | `classifieds` | 11 |
| Encoding / Decoding | `encoding-decoding` | 16 |
| OSINT Tools | `osint-tools` | 36 |
| AI Tools | `ai-tools` | 19 |
| Malicious File Analysis | `malicious-file-analysis` | 33 |
| Exploits & Advisories | `exploits-advisories` | 20 |
| Threat Intelligence | `threat-intelligence` | 38 |
| OpSec | `opsec` | 47 |
| Documentation / Evidence | `documentation-evidence` | 15 |
| Training | `training` | 4 |

## Command-line tools

### Already in devcontainer base image

whois, dig, nslookup, nmap, masscan, tshark, exiftool, subfinder, httpx, dnsx, amass, nuclei, gitleaks, gobuster, ffuf, searchsploit, recon-ng, spiderfoot, theHarvester, yt-dlp, checkov, prowler, Ghidra

### Install additional OSINT tools

```bash
# Install all verified tools
bash plugins/osint-framework/scripts/install-tools.sh --all

# Install by package manager
bash plugins/osint-framework/scripts/install-tools.sh --pip-only
bash plugins/osint-framework/scripts/install-tools.sh --go-only
bash plugins/osint-framework/scripts/install-tools.sh --apt-only

# Verify installation
bash plugins/osint-framework/scripts/install-tools.sh --verify
```

### Verified pip tools (26 new)

sherlock-project, maigret, holehe, h8mail, sylva, dnsrecon, sublist3r, scanless, scoutsuite, c7n, roadrecon, iocextract, ioc_parser, pymisp, oletools, pdfid, quicksand, apkleaks, frida-tools, masto, wechatsogou, linelog2py, xeuledoc, waybackpack, dfir-unfurl, torbot

### Verified Go tools (3 new)

checkip, goblob, bucketloot

### Dockerfile integration

A drop-in Dockerfile layer is provided at `scripts/Dockerfile.osint-tools` for building a devcontainer with all tools pre-installed.

## Investigation Pipelines

The plugin includes 5 executable investigation pipelines with copy-paste-ready commands:

| Pipeline | Target | Key Tools | OPSEC |
| ---------- | -------- | ----------- | ------- |
| Username | `@handle` | sherlock, maigret, cURL | Active |
| Email | `history-f7ee5ec73121@example.com` | holehe, h8mail, dig | Mixed |
| Domain | `example.com` | whois, dig, subfinder, httpx, nuclei | Mixed |
| IP Address | `192.0.2.149` | ipinfo.io, whois, nmap, searchsploit | Mixed |
| Person | `Jane Doe` | web search, social probes, public records | Active |

See `skills/osint-catalog/references/investigation-pipelines.md` for full pipelines.

## OPSEC

Every tool and pipeline step is classified:

- **Passive**: No direct contact with target infrastructure (WHOIS via third-party, cached DNS, CT logs, local database lookups)
- **Active**: Direct contact with target (HTTP requests, port scanning, username enumeration)

The plugin includes an OPSEC warning hook that alerts before running active reconnaissance tools. Always run passive tools first.

## Data Pipeline

Tool data is sourced from the [OSINT Framework](https://github.com/lockfale/osint-framework) `arf.json` file and transformed via:

```bash
# Regenerate all reference files from arf.json
bash plugins/osint-framework/scripts/transform-arf.sh

# Regenerate category SKILL.md stubs
bash plugins/osint-framework/scripts/generate-skills.sh
```

### Filtering rules

**Included**: `pricing` is free, freemium, or unset; `status` is live or unset
**Excluded**: paid, subscription, dead, deprecated, invitation-only

## Legal Notice

All tools in this plugin use only publicly available information. Users are responsible for ensuring compliance with applicable laws, regulations, and platform terms of service. Never use OSINT tools for unauthorized access, harassment, stalking, or any illegal activity.

## License

Apache-2.0

## Credits

- Tool data: [OSINT Framework](https://osintframework.com) by Justin Nordine
- Architecture patterns: [Claude OSINT Investigator](https://github.com/danielrosehill/Claude-OSINT-Investigator), [OSINT Skill](https://github.com/smixs/osint-skill), [OSINT-RECON](https://github.com/T43cr0wl3r/OSINT-RECON)
