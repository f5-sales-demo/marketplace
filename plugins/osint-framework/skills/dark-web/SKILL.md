---
name: dark-web
description: >-
  Dark web monitoring, onion service analysis, and anonymous network
  intelligence — Tor, Freenet, I2P. Use when the user wants to
  investigate hidden services, scan onion sites, crawl the dark web,
  or monitor dark web activity. Activates for "dark web", "onion",
  "tor", "darknet", "hidden service", "dark web monitoring", "i2p",
  "freenet", "onionscan", "torbot".
user-invocable: false
---

# Dark Web

Dark web monitoring, onion service analysis, and anonymous network
intelligence — Tor, Freenet, and I2P.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Dark web research
carries elevated legal and ethical risk. Ensure proper authorization
before active scanning of hidden services.

## Tools Reference

Read `skills/dark-web/references/tools.md` for the complete
list of 13 free tools in this category.

## Key command-line tools

| Tool | Install | Alt Install | Usage |
| ------ | --------- | ------------- | ------- |
| Tor Download | Apt: `apt-get install -y tor torbrowser-launcher` | Binary: download from <https://www.torproject.org/download/> | `tor` -- starts Tor SOCKS proxy on port 9050 |
| Freenet Project | `curl -sSL https://www.hyphanet.org/assets/jnlp/freenet_installer.jar -o freenet.jar && java -jar freenet.jar` | Docker: build from source at <https://github.com/hyphanet/fred> | Runs Freenet/Hyphanet node for anonymous content distribution |
| I2P Anonymous Network | Apt: `apt-get install -y i2p` | Binary: download from <https://geti2p.net/en/download;> Docker: `docker pull geti2p/i2p` | `i2prouter start` -- starts I2P router for anonymous network access |
| OnionScan | `go install github.com/s-rah/onionscan@latest` | `git clone https://github.com/s-rah/onionscan && cd onionscan && go build` | `onionscan <target.onion>` -- scans onion services for metadata leaks |
| TorBot | `pip install torbot` | `git clone https://github.com/DedSecInside/TorBot && pip install -r requirements.txt` | `torbot -u <seed-onion-url>` -- crawls and indices .onion links |
| Onioff | `pip install onioff` | `git clone https://github.com/k4m4/onioff && pip install -r requirements.txt` | `onioff <onion-url>` -- checks reachability and extracts metadata |

### Dockerfile Install Examples

```dockerfile
# Tor (system package -- recommended)
RUN apt-get update && apt-get install -y --no-install-recommends tor \
    && rm -rf /var/lib/apt/lists/*

# I2P (system package)
RUN apt-get update && apt-get install -y --no-install-recommends i2p \
    && rm -rf /var/lib/apt/lists/*

# I2P (Docker)
# docker pull geti2p/i2p

# OnionScan (Go)
RUN go install github.com/s-rah/onionscan@latest

# OnionScan (from source)
RUN git clone --depth 1 https://github.com/s-rah/onionscan /opt/onionscan \
    && cd /opt/onionscan && go build -o /usr/local/bin/onionscan

# TorBot
RUN pip install --no-cache-dir torbot

# Onioff
RUN pip install --no-cache-dir onioff

# Freenet/Hyphanet (requires JRE)
RUN apt-get update && apt-get install -y --no-install-recommends default-jre-headless \
    && curl -sSL https://www.hyphanet.org/assets/jnlp/freenet_installer.jar \
       -o /tmp/freenet.jar \
    && rm -rf /var/lib/apt/lists/*
```

## Subcategories

- **General Info** -- Reddit communities (r/deepweb, r/onions, r/darknet), IACA investigation support
- **Tor** -- Tor Browser, Tor daemon, Ahmia search engine, Hunchly hidden services report
- **Freenet** -- Hyphanet node for decentralized anonymous publishing and file sharing
- **I2P** -- I2P router for anonymous overlay network with eepsites and messaging
- **Onion scanning** -- OnionScan for metadata leaks, TorBot for crawling, Onioff for link inspection
- **Dark web monitoring** -- Ahmia for onion search, Hunchly for daily hidden service feeds, Onion Cab directory

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Dark Web tool search",
  prompt="Find OSINT tools for Dark Web.\n
    Read skills/dark-web/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Dark Web investigation: [target]",
  prompt="Investigate using Dark Web tools: [target]\n\n
    Primary: Read skills/dark-web/references/tools.md\n
    Secondary: Read skills/threat-intelligence/references/tools.md\n
    Execute available CLI tools (tor, onionscan, torbot, onioff),
    query web resources (Ahmia, Hunchly), report findings.\n
    Start with passive discovery (Ahmia search, Reddit intel) before
    active scanning (OnionScan, TorBot)."
)
```

## Investigation Workflow

1. **Passive discovery**: Search Ahmia.fi for indexed onion services matching keywords
2. **Community intel**: Check Reddit communities (r/deepweb, r/onions, r/darknet) for chatter and leads
3. **Link validation**: Use Onioff to check reachability and extract metadata from .onion URLs
4. **Crawling**: Deploy TorBot with seed URLs to discover linked onion services
5. **Metadata scanning**: Run OnionScan against targets to detect OPSEC failures (server headers, SSH keys, analytics, clearnet leaks)
6. **Monitoring**: Set up Hunchly hidden services report feeds for ongoing new-service alerts
7. **Pivot to clearnet**: Cross-reference discovered IPs, emails, or domains with clearnet OSINT skills

## Cross-Category Pivots

| Finding | Pivot To |
| --------- | ---------- |
| Clearnet IP leaked via OnionScan | `ip-address-recon` -- geolocation, ASN, hosting |
| Email address found on hidden service | `email-recon` -- breach checks, linked accounts |
| Domain reference on .onion page | `domain-recon` -- WHOIS, DNS, subdomains |
| Username on dark web forum | `username-recon` -- cross-platform enumeration |
| Cryptocurrency address found | `blockchain-crypto` -- transaction tracing |
| Suspicious media on marketplace | `disinfo-verification` -- manipulation detection |
| Threat actor indicators | `threat-intelligence` -- IOC enrichment |
| Leaked credentials discovered | `compliance-risk` -- exposure assessment |

## OPSEC Notes

- **NEVER** access dark web resources from your primary network without Tor or a dedicated research VM
- **OnionScan** and **TorBot** make active connections to .onion targets -- they can be logged by the target operator
- Route all dark web tool traffic through Tor SOCKS proxy (127.0.0.1:9050) -- most tools support `--proxy` flags
- Use a dedicated, ephemeral VM or container for dark web research; destroy after use
- Do not log in to any dark web service with real credentials
- **I2P** and **Freenet** traffic patterns differ from Tor -- understand the anonymity model of each before use
- Store investigation artifacts in encrypted volumes; never mix dark web evidence with clearnet data
- Be aware that some jurisdictions restrict Tor usage or dark web access -- verify local laws first
- Use Tails OS or Whonix for maximum compartmentalization during sensitive investigations
