---
name: threat-intelligence
description: >-
  Threat feeds, IOC databases, phishing detection, C2 tracking, and cyber
  threat analysis. Use when the user mentions: threat intelligence, IOC,
  phishing, C2, threat feed, cyber threat, indicator of compromise, STIX,
  TAXII, APT, ransomware, TTP, MITRE ATT&CK, threat hunting.
user-invocable: false
---

# Threat Intelligence

Threat feeds, IOC databases, phishing detection, C2 tracking, APT research,
and cyber threat analysis.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/threat-intelligence/references/tools.md` for the complete
list of 38 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| Jager | `pip install jager` or `git clone https://github.com/sroberts/jager && cd jager && python setup.py install` | `jager <ioc-feed-url>` |
| IOC Parser | `pip install ioc_parser` or `git clone https://github.com/armbues/ioc_parser && cd ioc_parser && python setup.py install` | `ioc_parser -i report.pdf -o csv` |
| Cacador | `pip install cacador` or `git clone https://github.com/sroberts/cacador && cd cacador && python setup.py install` | `cacador -f threat_report.txt` |
| ThreatPinch Lookup | `git clone https://github.com/cloudtracer/ThreatPinchLookup` | Browser extension; CLI scripts in repo for IOC enrichment |
| iocextract | `pip install iocextract` | `iocextract -f input.txt` or `echo "text" \| iocextract` |
| ThreatIngestor | `pip install threatingestor` or `git clone https://github.com/InQuest/ThreatIngestor && pip install .` or `docker pull inquest/threatingestor` | `threatingestor config.yml` |
| MISP | `git clone https://github.com/MISP/MISP && cd MISP && ./INSTALL/INSTALL.sh` or `docker pull coolacid/misp-docker` ; Python client: `pip install pymisp` | `from pymisp import PyMISP; misp = PyMISP(url, key)` |
| mlsecproject/combine | `git clone https://github.com/mlsecproject/combine && cd combine && pip install -r requirements.txt` | `python combine.py` outputs CSV of aggregated threat feeds |
| hostintel | `git clone https://github.com/keithjjones/hostintel && cd hostintel && pip install -r requirements.txt` | `python hostintel.py -a <ip-or-domain> -o csv` |

### Dockerfile Install Patterns

```dockerfile
# pip-installable tools
RUN pip install --no-cache-dir \
    iocextract \
    ioc_parser \
    jager \
    cacador \
    threatingestor \
    pymisp

# git-clone tools (no PyPI package)
RUN git clone --depth 1 https://github.com/mlsecproject/combine /opt/combine \
    && pip install --no-cache-dir -r /opt/combine/requirements.txt

RUN git clone --depth 1 https://github.com/keithjjones/hostintel /opt/hostintel \
    && pip install --no-cache-dir -r /opt/hostintel/requirements.txt

RUN git clone --depth 1 https://github.com/cloudtracer/ThreatPinchLookup /opt/threatpinch

# Docker-based (alternative to local install)
# docker pull inquest/threatingestor
# docker pull coolacid/misp-docker
```

## Subcategories

- **Phishing** — Phishing URL feeds and verification (OpenPhish, PhishTank, PhishStats)
- **IOC Databases** — IOC aggregation, extraction, and sharing (AlienVault OTX, Maltiverse, Pulsedive, Cymon, MISP)
- **Threat Feeds** — Curated threat intelligence feeds (FireHOL, Mr.Looquer, REScure, Malware Patrol, mlsecproject/combine)
- **C2 Tracking** — Command-and-control infrastructure detection (HoneyDB, Project Honey Pot, Bot Scout)
- **Ransomware** — Ransomware campaign tracking and IOC correlation via threat platforms
- **APT Groups** — Advanced persistent threat research and campaign analysis (APTnotes, MITRE ATT&CK, IBM X-Force Exchange)
- **STIX/TAXII** — Structured threat sharing using STIX format and TAXII transport (MISP, ThreatIngestor, OpenTAXII)

## Investigation Workflow

1. **Define scope**: Identify the indicator type (IP, domain, hash, URL, email) and investigation objective
2. **Extract IOCs**: Use iocextract or IOC Parser to pull indicators from reports, emails, or raw text
3. **Deduplicate and normalize**: Run Cacador to deduplicate extracted indicators; use combine to normalize across feeds
4. **Enrich indicators**: Query threat platforms (AlienVault OTX, Pulsedive, IBM X-Force) for context, risk scores, and related campaigns
5. **Check phishing feeds**: Cross-reference URLs against OpenPhish, PhishTank, and PhishStats
6. **Map to TTPs**: Correlate findings with MITRE ATT&CK techniques; check APTnotes for related campaigns
7. **Aggregate and share**: Ingest results into MISP or use ThreatIngestor for automated feed processing
8. **Pivot to related categories**: Use cross-category pivots below for deeper investigation

## Cross-Category Pivots

| Finding | Pivot To | Reason |
| --------- | ---------- | -------- |
| Malicious file hash or sample | `malicious-file-analysis` | Analyze malware samples, check VirusTotal, run sandbox detonation |
| CVE or exploit reference in threat report | `exploits-advisories` | Look up vulnerability details, check exploit availability, assess patch status |
| Suspicious domain in IOC feed | `domain-recon` | WHOIS, DNS, subdomain enumeration, certificate transparency, reputation check |
| Suspicious IP in threat feed | `ip-address-recon` | Geolocation, ASN, reverse DNS, port scanning, blocklist membership |

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Threat Intelligence tool search",
  prompt="Find OSINT tools for Threat Intelligence.\n
    Read skills/threat-intelligence/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Threat Intelligence investigation: [target]",
  prompt="Investigate using Threat Intelligence tools: [target]\n\n
    Primary: Read skills/threat-intelligence/references/tools.md\n
    Secondary: Read skills/malicious-file-analysis/references/tools.md\n
    Execute available CLI tools (iocextract, cacador, hostintel),
    query web resources, report findings.\n
    Start with passive extraction and enrichment before active queries."
)
```

## OPSEC Notes

- **All command-line tools listed are passive** -- they process local data or query public feeds without touching the target directly.
- **iocextract and IOC Parser** operate entirely offline on local text; no network requests are made during extraction.
- **ThreatIngestor and combine** pull from public feeds; your source IP is visible to feed providers. Use a VPN or proxy if source attribution matters.
- **MISP instances** can be configured for sharing; ensure sharing groups and distribution levels are set correctly before publishing events to avoid leaking investigation details.
- **API-based lookups** (AlienVault OTX, Pulsedive, IBM X-Force) log your query. Assume the indicator owner may monitor lookup activity on these platforms.
- **PhishTank submissions** are public -- do not submit indicators you want to keep confidential.
- **Rate limiting**: Most free-tier APIs enforce rate limits. Cache responses locally to avoid repeated queries and potential account suspension.
