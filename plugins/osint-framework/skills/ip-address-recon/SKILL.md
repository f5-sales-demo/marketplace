---
name: ip-address-recon
description: >-
  IP geolocation, port scanning, ASN lookup, MAC vendor identification,
  and network reputation. Use when the user mentions: IP lookup,
  geolocation, port scan, ASN, MAC address, network reputation,
  IP reputation, BGP, CIDR, wireless network, packet capture.
user-invocable: false
---

**Canonical skill URI**: `skill://osint-framework:ip-address-recon`

# IP & MAC Address Reconnaissance

Comprehensive IP and MAC address investigation — geolocation, port
discovery, ASN/BGP analysis, reputation checks, wireless network
mapping, and network traffic analysis.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Active scanning
(port scanning, network probing) may be illegal without authorization.

## Tools Reference

Read `skills/ip-address-recon/references/tools.md` for the complete
list of 55 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| Nmap | `apt install nmap` / `brew install nmap` / `snap install nmap` | `nmap -sV -O 192.168.1.0/24` |
| Scanless | `pip install scanless` / `git clone https://github.com/vesche/scanless && cd scanless && pip install .` | `scanless -t 192.0.2.8 -s yougetsignal` |
| Masscan | `apt install masscan` / `brew install masscan` / `git clone https://github.com/robertdavidgraham/masscan && cd masscan && make` | `masscan -p1-65535 10.0.0.0/8 --rate=10000` |
| CloudFail | `pip install cloudfail` / `git clone https://github.com/m0rtem/CloudFail && cd CloudFail && pip install -r requirements.txt` | `python3 cloudfail.py -t target.com` |
| Wireshark | `apt install wireshark` / `brew install --cask wireshark` / `snap install wireshark` | `tshark -i eth0 -f "host 192.168.1.1" -w capture.pcap` |
| NetworkMiner | `apt install mono-complete && wget https://www.netresec.com/files/NetworkMiner.zip` / `brew install --cask networkminer` | `mono NetworkMiner.exe capture.pcap` |
| checkip | `go install github.com/jreisinger/checkip@latest` / `git clone https://github.com/jreisinger/checkip && cd checkip && go build` | `checkip 192.0.2.8` |

## Subcategories

- **Geolocation** — Map IP addresses to physical locations, coordinates, and ISP data (MaxMind, IP2Location, DB-IP, IP Location Finder)
- **Port Discovery** — Identify open ports and running services on target hosts (Nmap, Masscan, Scanless, Shodan, Portmap)
- **Reputation** — Check IPs against blocklists, threat feeds, and honeypot data (IP Void, Grey Noise, Blocklist.de, DShield, FireHOL, Project Honey Pot, ExoneraTor, Criminal IP)
- **ASN/BGP** — Map IP addresses to autonomous systems, routing prefixes, and peering relationships (ASlookup, Team Cymru, Hurricane Electric BGP Toolkit, PeeringDB, BGP Tools, CIDR Report)
- **MAC Vendor** — Identify hardware manufacturer from MAC address OUI prefix
- **Wireless** — Map Wi-Fi networks, cell towers, and signal coverage (WiGLE, OpenCellid)
- **Network Visualization** — Capture and analyze network traffic, extract artifacts (Wireshark, NetworkMiner, Packet Total)

## Investigation Workflow

1. **Passive lookup**: Start with geolocation (MaxMind, IP2Location) and WHOIS to identify location, ISP, and ownership
2. **ASN/BGP mapping**: Resolve the IP to its autonomous system using Team Cymru or ASlookup; enumerate the full prefix and peering relationships
3. **Reputation check**: Query blocklists (IP Void, Blocklist.de, FireHOL) and threat intelligence (Grey Noise, DShield, Criminal IP) for malicious activity history
4. **Neighbor discovery**: Run reverse IP lookups (IP Fingerprints, Bing ip: dork, DNSlytics) to find co-hosted domains
5. **Port discovery** (active, requires authorization): Scan with Nmap or Masscan to enumerate open ports and service versions
6. **Cloud bypass**: If target is behind Cloudflare, use CloudFail or CrimeFlare to attempt origin IP discovery
7. **Traffic analysis**: Capture and analyze packets with Wireshark/tshark or NetworkMiner for deeper forensic context
8. **MAC/wireless pivot**: If investigating a local network, use MAC OUI lookup for hardware identification and WiGLE for wireless network mapping

## Executable Pipelines

For copy-paste-ready command sequences with output parsing, see:
`skills/osint-catalog/references/investigation-pipelines.md` — Section 4: IP Address Investigation Pipeline

Quick one-liner:

```bash
curl -s "https://ipinfo.io/TARGET/json" | jq '{ip,city,region,country,org}' && whois TARGET | grep -iE 'netname|orgname|country' | head -5
```

## Cross-Category Pivots

- **domain-recon** — Reverse-resolve IPs to domains, then pivot to WHOIS, subdomain enumeration, and certificate transparency searches
- **geolocation** — Feed IP geolocation coordinates into physical location analysis and mapping tools
- **threat-intelligence** — Correlate IP reputation data with broader threat feeds, IOC databases, and malware campaign tracking

## OPSEC Notes

**Passive (no target interaction):**

- WHOIS lookups, geolocation queries, ASN/BGP lookups
- Reputation checks against blocklists and threat feeds
- Reverse IP / neighbor domain lookups via third-party databases
- Cached scan data from Shodan, Censys, Netlas (querying their index, not the target)

**Active (direct target interaction -- requires authorization):**

- Port scanning with Nmap, Masscan, or online port scanners
- CloudFail origin-IP enumeration against Cloudflare-protected targets
- Packet capture with Wireshark/tshark on networks you control
- Traceroute and active DNS probing (utrace)

Use Scanless for proxy-based port scanning when you need to reduce your
fingerprint. Always prefer passive data sources before active scanning.

## Delegation

### Tool Lookup

```text
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="IP & MAC Address tool search",
  prompt="Find OSINT tools for IP & MAC Address.\n
    Read skills/ip-address-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```text
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="IP & MAC Address investigation: [target]",
  prompt="Investigate using IP & MAC Address tools: [target]\n\n
    Primary: Read skills/ip-address-recon/references/tools.md\n
    Secondary: Read skills/domain-recon/references/tools.md\n
    Execute available CLI tools (nmap, checkip, tshark), query web
    resources, report findings.\n
    Start with passive tools (geolocation, WHOIS, reputation) before
    active scanning."
)
```
