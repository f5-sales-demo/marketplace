# Networking Tools

## Packet Capture & Analysis

## tcpdump

- **Package**: `tcpdump` via apt
- **Purpose**: Command-line packet analyzer for capturing and inspecting network traffic
- **Use when**: Debugging connectivity issues, inspecting packet contents, recording traffic for offline analysis
- **Quick start**:
  - `sudo tcpdump -i eth0 -n port 443`
  - `sudo tcpdump -i any -w capture.pcap`
  - `sudo tcpdump -r capture.pcap -A 'host 10.0.0.1'`
- **Auth**: Requires root or `CAP_NET_RAW` capability
- **Docs**: `man tcpdump`

## tshark

- **Package**: `tshark` via apt (part of wireshark-common)
- **Purpose**: Terminal-based Wireshark for deep packet inspection and protocol dissection
- **Use when**: Analyzing protocols in detail, filtering captures with display filters, extracting fields from pcap files
- **Quick start**:
  - `tshark -i eth0 -f 'port 80'`
  - `tshark -r capture.pcap -Y 'http.request.method == "GET"'`
  - `tshark -r capture.pcap -T fields -e ip.src -e http.host`
- **Auth**: Requires root or membership in the `wireshark` group
- **Docs**: `man tshark`

## ngrep

- **Package**: `ngrep` via apt
- **Purpose**: Network grep for searching packet payloads with regular expression patterns
- **Use when**: Searching for strings in network traffic, monitoring HTTP requests in real time, quick payload inspection
- **Quick start**:
  - `sudo ngrep -d eth0 'GET|POST' port 80`
  - `sudo ngrep -q 'password' host 10.0.0.1`
  - `sudo ngrep -W byline -d any '' port 8080`
- **Auth**: Requires root or `CAP_NET_RAW` capability
- **Docs**: `man ngrep`

## scapy

- **Package**: `scapy` via pip
- **Purpose**: Interactive packet manipulation and crafting library for Python
- **Use when**: Crafting custom packets, protocol fuzzing, building network tools, packet-level testing
- **Quick start**:
  - `sudo scapy` (interactive shell)
  - `python3 -c "from scapy.all import *; resp=sr1(IP(dst='8.8.8.8')/ICMP()); resp.show()"`
  - `python3 -c "from scapy.all import *; sniff(count=10, prn=lambda x: x.summary())"`
- **Auth**: Requires root for raw socket access
- **Docs**: <https://scapy.readthedocs.io>

---

## Network Scanning & Discovery

## nmap

- **Package**: `nmap` via apt
- **Purpose**: Network exploration, host discovery, and port scanning
- **Use when**: Discovering hosts on a network, scanning open ports, service version detection, security auditing
- **Quick start**:
  - `nmap -sn 192.168.1.0/24`
  - `nmap -sV -p 80,443,8080 target.example.com`
  - `nmap -A -T4 10.0.0.1`
- **Auth**: None for basic scans; root for SYN scans and OS detection
- **Docs**: `man nmap`

## masscan

- **Package**: `masscan` via apt
- **Purpose**: High-speed port scanner capable of scanning the entire internet
- **Use when**: Rapidly scanning large IP ranges, enumerating open ports across many hosts
- **Quick start**:
  - `sudo masscan 10.0.0.0/8 -p 80,443 --rate=10000`
  - `sudo masscan 192.168.1.0/24 -p 0-65535 --rate=1000`
  - `sudo masscan -iL targets.txt -p 22,80,443 -oJ results.json`
- **Auth**: Requires root for raw socket access
- **Docs**: `man masscan`

## netdiscover

- **Package**: `netdiscover` via apt
- **Purpose**: Active and passive ARP reconnaissance for discovering hosts on local networks
- **Use when**: Identifying devices on a LAN, passive network monitoring, mapping local network topology
- **Quick start**:
  - `sudo netdiscover -r 192.168.1.0/24`
  - `sudo netdiscover -p` (passive mode)
  - `sudo netdiscover -i eth0 -r 10.0.0.0/24`
- **Auth**: Requires root for raw socket access
- **Docs**: `man netdiscover`

## hping3

- **Package**: `hping3` via apt
- **Purpose**: TCP/IP packet assembler and analyzer for advanced network testing
- **Use when**: Testing firewall rules, crafting custom TCP/UDP/ICMP packets, traceroute with specific protocols, port scanning
- **Quick start**:
  - `sudo hping3 -S -p 80 target.example.com`
  - `sudo hping3 --traceroute -V -1 target.example.com`
  - `sudo hping3 -S -p 80 --flood target.example.com`
- **Auth**: Requires root for raw socket access
- **Docs**: `man hping3`

---

## DNS Tools

## dnsutils

- **Package**: `dnsutils` via apt (provides `dig`, `nslookup`, `host`)
- **Purpose**: DNS lookup utilities for querying name servers
- **Use when**: Resolving domain names, checking DNS records, diagnosing DNS propagation, verifying DNS configuration
- **Quick start**:
  - `dig example.com A +short`
  - `dig @8.8.8.8 example.com MX`
  - `host -t CNAME www.example.com`
- **Auth**: None
- **Docs**: `man dig`

## whois

- **Package**: `whois` via apt
- **Purpose**: Query domain and IP registration information from WHOIS databases
- **Use when**: Looking up domain ownership, checking registration dates, finding IP allocation details
- **Quick start**:
  - `whois example.com`
  - `whois 8.8.8.8`
  - `whois -h whois.arin.net 10.0.0.1`
- **Auth**: None
- **Docs**: `man whois`

---

## Connectivity & Diagnostics

## ping / arping

- **Package**: `iputils-ping` and `iputils-arping` via apt
- **Purpose**: ICMP and ARP-based reachability testing
- **Use when**: Testing host reachability, measuring latency, detecting duplicate IPs on a LAN
- **Quick start**:
  - `ping -c 4 example.com`
  - `ping -i 0.2 -c 100 10.0.0.1`
  - `sudo arping -c 3 -I eth0 192.168.1.1`
- **Auth**: None for ping; root for arping
- **Docs**: `man ping` / `man arping`

## traceroute

- **Package**: `traceroute` via apt
- **Purpose**: Trace the network path packets take to reach a destination
- **Use when**: Diagnosing routing issues, identifying network hops, finding where packets are dropped
- **Quick start**:
  - `traceroute example.com`
  - `traceroute -n -w 2 10.0.0.1`
  - `traceroute -T -p 443 example.com`
- **Auth**: None for UDP; root for TCP/ICMP modes
- **Docs**: `man traceroute`

## mtr-tiny

- **Package**: `mtr-tiny` via apt
- **Purpose**: Combined traceroute and ping with continuous statistics
- **Use when**: Monitoring path quality over time, identifying intermittent packet loss, real-time latency analysis per hop
- **Quick start**:
  - `mtr example.com`
  - `mtr -r -c 100 10.0.0.1`
  - `mtr -n --report-wide example.com`
- **Auth**: None
- **Docs**: `man mtr`

## netcat

- **Package**: `netcat-openbsd` via apt
- **Purpose**: TCP/UDP Swiss army knife for reading and writing network connections
- **Use when**: Testing port connectivity, transferring files, creating simple servers, port scanning
- **Quick start**:
  - `nc -zv example.com 80`
  - `nc -l -p 8080` (listen on port 8080)
  - `echo "GET / HTTP/1.0\r\n\r\n" | nc example.com 80`
- **Auth**: None
- **Docs**: `man nc`

## socat

- **Package**: `socat` via apt
- **Purpose**: Multipurpose relay for bidirectional data transfer between two channels
- **Use when**: Creating TCP/UDP relays, forwarding ports, SSL-wrapping connections, complex socket operations
- **Quick start**:
  - `socat TCP-LISTEN:8080,fork TCP:target.example.com:80`
  - `socat - TCP:example.com:80`
  - `socat TCP-LISTEN:443,fork OPENSSL:target.example.com:443`
- **Auth**: None
- **Docs**: `man socat`

## iperf3

- **Package**: `iperf3` via apt
- **Purpose**: Network bandwidth measurement between two endpoints
- **Use when**: Testing throughput, measuring network performance, benchmarking link speed
- **Quick start**:
  - `iperf3 -s` (start server)
  - `iperf3 -c server.example.com`
  - `iperf3 -c server.example.com -u -b 100M` (UDP test at 100 Mbps)
- **Auth**: None
- **Docs**: `man iperf3`

## ethtool

- **Package**: `ethtool` via apt
- **Purpose**: Query and configure network interface card settings and statistics
- **Use when**: Checking link status, viewing NIC capabilities, adjusting speed/duplex, inspecting driver info
- **Quick start**:
  - `ethtool eth0`
  - `ethtool -i eth0` (driver info)
  - `ethtool -S eth0` (NIC statistics)
- **Auth**: Root for configuration changes; read operations may work unprivileged
- **Docs**: `man ethtool`

## net-tools

- **Package**: `net-tools` via apt (provides `ifconfig`, `netstat`, `route`)
- **Purpose**: Classic network configuration and statistics utilities
- **Use when**: Viewing interface addresses, checking listening ports, examining routing tables (legacy workflows)
- **Quick start**:
  - `ifconfig`
  - `netstat -tlnp`
  - `route -n`
- **Auth**: None for read operations; root for configuration changes
- **Docs**: `man ifconfig` / `man netstat` / `man route`

## jnettop

- **Package**: `jnettop` via apt
- **Purpose**: Real-time network traffic visualizer that displays bandwidth usage by host and port (like top for network traffic)
- **Use when**: Monitoring live network bandwidth per connection, identifying which hosts or ports consume the most traffic, real-time traffic analysis
- **Quick start**:
  - `sudo jnettop` (interactive view on default interface)
  - `sudo jnettop -i eth0` (monitor specific interface)
  - `sudo jnettop -i eth0 --display text` (non-interactive text output)
- **Auth**: Requires root or `CAP_NET_RAW` capability
- **Docs**: `man jnettop`

## cURL

- **Package**: `curl` via apt
- **Purpose**: Transfer data from or to a server using HTTP, HTTPS, FTP, and many other protocols
- **Use when**: Testing APIs, downloading files, debugging HTTP requests, checking response headers
- **Quick start**:
  - `curl -I https://example.com`
  - `curl -X POST -H 'Content-Type: application/json' -d '{"key":"value"}' https://api.example.com/endpoint`
  - `curl -sS -o /dev/null -w '%{http_code} %{time_total}s\n' https://example.com`
- **Auth**: None (supports auth via `-u user:pass`, `-H 'Authorization: Bearer TOKEN'`, etc.)
- **Docs**: `man curl`

---

## VPN

## tailscale

- **Package**: `tailscale` via apt
- **Purpose**: WireGuard-based mesh VPN for secure private networking
- **Use when**: Connecting to a private tailnet, accessing remote services securely, mesh networking between devices
- **Quick start**:
  - `sudo tailscale up`
  - `tailscale status`
  - `tailscale ping peer-hostname`
- **Auth**: Requires Tailscale account; authenticate via `tailscale up` (interactive login or auth key)
- **Docs**: <https://tailscale.com/kb>

---

## Text-based Browsers

## lynx

- **Package**: `lynx` via apt
- **Purpose**: Classic text-mode web browser for terminal environments
- **Use when**: Browsing web pages from a terminal, testing page accessibility without JS, downloading HTML content
- **Quick start**:
  - `lynx https://example.com`
  - `lynx -dump https://example.com > page.txt`
  - `lynx -listonly -dump https://example.com`
- **Auth**: None
- **Docs**: `man lynx`

## w3m

- **Package**: `w3m` via apt
- **Purpose**: Text-based web browser with inline image rendering support
- **Use when**: Browsing in a terminal with table rendering, viewing HTML emails, quick page inspection
- **Quick start**:
  - `w3m https://example.com`
  - `w3m -dump https://example.com`
  - `echo '<h1>Test</h1>' | w3m -T text/html`
- **Auth**: None
- **Docs**: `man w3m`

## elinks

- **Package**: `elinks` via apt
- **Purpose**: Advanced text web browser with tabs, CSS support, and scripting
- **Use when**: Feature-rich terminal browsing, tabbed browsing in text mode, scripted web interaction
- **Quick start**:
  - `elinks https://example.com`
  - `elinks -dump https://example.com`
  - `elinks -dump -no-numbering -no-references https://example.com`
- **Auth**: None
- **Docs**: `man elinks`

## links2

- **Package**: `links2` via apt
- **Purpose**: Text and graphical web browser with lightweight rendering
- **Use when**: Terminal browsing with better rendering than lynx, graphical mode on framebuffer, quick lookups
- **Quick start**:
  - `links2 https://example.com`
  - `links2 -dump https://example.com`
  - `links2 -g https://example.com` (graphical mode, if display available)
- **Auth**: None
- **Docs**: `man links2`
