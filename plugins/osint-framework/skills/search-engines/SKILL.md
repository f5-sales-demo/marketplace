---
name: search-engines
description: >-
  General and specialized search engines — Google dorking, code search,
  academic research, and passive Google dork automation. Use when the
  user wants to search the web, find code repositories, discover
  academic papers, automate Google dorks, or scan for leaked secrets.
  Activates for "search engine", "Google dork", "code search",
  "academic search", "secret scanning", "GitHub dorks", "pagodo",
  "gitleaks", "gitrob".
user-invocable: false
---

# Search Engines

General and specialized search engines — Google dorking, code search,
academic research, and passive dork automation.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/search-engines/references/tools.md` for the complete
list of 73 free tools in this category.

## Key CLI Tools

| Tool | Install | Alt Install | Usage |
|------|---------|-------------|-------|
| Stract | `git clone https://github.com/StractOrg/stract && cd stract && cargo build --release` | Docker: `docker pull stract/stract` | Open-source search engine with customizable Optics filtering |
| Gitrob | `go install github.com/michenriksen/gitrob@latest` | Docker: `docker pull michenriksen/gitrob` | `gitrob <org-or-user>` -- scans GitHub repos for sensitive files |
| Github-Dorks | `pip install github-dorks` | `git clone https://github.com/techgaun/github-dorks && pip install -r requirements.txt` | `github-dork.py -u <user>` -- automated GitHub secret search |
| GitLeaks | `go install github.com/gitleaks/gitleaks@latest` | Brew: `brew install gitleaks`; Docker: `docker pull ghcr.io/gitleaks/gitleaks:latest`; Binary: download from GitHub releases | `gitleaks detect -s <repo-path>` -- scan repos for hardcoded secrets |
| Lazy Scholar | Browser extension install from https://lazyscholar.org/ | `git clone https://github.com/AaronC81/lazy-scholar` | Finds free full-text versions of paywalled papers |
| pagodo | `pip install pagodo` | `git clone https://github.com/opsdisk/pagodo && pip install -r requirements.txt` | `pagodo -d <domain> -g dorks.txt` -- passive Google dork enumeration |

### Dockerfile Install Examples

```dockerfile
# GitLeaks (Go binary -- recommended for CI/CD)
RUN go install github.com/gitleaks/gitleaks@latest

# GitLeaks (Docker-in-Docker)
# docker pull ghcr.io/gitleaks/gitleaks:latest

# GitLeaks (binary release)
RUN curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_arm64.tar.gz \
    | tar xz -C /usr/local/bin gitleaks

# Gitrob
RUN go install github.com/michenriksen/gitrob@latest

# Github-Dorks
RUN pip install --no-cache-dir github-dorks

# pagodo
RUN pip install --no-cache-dir pagodo

# Stract (from source -- requires Rust toolchain)
RUN git clone --depth 1 https://github.com/StractOrg/stract /opt/stract \
    && cd /opt/stract && cargo build --release
```

## Subcategories

- **General Search** -- Google, Bing, DuckDuckGo, Yandex, Baidu, Brave, Mojeek, Swisscows, StartPage
- **Code Search** -- Searchcode, PublicWWW, NerdyData, Gitrob, Github-Dorks, GitLeaks
- **Academic/Research** -- Google Scholar, PubMed, BASE, arXiv, JURN, Open Library, Lazy Scholar
- **Shodan/IoT** -- Cross-reference with `threat-intelligence` skill for Shodan, Censys, ZoomEye
- **Social Media Search** -- Cross-reference with `social-networks` skill
- **Data Breaches** -- GitLeaks for credential exposure; cross-reference with `compliance-risk` skill
- **Dark Web** -- Cross-reference with `dark-web` skill for onion search engines

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Search Engines tool search",
  prompt="Find OSINT tools for Search Engines.\n
    Read skills/search-engines/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Search Engines investigation: [target]",
  prompt="Investigate using Search Engines tools: [target]\n\n
    Primary: Read skills/search-engines/references/tools.md\n
    Secondary: Read skills/domain-recon/references/tools.md\n
    Execute available CLI tools (gitleaks, pagodo, github-dorks),
    query web resources, report findings.\n
    Start with passive tools (Google dorks, code search) before
    active scanning (Gitrob, GitLeaks)."
)
```

## Investigation Workflow

1. **Define scope**: Determine target type -- domain, organization, person, or topic
2. **Passive web search**: Use Google, Bing, DuckDuckGo with advanced operators (site:, intitle:, filetype:)
3. **Google dorking**: Use pagodo to automate GHDB dorks against the target domain
4. **Code search**: Search PublicWWW and Searchcode for analytics IDs, API endpoints, or tech fingerprints
5. **Secret scanning**: Run GitLeaks on target repositories; use Github-Dorks for exposed credentials
6. **GitHub recon**: Run Gitrob against target organization to find sensitive files in commit history
7. **Academic lookup**: Search Google Scholar, PubMed, BASE for research papers related to target
8. **Aggregate and pivot**: Combine findings and pivot to `domain-recon`, `ip-address-recon`, or `social-networks`

## Cross-Category Pivots

| Finding | Pivot To |
|---------|----------|
| Domain or URL discovered | `domain-recon` -- WHOIS, DNS, subdomains |
| IP address found | `ip-address-recon` -- geolocation, ASN, port scanning |
| Email address in code | `email-recon` -- breach checks, linked accounts |
| Username in commit history | `username-recon` -- cross-platform enumeration |
| Social media profile | `social-networks` -- profile analysis |
| API key or credential | `compliance-risk` -- exposure assessment |
| Onion link discovered | `dark-web` -- hidden service analysis |
| Suspicious image/media | `disinfo-verification` -- manipulation detection |

## OPSEC Notes

- **Google dorking** is passive but high-volume queries may trigger CAPTCHAs or IP bans; use pagodo with proxies (HTTP/SOCKS5)
- **Gitrob** and **Github-Dorks** make authenticated GitHub API calls -- use a dedicated token, not personal credentials
- **GitLeaks** scans local clones and is fully offline once the repo is cloned
- **Stract** can be self-hosted for zero-leakage search operations
- Use privacy-preserving search engines (DuckDuckGo, StartPage, Brave) to avoid associating queries with your identity
- Rotate search engines to avoid rate-limiting and to get broader coverage
- Consider using a VPN or Tor for sensitive queries on clearnet search engines
