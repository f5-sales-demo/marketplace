# Malicious File Analysis — OSINT Tools Reference

> Auto-generated from arf.json. 33 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- Search
- Hosted Automated Analysis
- Office Files
- PDFs
- PCAPs

---

### Decalage Malware Search

- **URL**: <https://decalage.info/en/mwsearch>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Quick metasearch across multiple malware analysis databases by hash, string, or filename
- **Input**: IOC (hash, filename, string, yara rule, VT hash)
- **Output**: Links to malware analysis reports from aggregated databases
- **Description**: Custom metasearch engine that indexes malware analysis databases to find malware samples containing specific strings, filenames, hashes, or IOCs.

### VirusShare.com

- **URL**: <https://virusshare.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Bulk access to malware sample collections for research and analysis
- **Input**: MD5 hash, account credentials
- **Output**: Malware sample files (zip archives, password protected), related IOCs
- **Description**: Repository of 111+ million live malware samples provided for security researchers, incident responders, forensic analysts, and researchers.

### #totalhash

- **URL**: <https://totalhash.cymru.com/>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Hash validation against 30+ AV engines with detection percentages
- **Input**: MD5 or SHA-1 hash
- **Output**: Detection percentage, last seen timestamp, signature matches from AV databases
- **Description**: Malware Hash Registry that searches against 30+ antivirus databases to validate malware hashes with detection percentage results. Updated daily.

### VX Vault

- **URL**: <https://vxvault.net/ViriList.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Access to active malware sample collections
- **Input**: Web interface browsing, malware sample queries
- **Output**: Malware sample information, related indicators
- **Description**: Active collection of malware samples and related data shared among security researchers and malware analysts for threat intelligence.

### ID Ransomware

- **URL**: <https://id-ransomware.malwarehunterteam.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Ransomware identification and victim support
- **Input**: Ransom note file, encrypted file sample, ransom email address
- **Output**: Ransomware variant identification, decryption status, victim resources
- **Description**: Free ransomware identification tool that analyzes ransom notes and encrypted file samples to identify variants and provide decryption guidance. Detects 1181+ ransomware types.

### National Software Reference Library

- **URL**: <https://nsrl.hashsets.com/national_software_reference_library1_search.php>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Eliminating known-good files in forensic investigations and digital triage
- **Input**: File hash (MD5, SHA-1, SHA-256), software query
- **Output**: Hash matches to known software, file metadata, product versioning
- **Description**: NIST-maintained repository of cryptographic hash values for known, legitimate software to identify known-good files during digital forensics investigations.

### TYLabs QuickSand Framework

- **URL**: <https://scan.tylabs.com/>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Document and PDF malware analysis with exploit detection
- **Input**: Office documents (.doc, .xls, .ppt), PDFs, emails, Postscript
- **Output**: YARA signature matches, exploit detection, risk scoring, threat analysis
- **Description**: Python-based malware analysis framework for analyzing Office documents and PDFs to identify exploits in decoded streams using YARA signatures.

### JoeSandbox Document Analyzer

- **URL**: <https://www.joesandbox.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Comprehensive malware analysis with behavioral insights and threat scoring
- **Input**: Executable files, documents, PDFs, URLs, APKs (Max 30MB free tier)
- **Output**: Behavioral analysis, network IOCs, detection verdicts, MITRE ATT&CK mappings, export formats (JSON, XML, HTML, PDF)
- **Description**: Hosted automated malware analysis service that performs dynamic and static analysis of files including Office documents, PDFs, and executables with comprehensive behavioral reporting.

### TYLabs QuickSand Framework

- **URL**: <https://scan.tylabs.com/>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Document and PDF malware analysis with exploit detection
- **Input**: Office documents (.doc, .xls, .ppt), PDFs, emails, Postscript
- **Output**: YARA signature matches, exploit detection, risk scoring, threat analysis
- **Description**: Python-based malware analysis framework for analyzing Office documents and PDFs to identify exploits in decoded streams using YARA signatures.

### Akana Android Malware

- **URL**: <https://akana.mobiseclab.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Android app malware analysis and interactive examination
- **Input**: Android APK files
- **Output**: Malware detection results, behavioral analysis, plugin-based threat assessment
- **Description**: Online Android Interactive Analysis Environment with plugins for analyzing malicious Android applications and APKs for suspicious behavior and malware characteristics.

### Joe APK Analyzer

- **URL**: <https://www.apk-analyzer.net/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Android malware analysis with dynamic behavior monitoring
- **Input**: Android APK files
- **Output**: Malware detection, behavioral analysis, threat intelligence IOCs
- **Description**: Part of Joe Sandbox suite; performs dynamic and static analysis of Android Application Packages to detect malicious behavior and generate detailed analysis reports.

### VirusTotal

- **URL**: <https://www.virustotal.com/gui/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Malware analysis, URL reputation, file hash lookups
- **Input**: File, file hash, URL, domain, IP address
- **Output**: Detection results, behavioral analysis, community comments, related indicators
- **Description**: Multi-engine file and URL scanner that aggregates results from 70+ antivirus engines and threat feeds.

### OPSWAT Meta Defender

- **URL**: <https://metadefender.opswat.com/#!/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Multi-engine malware detection with advanced threat analysis
- **Input**: Files (all types), URLs
- **Output**: Multi-engine scan results, threat verdicts, IOC extraction, file behavior analysis
- **Description**: Multi-engine malware scanning service using 20+ antivirus engines with advanced threat analysis, content disarm & reconstruction, and emulation-based detection for zero-day threats.

### Hybrid Analysis

- **URL**: <https://hybrid-analysis.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Advanced malware behavior analysis and evasion detection
- **Input**: Files (30MB max free tier), URLs, APKs (up to 30 per month free)
- **Output**: Hybrid behavioral analysis, memory dumps, disassembly, IOC extraction, behavioral indicators
- **Description**: Free automated malware analysis service powered by CrowdStrike Falcon Sandbox. Combines runtime data with memory dump analysis to extract execution pathways and IOCs for evasive malware.

### Malware Config

- **URL**: <https://malwareconfig.com/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Malware configuration extraction and C2 server tracking
- **Input**: SHA256 hash, domain, IP address, malware family
- **Output**: Extracted malware configurations, C2 infrastructure, encrypted keys, command data
- **Description**: Database for searching and analyzing extracted malware configurations by hash, domain, or IP address to track C2 infrastructure and malware attributes.

### MetaDefender

- **URL**: <https://metadefender.opswat.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Enterprise-grade multi-engine malware detection and advanced threat analysis
- **Input**: Files, URLs, streams
- **Output**: Multi-engine detection results, threat verdicts, behavioral analysis, IOC extraction
- **Description**: OPSWAT's cloud-based multi-engine malware scanning platform with advanced threat detection using 30+ antivirus engines, CDR technology, and behavioral analysis.

### Ether

- **URL**: <https://ether.gtisc.gatech.edu/web_unpack/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Transparent malware analysis resistant to anti-analysis evasion
- **Input**: Executable files, malware samples
- **Output**: Fine-grained execution traces, instruction-level analysis, unpacking results, behavior extraction
- **Description**: Georgia Tech malware analysis framework using Intel VT hardware virtualization for transparent, stealthy malware analysis resistant to anti-analysis techniques.

### Jotti's Malware Scanner

- **URL**: <https://virusscan.jotti.org/en-US/scan-file>
- **Type**: API
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Quick multi-engine scan without installation or account setup
- **Input**: Files (up to 5 concurrent, 250MB per file)
- **Output**: Detection results from 14+ AV engines, file metadata, scan reports
- **Description**: Free multi-scanner malware analysis service that submits files for analysis against 14+ antivirus engines. No installation or account setup required.

### Valkyrie File Analysis

- **URL**: <https://consumer.valkyrie.comodo.com/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Advanced malware analysis with human expert review option
- **Input**: Files (all types), URLs
- **Output**: File verdict, behavioral analysis results, IOC extraction, confidence scores, expert analysis
- **Description**: Cloud-based verdict-driven malware analysis platform from Comodo using static analysis (450+ unpackers), dynamic analysis, and optional human expert analysis for unknown files.

### detux Linux Sandbox

- **URL**: <https://detux.org/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Linux malware analysis across multiple architectures
- **Input**: Linux executable files, malware samples
- **Output**: Static analysis strings, dynamic traffic capture, IOC extraction, architecture-specific analysis
- **Description**: Open-source multiplatform Linux sandbox for analyzing Linux malware across multiple CPU architectures (x86, x86-64, ARM, MIPS) using QEMU emulation and traffic analysis.

### Joe File Analyzer

- **URL**: <https://www.file-analyzer.net/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: PE file malware analysis with system interaction tracking
- **Input**: PE executable files (.exe, .dll, etc.)
- **Output**: Hybrid behavioral analysis, system calls, network IOCs, threat scores
- **Description**: Part of Joe Sandbox suite; performs hybrid code analysis of PE files on Windows with detailed behavioral and system interaction reporting.

### Pikker.ee Cuckoo Sandbox

- **URL**: <https://sandbox.pikker.ee/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Free automated dynamic malware analysis with detailed behavioral reports
- **Input**: Executable files, documents, archives
- **Output**: Process monitoring, API calls, file system changes, network traffic, behavioral analysis
- **Description**: Public instance of Cuckoo Sandbox malware analysis system hosted in Estonia. Provides automated dynamic analysis with detailed result reporting for submitted files.

### Koodous

- **URL**: <https://koodous.com>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Android malware analysis with community collaboration and threat intelligence
- **Input**: Android APK files, package names, hashes
- **Output**: Malware detection results, community analysis, threat indicators, sample sharing
- **Description**: Collaborative platform for Android malware research and analysis with community-driven database of 70+ million Android applications with crowd-sourced malware detection.

### Any Run

- **URL**: <https://app.any.run/>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Interactive malware analysis with real-time system interaction
- **Input**: Files, URLs, APKs, documents (platform-specific)
- **Output**: Process graphs, behavioral analysis, MITRE ATT&CK TTPs, IOCs, customizable reports
- **Description**: Interactive malware analysis sandbox allowing real-time manual interaction with Windows, macOS, Linux, and Android environments. Fast report generation with MITRE ATT&CK mapping.

### Uncover It

- **URL**: <https://www.uncoverit.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Fast static malware configuration extraction
- **Input**: Malware samples, executable files
- **Output**: Extracted configurations, C2 servers, encryption keys, behavioral indicators
- **Description**: Static malware configuration extractor that quickly analyzes files without execution to extract malware configurations, C2 infrastructure, and IOCs in under 5 seconds.

### Office Mal Scanner (T)

- **URL**: <https://www.reconstructor.org/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Malicious Office document analysis and reconstruction
- **Input**: Microsoft Office documents (.doc, .xls, .ppt)
- **Output**: Document structure analysis, malicious content extraction, exploit identification
- **Description**: Malicious Office document analysis tool for analyzing and reconstructing Office documents to identify exploits and malicious content.

### OffVis (T)

- **URL**: <https://download.microsoft.com/download/1/2/7/127ba59a-4fe1-4acd-ba47-513ceef85a85/OffVis.zip>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Office binary file format analysis and exploit detection
- **Input**: Office binary files (.doc, .xls, .ppt, .pps, .pot)
- **Output**: File structure visualization, hex dump, object trees, vulnerability detection
- **Description**: Microsoft Office Visualization Tool for analyzing Office binary files to identify exploits and malicious structures. Displays hex and object tree views.

### PDF Tools (T)

- **URL**: <https://blog.didierstevens.com/programs/pdf-tools/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: PDF structure analysis and malicious object extraction
- **Input**: PDF files
- **Output**: PDF keyword identification, object parsing, embedded JavaScript detection, IOC extraction
- **Description**: Free suite of PDF analysis tools by Didier Stevens including pdfid (keyword scanning) and pdf-parser.py for analyzing malicious PDF documents and extracting embedded objects.

### Origami Framework (T)

- **URL**: <https://code.google.com/archive/p/origami-pdf/>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: PDF parsing and manipulation for malicious PDF analysis
- **Input**: PDF files, PDF objects, malicious content
- **Output**: Parsed PDF structure, extracted objects, deobfuscated content, modified PDFs
- **Description**: Ruby framework for parsing, analyzing, and forging PDF documents. Includes PDF Walker GUI and PDFcop heuristic checker for detecting dangerous PDF content.

### Malware-Traffic-Analysis.net

- **URL**: <https://www.malware-traffic-analysis.net/index.html>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Malware network behavior analysis and training exercises
- **Input**: PCAP files, network traffic captures
- **Output**: Network indicators (IPs, domains, C2 servers), behavioral analysis, post-exploitation patterns
- **Description**: Training resource and PCAP repository providing network traffic captures from malware infections since 2013. Includes tutorials and exercises for malware traffic analysis.

### Ghidra (T)

- **URL**: <https://github.com/NationalSecurityAgency/ghidra>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Reverse engineering and static malware analysis
- **Input**: Executable files (ELF, PE, Mach-O, raw binaries), multiple architectures
- **Output**: Disassembly, decompiled code, control flow graphs, function analysis, custom scripts
- **Description**: Free and open-source reverse engineering framework from NSA for analyzing compiled software. Includes disassembly, decompilation, scripting, and interactive graphing for malware analysis.

### Malware Analysis Tools

- **URL**: <https://malwareanalysis.tools/>
- **Type**: Web
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: N/A
- **Best For**: Malware analysis tool discovery and best practices reference
- **Input**: Tool research, methodology guidance
- **Output**: Tool recommendations, analysis methodologies, safety practices, learning resources
- **Description**: Curated resource and reference guide for malware analysis tools with recommendations for virtualization, safety practices, and tool selection for analysis scenarios.

### virustotal

- **URL**: <https://www.virustotal.com/gui/home/upload>
- **Type**: API
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: N/A
- **Best For**: Multi-engine malware scanning and URL reputation lookup
- **Input**: Files, URLs, domains, IP addresses, file hashes
- **Output**: Detection results from 70+ AV engines, behavioral analysis, file insights, related samples
- **Description**: Free online service that analyzes files and URLs for viruses, trojans and malicious content detected by 70+ antivirus engines and URL/domain reputation services.
