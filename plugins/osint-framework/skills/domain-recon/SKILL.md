---
name: domain-recon
description: >-
  Domain name reconnaissance — WHOIS, DNS records, subdomains,
  certificates, reputation, and hosting analysis. Use when the user
  wants to investigate a domain, find subdomains, check DNS records,
  look up WHOIS data, analyze SSL certificates, or assess domain
  reputation. Activates for "domain lookup", "WHOIS", "DNS records",
  "subdomains", "find subdomains", "certificate transparency",
  "who owns this domain", "domain reputation", "hosting provider".
user-invocable: false
---

# Domain Reconnaissance

Comprehensive domain investigation — WHOIS, DNS, subdomains,
certificates, reputation, hosting, and technology detection.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/domain-recon/references/tools.md` for the complete
list of 131 free tools in this category — the largest category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| subfinder | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` | `subfinder -d domain.com` |
| amass | `go install github.com/owasp-amass/amass/v4/...@master` | `amass enum -d domain.com` |
| dnsrecon | `pip install dnsrecon` | `dnsrecon -d domain.com` |
| whois | Pre-installed on most systems | `whois domain.com` |
| dig | Pre-installed on most systems | `dig domain.com ANY` |
| nslookup | Pre-installed on most systems | `nslookup domain.com` |
| httpx | `go install github.com/projectdiscovery/httpx/cmd/httpx@latest` | `echo domain.com \| httpx` |
| dnsx | `go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest` | `echo domain.com \| dnsx` |

## Subcategories

- **Whois Records** — Domain ownership and registration data
- **Subdomains** — Enumerate subdomains via DNS, certificates, scraping
- **Discovery** — Find related domains, reverse lookups
- **DNS Records** — A, AAAA, MX, TXT, NS, CNAME, SOA records
- **Certificate Transparency** — CT log searching
- **Domain Reputation** — Blocklists, malware association, trust scores
- **Domain History** — Historical WHOIS, DNS changes, archived content
- **Site Technology** — Detect CMS, frameworks, servers, analytics
- **URL Analysis** — Expand shortened URLs, check redirects
- **Vulnerability Scanning** — Check for known vulnerabilities

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Domain tool search",
  prompt="Find OSINT tools for domain reconnaissance.\n
    Read skills/domain-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Domain investigation: [target]",
  prompt="Investigate domain: [target]\n\n
    Primary: Read skills/domain-recon/references/tools.md\n
    Secondary: Read skills/ip-address-recon/references/tools.md\n
    Execute available CLI tools (whois, dig, subfinder), query web
    resources, report findings.\n
    Start with passive tools (WHOIS, DNS) before active scanning."
)
```

## Investigation Workflow

1. **WHOIS**: Check domain ownership and registration dates
2. **DNS**: Enumerate all record types (A, MX, TXT, NS, etc.)
3. **Subdomains**: Run subfinder/amass for subdomain enumeration
4. **Certificates**: Search CT logs for related certificates
5. **Technology**: Identify web server, CMS, frameworks
6. **IP pivot**: Resolve IPs, then investigate with `ip-address-recon`
7. **Reputation**: Check against blocklists and threat feeds

## Executable Pipelines

For copy-paste-ready command sequences with output parsing, see:
`skills/osint-catalog/references/investigation-pipelines.md` — Section 3: Domain Investigation Pipeline

Quick one-liner:

```bash
whois TARGET | grep -iE 'registrant|creation|expir' && dig TARGET ANY +short && subfinder -d TARGET -silent | head -20
```
