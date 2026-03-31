---
name: osint-tools
description: >-
  General OSINT automation frameworks, collection tools, and multi-purpose reconnaissance suites.
  Use when the user mentions: OSINT framework, automation, recon tool, collection, SpiderFoot, Maltego, recon-ng.
user-invocable: false
---

# OSINT Tools & Frameworks

General OSINT automation frameworks, collection tools, visualization
platforms, and multi-purpose reconnaissance suites.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/osint-tools/references/tools.md` for the complete
list of 36 free tools in this category.

## Key CLI Tools

| Tool | Install | Usage |
|------|---------|-------|
| Maltego | Download from `https://www.maltego.com/downloads/` (GUI installer) | `maltego` (GUI) or run transforms via Maltego CE/XL |

### All Install Methods — Maltego

| Method | Command |
|--------|---------|
| Download | `https://www.maltego.com/downloads/` (Linux .deb/.rpm, macOS .dmg, Windows .exe) |
| apt | `sudo apt install maltego` (Kali Linux repos) |
| snap | N/A |
| docker | N/A |
| pip | N/A |
| git clone | N/A (proprietary) |
| go | N/A |
| npm | N/A |
| brew | N/A |
| cargo | N/A |

### Notable CLI Tools from References (git clone)

Many tools in this category are Python-based and installed via git clone:

| Tool | Install | Purpose |
|------|---------|---------|
| Photon | `git clone https://github.com/s0md3v/Photon` | Fast web crawler for URLs, emails, files, accounts |
| ReconDog | `git clone https://github.com/s0md3v/ReconDog` | Multi-purpose recon with API integrations |
| DataSploit | `git clone https://github.com/datasploit/datasploit` | Automated OSINT data aggregation |
| OSRFramework | `git clone https://github.com/i3visio/osrframework` | Username checking, domain research, phone lookup |
| OSINT-SPY | `git clone https://github.com/SharadKumar97/OSINT-SPY` | Multi-source OSINT collection |
| Scrummage | `git clone https://github.com/matamorphosis/Scrummage` | OSINT dashboard and task management |
| PhoneInfoga | `git clone https://github.com/sundowndev/PhoneInfoga` | Phone number reconnaissance |
| Omnibus | `git clone https://github.com/InQuest/omnibus` | OSINT artifact collection and management |
| AutoOSINT | `git clone https://github.com/bharshbarger/AutOSINT` | Automated OSINT workflow runner |
| Inquisitor | `git clone https://github.com/penafieljlm/inquisitor` | Modular OSINT gathering framework |
| CeWL | `git clone https://github.com/digininja/CeWL` | Custom wordlist generator from target sites |
| Cupp | `git clone https://github.com/Mebus/cupp` | Common User Password Profiler |

## Subcategories

- **OSINT Automation** — Multi-purpose frameworks that aggregate and automate OSINT collection across data sources (DataSploit, Omnibus, Photon, ReconDog, OSRFramework, OSINT-SPY, AutoOSINT, Inquisitor, Scrummage, PhoneInfoga, IFTTT, Microsoft Flow)
- **Visualization** — Link analysis, entity relationship graphing, and visual intelligence mapping (Maltego, Overview)
- **Collection Frameworks** — Platforms for structured evidence gathering and artifact management (Omnibus, IntelligenceX, Analyst Research Tools, MIDINS TITAN)
- **Browser Extensions** — Not standalone tools but browser-integrated utilities for in-context OSINT
- **Data Processing** — Wordlist generation, password profiling, and web content extraction (CeWL, Cupp, OWASP D4N155, W Generator)
- **Virtual Machines** — Pre-configured OSINT operating systems and sandboxed environments (Kali Linux, ParrotSec, Buscador OS, Tails, Whonix, Subgraph OS, VirtualBox, VMware Player)
- **Pentesting Recon** — Vulnerability scanning and recon overlap tools (Nikto, Low Hanging Fruit, IntRec-Pack, Slash, Vector)

## Investigation Workflow

1. **Scope definition**: Determine what data types you need (domains, emails, usernames, phone numbers, IPs)
2. **Framework selection**: Choose the right tool — Maltego for visual link analysis, Photon for web crawling, OSRFramework for username enumeration
3. **Automated collection**: Run automated OSINT tools (DataSploit, AutoOSINT, OSINT-SPY) against target identifiers
4. **Data aggregation**: Collect results into Omnibus or Scrummage for structured artifact management
5. **Visualization**: Import entity data into Maltego for relationship graphing and pattern discovery
6. **Wordlist generation**: Use CeWL to build target-specific wordlists from discovered web content
7. **Pivot to specialized skills**: Use findings to feed into domain-recon, social-networks, username-recon, or other specialized categories
8. **Environment hardening**: Run investigations from Tails, Whonix, or Kali VM for operational security

## Cross-Category Pivots

This is a **meta-tools category** — its frameworks feed into and receive data from all other categories:

- **domain-recon** — Domain and subdomain data feeds into Maltego graphs; Photon crawls target domains
- **social-networks** — OSRFramework and PhoneInfoga enumerate social profiles; results visualize in Maltego
- **username-recon** — OSRFramework performs cross-platform username checks
- **email-recon** — DataSploit and ReconDog aggregate email intelligence
- **ip-address-recon** — Maltego transforms resolve IPs and map infrastructure
- **phone-recon** — PhoneInfoga performs carrier and location lookups
- **threat-intelligence** — IntelligenceX aggregates threat data; Maltego integrates threat feeds
- **blockchain-crypto** — Maltego transforms support cryptocurrency address investigation
- **dark-web** — Scrummage and IntelligenceX monitor dark web sources

## OPSEC Notes

- Most tools listed are **Passive** when used against public APIs and indexes
- **Maltego** is marked **Active** and requires **registration** — transforms actively query external services; some transforms contact target infrastructure directly
- Maltego Community Edition (CE) is free but limited; transforms are logged by Maltego servers and transform hub providers
- Python-based tools (Photon, ReconDog, DataSploit) make direct HTTP requests to targets — your IP is visible to target servers
- Use a VPN, Tor, or proxy chain when running active collection tools
- Run from a dedicated OSINT VM (Tails, Whonix, Kali) to isolate investigative activity from personal environments
- IFTTT and Microsoft Flow automations may log and store data in cloud accounts tied to your identity
- IntelligenceX queries may be logged; use anonymous access when possible

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="OSINT Tools & Frameworks tool search",
  prompt="Find OSINT tools for OSINT Tools & Frameworks.\n
    Read skills/osint-tools/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="OSINT Tools & Frameworks investigation: [target]",
  prompt="Investigate using OSINT Tools & Frameworks tools: [target]\n\n
    Primary: Read skills/osint-tools/references/tools.md\n
    Execute available CLI tools (Maltego for link analysis, Photon for
    crawling, OSRFramework for username enumeration), query web
    resources, report findings.\n
    Start with passive collection before active reconnaissance."
)
```
