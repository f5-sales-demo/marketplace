# IP & MAC Address — OSINT Tools Reference

> Auto-generated from arf.json. 55 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Geolocation
- Host / Port Discovery
- IPv4
- IPv6
- BGP
- Reputation
- Blacklists
- Neighbor Domains
- Protected by Cloud Services
- Wireless Network Info
- Network Analysis Tools
- IP Loggers

---

### MaxMind Demo

- **URL**: <https://www.maxmind.com/en/home>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick IP geolocation
- **Input**: IP address
- **Output**: Country, region, city, coordinates, ASN
- **Description**: Web-based IP geolocation demo with location, ASN, and network data from MaxMind's GeoIP database.

### IPv4/IPv6 lists by country code

- **URL**: <https://github.com/ipverse/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Country-level IP enumeration
- **Input**: Country code
- **Output**: IP ranges in CIDR notation
- **Description**: Database of IPv4 and IPv6 address ranges organized by country for geographic IP filtering.

### IP2Location.com

- **URL**: <https://www.ip2location.com/demo>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Accurate geolocation with proxy detection
- **Input**: IP address
- **Output**: Location, ASN, proxy type, VPN status, timezone
- **Description**: Commercial IP geolocation service with free demo and database. Provides location, proxy detection, and network data.

### IP Fingerprints

- **URL**: <https://ipfingerprints.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Find domains on shared hosting
- **Input**: IP address
- **Output**: List of domains on IP
- **Description**: Reverse IP lookup service identifying all domains hosted on a given IP address.

### DB-IP

- **URL**: <https://db-ip.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Accurate IP geolocation with developer API
- **Input**: IP address
- **Output**: Location, timezone, ISP, coordinates
- **Description**: Lightweight IP geolocation API covering 46M+ IPv4/IPv6 blocks with city-level accuracy.

### IP Location Finder

- **URL**: <https://www.iplocation.net/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick IP location with maps
- **Input**: IP address
- **Output**: City, coordinates, ISP, hostname
- **Description**: Web-based tool for IP geolocation with maps and detailed location information.

### Info Sniper

- **URL**: <https://www.infosniper.net/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Multi-field reverse lookup (IP/email/phone)
- **Input**: IP, email, or phone
- **Output**: Associated accounts and social profiles
- **Description**: Multi-field reverse OSINT tool for IP, email, phone lookups with social media enumeration.

### utrace

- **URL**: <https://en.utrace.de/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: IP location and traceroute
- **Input**: IP or hostname
- **Output**: Location, ASN, reverse DNS, route path
- **Description**: IP geolocation and reverse DNS lookup tool with network traceroute visualization.

### urlscan.io

- **URL**: <https://urlscan.io/search/#*>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: URL/domain scanning for malware and phishing
- **Input**: URL or domain
- **Output**: Screenshot, DNS, IP, certificates, cookies
- **Description**: Website scanner analyzing URLs and domains for malicious content with infrastructure intelligence.

### Spyse

- **URL**: <https://spyse.com/search/ip>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Internet asset discovery and reconnaissance
- **Input**: IP, domain, email, organization
- **Output**: Subdomains, services, vulnerabilities, data breaches
- **Description**: Internet assets search engine collecting and analyzing public data for attack surface management.

### Shodan

- **URL**: <https://www.shodan.io/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Find exposed IoT and network services
- **Input**: IP, port, service type
- **Output**: Service banners, open ports, vulnerabilities, location
- **Description**: Search engine for internet-connected devices, providing visibility into exposed services and vulnerabilities.

### Netlas.io

- **URL**: <https://netlas.io/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Internet asset reconnaissance with web, DNS, WHOIS
- **Input**: IP, domain, ASN
- **Output**: Open ports, services, certificates, DNS records, WHOIS
- **Description**: Comprehensive internet scanning platform with OSINT, DNS, and WHOIS data. Free tier: 50 requests/day.

### Portmap

- **URL**: <https://portmap.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Port scanning and service discovery
- **Input**: IP address or hostname
- **Output**: Open ports, service types, versions
- **Description**: Port mapping tool that scans for open ports and services on target IP addresses.

### Scans.io

- **URL**: <https://scans.io/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Historical internet scan data access
- **Input**: IP or domain
- **Output**: Historical scan results, service history
- **Description**: Archive of internet-wide scan data including censys scans and other reconnaissance data.

### Nmap (T)

- **URL**: <https://nmap.org/download.html>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Network reconnaissance and port scanning
- **Input**: IP range or hostname
- **Output**: Open ports, OS type, service versions, MAC addresses
- **Description**: Open-source network mapping and port scanning tool with OS detection and service version identification.

### Online Port scanner

- **URL**: <https://portscanner.online/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick port scanning without tools
- **Input**: IP address and port range
- **Output**: Open ports, response times
- **Description**: Web-based port scanner checking open ports on target IP addresses without installation.

### Internet Census Search

- **URL**: <https://www.exfiltrated.com/querystart.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Search open services and devices
- **Input**: Service type, IP range, port
- **Output**: List of exposed services and IPs
- **Description**: Search interface for the Shodan-like internet census data and open services.

### Criminal IP Search

- **URL**: <https://www.criminalip.io/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: IP reputation and malicious activity analysis
- **Input**: IP address
- **Output**: Threat reports, activity logs, attack types
- **Description**: IP reputation and threat intelligence platform analyzing malicious IP addresses and attacks.

### Scanless (T)

- **URL**: <https://github.com/vesche/scanless>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Stealthy port scanning via proxies
- **Input**: IP and port
- **Output**: Open port results
- **Description**: Command-line tool for port scanning without leaving traces on target using third-party services.

### Masscan (T)

- **URL**: <https://github.com/robertdavidgraham/masscan>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Large-scale network port scanning
- **Input**: IP range
- **Output**: Open ports, response times
- **Description**: Ultra-fast TCP port scanner designed for scanning large IP ranges and entire networks.

### ASlookup.com

- **URL**: <https://aslookup.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: BGP and ASN lookup
- **Input**: ASN or IP address
- **Output**: IP ranges, organization, peering info
- **Description**: BGP and autonomous system lookup tool for finding IP ranges and ownership information.

### Port scanner Online

- **URL**: <https://portscanner.online/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick port availability checks
- **Input**: IP and port
- **Output**: Port status (open/closed)
- **Description**: Simple web-based port scanner for checking common ports on target IPs.

### Onyphe

- **URL**: <https://www.onyphe.io/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Internet asset discovery and threat intel
- **Input**: IP, domain, CVE
- **Output**: Services, vulnerabilities, certificates, datasources
- **Description**: Cyber defense search engine with internet scanning, threat intelligence, and attack surface management.

### IPv4 CIDR Report

- **URL**: <https://www.cidr-report.org/as2.0/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: CIDR block analysis and subnet enumeration
- **Input**: CIDR block
- **Output**: IP ranges, subnet breakdown
- **Description**: Tool for analyzing IPv4 CIDR blocks and finding contained IP addresses and subnets.

### Reverse.report

- **URL**: <https://reverse.report/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Reverse IP and domain lookups
- **Input**: IP address or domain
- **Output**: Associated domains, subdomains, history
- **Description**: Comprehensive reverse lookup tool for IP to domain, email, and phone number associations.

### Team Cymru IP to ASN

- **URL**: <https://asn.cymru.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: IP to ASN mapping
- **Input**: IP address
- **Output**: ASN, organization, prefix
- **Description**: IP to ASN mapping tool providing autonomous system ownership and prefix information.

### IP to ASN DB

- **URL**: <https://iptoasn.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: IP to ASN lookup with historical data
- **Input**: IP address
- **Output**: ASN, organization, prefix, company info
- **Description**: Database and API service for looking up which ASN owns a given IP address.

### Hacker Target - Reverse DNS

- **URL**: <https://hackertarget.com/reverse-dns-lookup/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Reverse DNS lookup of IP addresses
- **Input**: IP address or range
- **Output**: Associated domains and PTR records
- **Description**: Reverse DNS lookup tool and API finding domain names associated with IP addresses.

### IPv6 CIDR Report

- **URL**: <https://www.cidr-report.org/v6/as2.0/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: IPv6 CIDR block analysis
- **Input**: IPv6 CIDR block
- **Output**: IPv6 ranges, subnet breakdown
- **Description**: CIDR block analysis tool for IPv6 address ranges and subnet enumeration.

### Hurricane Electric BGP Toolkit

- **URL**: <https://bgp.he.net/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: BGP analysis and routing intelligence
- **Input**: ASN, IP range, or prefix
- **Output**: BGP routes, peering, organization info
- **Description**: BGP and network routing analysis tools including AS to prefix lookup and BGP prefix information.

### BGP Malicious Content Ranking

- **URL**: <https://bgpranking.circl.lu/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identify malicious ASNs and networks
- **Input**: ASN or prefix
- **Output**: Threat ranking, malicious activity metrics
- **Description**: Platform ranking ASNs and BGP prefixes by malicious content and security threats.

### PeeringDB

- **URL**: <https://www.peeringdb.com/advanced_search>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Internet peering and AS relationship mapping
- **Input**: ASN, organization, or IX
- **Output**: Peering relationships, exchange points, contacts
- **Description**: Database of internet exchange points, member networks, and AS relationships for network mapping.

### BGP Tools

- **URL**: <https://www.bgp4.as/tools>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: BGP routing and AS analysis
- **Input**: ASN, IP, or prefix
- **Output**: Routes, prefixes, organizations
- **Description**: Collection of BGP analysis and AS number lookup tools for network intelligence.

### IP Void

- **URL**: <https://www.ipvoid.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Check IP reputation and blacklist status
- **Input**: IP address
- **Output**: Threat score, blacklist status, reports
- **Description**: IP reputation and threat intelligence service analyzing blacklist status and security risks.

### ExoneraTor

- **URL**: <https://exonerator.torproject.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Verify Tor relay membership by date
- **Input**: IP address and date
- **Output**: Tor exit/entry node status confirmation
- **Description**: Tool for checking if an IP address belonged to Tor at a specific date.

### Grey Noise

- **URL**: <https://viz.greynoise.io/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Distinguish malicious from benign internet activity
- **Input**: IP address
- **Output**: Classification, scanner type, threat assessment
- **Description**: Platform for analyzing internet background noise and identifying benign scanning activity.

### Blocklist.de

- **URL**: <https://www.blocklist.de/en/index.html>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Check IP blacklist status
- **Input**: IP address
- **Output**: Blacklist status, attack types logged
- **Description**: Community-contributed blocklist of IP addresses involved in attacks and malicious activity.

### DShield API

- **URL**: <https://isc.sans.edu/api/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Query IPs involved in attacks
- **Input**: IP address
- **Output**: Attack reports, threat activity
- **Description**: API and database of security events and IPs involved in attacks monitored by SANS.

### FireHOL IP Lists 

- **URL**: <https://iplists.firehol.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Block malicious/spam IP sources
- **Input**: IP address or list download
- **Output**: Blacklist membership status
- **Description**: Collection of firewall-friendly IP lists for blocking malicious and spam sources.

### Project Honey Pot

- **URL**: <https://www.projecthoneypot.org/list_of_ips.php>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Check IP for spam and attack history
- **Input**: IP address
- **Output**: Threat score, spam reports, attack activity
- **Description**: Global honeypot network collecting spam and attack data with IP reputation service.

### IP Fingerprints - Reverse IP Lookup

- **URL**: <https://ipfingerprints.com/reverseip.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Find domains on shared hosting
- **Input**: IP address
- **Output**: List of domains on IP
- **Description**: Find all domains hosted on a shared IP address through reverse IP lookup.

### Bing IP Search (D)

- **URL**: <https://www.bing.com/search?q=ip%3A8.8.8.8>
- **Type**: Google Dork
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Find domains on IP using Bing index
- **Input**: IP address
- **Output**: Domains indexed by Bing on that IP
- **Description**: Bing search operator for finding domains and subdomains hosted on a specific IP address.

### TCP/IP Utils - Domain Neighbors

- **URL**: <https://dnslytics.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identify related domains on same IP
- **Input**: Domain or IP
- **Output**: Neighbor domains, IP info
- **Description**: Find all domains on the same IP and subdomain information via reverse IP lookups.

### MyIPNeighbors

- **URL**: <https://www.my-ip-neighbors.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Find all domains on same shared IP
- **Input**: IP address
- **Output**: List of domains on IP, subdomains
- **Description**: Reverse IP lookup tool for discovering all domains and subdomains on an IP address.

### CloudFlare Watch

- **URL**: <https://www.crimeflare.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Identify Cloudflare-protected sites
- **Input**: Domain or IP
- **Output**: Cloudflare status, origin IP (if discoverable)
- **Description**: Tool for identifying and analyzing websites protected by Cloudflare's CDN and security services.

### CloudFail (T)

- **URL**: <https://github.com/m0rtem/CloudFail>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Bypass Cloudflare to find origin IP
- **Input**: Domain protected by Cloudflare
- **Output**: Origin IP address (if discoverable)
- **Description**: Tool for finding origin IPs of Cloudflare-protected websites through enumeration techniques.

### WiGLE: Wireless Network Mapping

- **URL**: <https://wigle.net/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Map wireless networks and find signal coverage
- **Input**: Location, SSID, or BSSID
- **Output**: Network locations, signal maps, network details
- **Description**: Global database of wireless networks (WiFi, Bluetooth, cellular) with mapping and signal strength data.

### OpenCellid: Database of Cell Towers

- **URL**: <https://opencellid.org/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Find cellular tower locations and coverage
- **Input**: Cell tower ID or location
- **Output**: Tower coordinates, operator, coverage area
- **Description**: Open database of cellular tower locations and coverage for mobile network geolocation.

### Wireshark

- **URL**: <https://www.wireshark.org/download.html>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Network packet analysis and protocol debugging
- **Input**: Network traffic capture file
- **Output**: Detailed packet analysis, protocol breakdown
- **Description**: Open-source network packet analyzer for deep packet inspection and network troubleshooting.

### NetworkMiner

- **URL**: <https://www.netresec.com/?page=Networkminer>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Network forensics and file extraction from traffic
- **Input**: PCAP network traffic files
- **Output**: Extracted files, metadata, network sessions
- **Description**: Passive network forensics tool for extracting files and data from network traffic captures.

### Packet Total

- **URL**: <https://www.packettotal.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Cloud-based network forensics analysis
- **Input**: PCAP files
- **Output**: Traffic analysis, threat indicators, IoCs
- **Description**: Online platform for uploading and analyzing network packet captures (PCAP files).

### checkip (T)

- **URL**: <https://github.com/jreisinger/checkip>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Display local IP and network info
- **Input**: Local system (no input needed)
- **Output**: Local IP, gateway, DNS servers
- **Description**: Command-line utility for checking local machine IP address and network connectivity.

### Ki.tc

- **URL**: <https://ki.tc>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Generate trackable links to log visitor IPs
- **Input**: Target URL or destination
- **Output**: Tracker link, IP logs, browser info
- **Description**: IP logging service that generates trackable links for IP/browser info collection.

### Grabify

- **URL**: <https://grabify.link>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Shorten URLs and log visitor IPs
- **Input**: URL to shorten
- **Output**: Short URL with IP logging
- **Description**: URL shortener service that logs IP addresses and device information of link clickers.

### IP Logger

- **URL**: <https://iplogger.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Track visitor IPs through shortened links
- **Input**: URL to wrap
- **Output**: Logging URL, visitor IP/location data
- **Description**: IP logging and URL shortening service tracking visitor IP, location, and browser data.
