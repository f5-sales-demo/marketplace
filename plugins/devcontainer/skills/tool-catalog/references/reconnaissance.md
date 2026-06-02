# Reconnaissance & OSINT Tools

> **Important**: These tools are intended for authorized security testing, bug bounty programs, and defensive research only. Always obtain proper written authorization before performing reconnaissance against any target. Unauthorized scanning or enumeration may violate laws and terms of service.

---

## Subdomain & Domain Enumeration

## subfinder

- **Package**: `subfinder` via manual download (ProjectDiscovery)
- **Purpose**: Fast passive subdomain enumeration using multiple public sources (APIs, certificate transparency, search engines)
- **Use when**: Mapping an organization's external attack surface, discovering subdomains for authorized pen testing or bug bounty
- **Quick start**:
  - `subfinder -d example.com`
  - `subfinder -d example.com -o subdomains.txt`
  - `subfinder -dL domains.txt -silent | sort -u`
- **Auth**: None required (optional API keys for Shodan, VirusTotal, Censys improve results — configure in `~/.config/subfinder/provider-config.yaml`)
- **Docs**: <https://github.com/projectdiscovery/subfinder>

## amass

- **Package**: `amass` via manual download (OWASP)
- **Purpose**: In-depth DNS enumeration and network mapping using active and passive techniques
- **Use when**: Comprehensive subdomain discovery, mapping network infrastructure, building a full domain inventory
- **Quick start**:
  - `amass enum -passive -d example.com`
  - `amass enum -d example.com -o results.txt`
  - `amass intel -whois -d example.com`
- **Auth**: None required (optional API keys for data sources improve results — configure in `~/.config/amass/config.yaml`)
- **Docs**: <https://github.com/owasp-amass/amass>

## fierce

- **Package**: `fierce` via pip
- **Purpose**: DNS reconnaissance tool for locating non-contiguous IP space and subdomains
- **Use when**: Quick DNS enumeration, finding targets adjacent to known hosts, lightweight recon
- **Quick start**:
  - `fierce --domain example.com`
  - `fierce --domain example.com --subdomains www mail vpn`
  - `fierce --domain example.com --dns-servers 8.8.8.8`
- **Auth**: None
- **Docs**: `fierce --help`

---

## URL & Endpoint Discovery

## gau

- **Package**: `gau` via manual download (getallurls)
- **Purpose**: Fetch known URLs from AlienVault OTX, Wayback Machine, and Common Crawl for a given domain
- **Use when**: Discovering historical endpoints, finding forgotten or hidden paths, expanding attack surface knowledge
- **Quick start**:
  - `gau example.com`
  - `gau --threads 5 example.com | grep "\.js$"`
  - `gau --subs --o urls.txt example.com`
- **Auth**: None
- **Docs**: <https://github.com/lc/gau>

## waybackurls

- **Package**: `waybackurls` via manual download (amd64 only)
- **Purpose**: Fetch all URLs known to the Wayback Machine for a domain
- **Use when**: Finding archived pages, discovering old endpoints that may still be live, historical URL analysis
- **Quick start**:
  - `echo "example.com" | waybackurls`
  - `echo "example.com" | waybackurls | sort -u > urls.txt`
  - `cat domains.txt | waybackurls | grep "api"`
- **Auth**: None
- **Docs**: <https://github.com/tomnomnom/waybackurls>

## httpx

- **Package**: `httpx` via manual download (ProjectDiscovery)
- **Purpose**: Fast HTTP probing tool with technology detection, status codes, titles, and content inspection
- **Use when**: Probing discovered subdomains for live web servers, identifying web technologies, bulk HTTP analysis
- **Quick start**:
  - `subfinder -d example.com | httpx`
  - `cat subdomains.txt | httpx -status-code -title -tech-detect`
  - `httpx -l urls.txt -mc 200 -o live.txt`
- **Auth**: None
- **Docs**: <https://github.com/projectdiscovery/httpx>

---

## Web Reconnaissance

## recon-ng

- **Package**: Git clone at `/opt/recon-ng/`
- **Purpose**: Full-featured web reconnaissance framework with modular architecture (similar to Metasploit for recon)
- **Use when**: Structured reconnaissance campaigns, correlating data from multiple sources, building target profiles
- **Quick start**:
  - `cd /opt/recon-ng && python3 recon-ng`
  - `modules search` (inside recon-ng shell)
  - `marketplace install all` (install all available modules)
- **Auth**: Various API keys depending on modules used (Shodan, BuiltWith, GitHub, etc.) — configure with `keys add`
- **Docs**: <https://github.com/lanmaster53/recon-ng>

## spiderfoot

- **Package**: Git clone at `/opt/spiderfoot/`
- **Purpose**: OSINT automation tool that queries 200+ data sources to gather intelligence on IPs, domains, emails, and more
- **Use when**: Automated OSINT gathering, investigating threat actors, mapping digital footprints
- **Quick start**:
  - `cd /opt/spiderfoot && python3 sf.py -l 127.0.0.1:5001` (web UI)
  - `python3 sf.py -s example.com -t DOMAIN_NAME -o output.csv`
  - `python3 sf.py -s "target@email.com" -t EMAILADDR`
- **Auth**: Optional API keys for enhanced data sources (configure via web UI settings)
- **Docs**: <https://github.com/smicallef/spiderfoot>

## theHarvester

- **Package**: `theHarvester` via pip
- **Purpose**: Gathers emails, subdomains, hosts, employee names, and open ports from public sources (search engines, PGP servers, LinkedIn, etc.)
- **Use when**: Early-stage reconnaissance, building target email lists, discovering publicly exposed assets
- **Quick start**:
  - `theHarvester -d example.com -b all`
  - `theHarvester -d example.com -b google,bing,linkedin -l 500`
  - `theHarvester -d example.com -b all -f report.html`
- **Auth**: None required (optional API keys for Shodan, Hunter.io, and others improve results)
- **Docs**: <https://github.com/laramies/theHarvester>
