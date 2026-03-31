---
name: malicious-file-analysis
description: >-
  Malware analysis, file reputation, sandbox detonation, and hash lookup.
  Use when the user mentions: malware analysis, virus scan, file hash, sandbox, malicious file, VirusTotal.
user-invocable: false
---

# Malicious File Analysis

Malware analysis, file reputation, sandbox detonation, document
forensics, reverse engineering, and hash lookup.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Never execute
unknown binaries outside of isolated sandbox environments.

## Tools Reference

Read `skills/malicious-file-analysis/references/tools.md` for the complete
list of 33 free tools in this category.

## Key CLI Tools

| Tool | Install | Usage |
|------|---------|-------|
| TYLabs QuickSand | `pip install quicksand` or `git clone https://github.com/nickvdp/quicksand.git && cd quicksand && pip install .` | `quicksand document.doc` |
| detux | `git clone https://github.com/detuxsandbox/detux.git && cd detux && pip install -r requirements.txt` | `python detux.py -s sample.elf` |
| OffVis | Download from `https://download.microsoft.com/download/1/2/7/127ba59a-4fe1-4acd-ba47-513ceef85a85/OffVis.zip`; requires .NET runtime (`apt install dotnet-runtime-6.0` or `wine`) | `OffVis.exe malicious.doc` |
| PDF Tools (Didier Stevens) | `pip install pdfid pdf-parser` or `git clone https://github.com/DidierStevens/DidierStevensSuite.git` | `pdfid.py suspect.pdf && pdf-parser.py -s /JS suspect.pdf` |
| Origami Framework | `gem install origami` or `apt install ruby && gem install origami` | `pdfwalker suspect.pdf` or `pdfcop suspect.pdf` |
| Ghidra | `apt install default-jdk wget unzip && wget https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_11.3_build/ghidra_11.3_PUBLIC_20250108.zip && unzip ghidra_*.zip` | `ghidra_11.3_PUBLIC/support/analyzeHeadless /tmp proj -import sample.exe -postScript analysis.py` |
| vt-cli (VirusTotal) | `pip install vt-cli` or `go install github.com/VirusTotal/vt-cli/vt@latest` | `vt file scan sample.exe && vt file <hash>` |

## Subcategories

- **Search** — Malware sample search across databases (Decalage, VirusShare, VX Vault, NSRL)
- **Sandbox** — Hosted automated analysis and detonation (Hybrid Analysis, Any.Run, Joe Sandbox, Cuckoo, detux)
- **PDF Analysis** — Static analysis of PDF structure, embedded JavaScript, and exploit streams (PDF Tools, Origami)
- **Office Document Analysis** — Macro extraction, OLE stream analysis, exploit detection (QuickSand, OffVis, Office Mal Scanner)
- **Reverse Engineering** — Disassembly, decompilation, and binary analysis (Ghidra, Ether)
- **Hash Lookup** — File reputation via multi-engine scanning and hash databases (VirusTotal, totalhash, OPSWAT MetaDefender, Jotti, NSRL)

## Investigation Workflow

1. **Hash first**: Compute MD5/SHA-256 of the file; query VirusTotal, totalhash, and NSRL before any execution
2. **Static analysis**: Run pdfid/pdf-parser (PDFs), QuickSand (Office docs), or Ghidra (binaries) to inspect structure without execution
3. **Sandbox detonation**: Submit to Hybrid Analysis, Any.Run, or Joe Sandbox for dynamic behavioral analysis in an isolated environment
4. **IOC extraction**: Collect network indicators (C2 IPs, domains), file system artifacts, and MITRE ATT&CK TTPs from sandbox reports
5. **Pivot to threat intel**: Search extracted IOCs in `threat-intelligence` tools to identify campaigns and threat actors
6. **Document findings**: Record hashes, detection names, behavioral indicators, and C2 infrastructure for incident response

## Cross-Category Pivots

- **threat-intelligence** — Pivot extracted IOCs (hashes, C2 domains, IPs) into threat feeds and actor attribution databases
- **exploits-advisories** — Map detected exploits (CVE IDs from sandbox reports) to vulnerability advisories and patch status
- **encoding-decoding** — Decode obfuscated payloads, Base64 strings, XOR-encoded shellcode, and packed executables found during analysis

## OPSEC Notes

- **Sandbox isolation is mandatory** — Never execute unknown files on the host system; always use isolated VMs, containers, or hosted sandboxes
- **Network containment** — Analyze malware in network-isolated environments to prevent C2 callbacks and data exfiltration
- **File upload awareness** — Submitting files to public services (VirusTotal, Any.Run) makes them visible to the malware author; use private sandbox instances for sensitive investigations
- **Hash-only lookups are passive** — Searching by hash does not upload the file and does not alert the adversary
- **Disposable environments** — Use snapshot-and-revert VMs or ephemeral Docker containers for all dynamic analysis

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Malicious File Analysis tool search",
  prompt="Find OSINT tools for Malicious File Analysis.\n
    Read skills/malicious-file-analysis/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Malicious File Analysis investigation: [target]",
  prompt="Investigate using Malicious File Analysis tools: [target]\n\n
    Primary: Read skills/malicious-file-analysis/references/tools.md\n
    Secondary: Read skills/threat-intelligence/references/tools.md\n
    Execute available CLI tools (pdfid, quicksand, vt-cli, ghidra
    headless), query web resources, report findings.\n
    Start with hash lookups and static analysis before sandbox detonation."
)
```
