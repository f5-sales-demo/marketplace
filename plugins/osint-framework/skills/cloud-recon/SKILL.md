---
name: cloud-recon
description: >-
  Cloud asset discovery — AWS, Azure, GCP enumeration, S3/Blob/GCS
  bucket scanning, cloud configuration analysis, and SaaS footprinting.
  Use when the user wants to enumerate cloud resources, find exposed
  storage buckets, audit cloud security posture, or discover cloud
  infrastructure tied to a target. Activates for "cloud recon",
  "AWS enumeration", "S3 bucket", "Azure blob", "GCP bucket",
  "cloud infrastructure", "cloud security audit", "storage exposure",
  "cloud misconfiguration", "cloud posture".
user-invocable: false
---

# Cloud Infrastructure Reconnaissance

Cloud asset discovery — AWS, Azure, GCP enumeration, storage bucket
scanning, configuration auditing, and SaaS footprinting.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Accessing cloud
resources without authorization may violate the Computer Fraud and
Abuse Act or equivalent legislation. Always obtain written permission
before running active enumeration tools against cloud infrastructure
you do not own.

## Tools Reference

Read `skills/cloud-recon/references/tools.md` for the complete
list of 23 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| AWSBucketDump | `git clone https://github.com/jordanpotti/AWSBucketDump.git && pip install -r AWSBucketDump/requirements.txt` | `python AWSBucketDump.py -l buckets.txt -g keywords.txt -D` |
| cloud_enum | `git clone https://github.com/initstring/cloud_enum.git && pip install -r cloud_enum/requirements.txt` | `python3 cloud_enum.py -k company-name` |
| Subfinder | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` | `subfinder -d target.com` |
| AADInternals | `Install-Module AADInternals` (PowerShell Gallery) | `Import-Module AADInternals; Invoke-AADIntReconAsOutsider -DomainName target.com` |
| GCPBucketBrute | `git clone https://github.com/RhinoSecurityLabs/GCPBucketBrute.git && pip3 install -r GCPBucketBrute/requirements.txt` | `python3 gcpbucketbrute.py -k company-name -u` |
| MicroBurst | `Install-Module MicroBurst` (PowerShell Gallery) | `Import-Module MicroBurst; Invoke-EnumerateAzureSubDomains -Base company-name` |
| ROADtools | `pip install roadrecon roadtx` | `roadrecon auth && roadrecon gather && roadrecon gui` |
| Stormspotter | `git clone https://github.com/Azure/Stormspotter.git && docker-compose up` | `python3 sscollector.pyz cli` |
| BucketLoot | `go install github.com/redhuntlabs/bucketloot/cmd/bucketloot@latest` | `bucketloot https://bucket.s3.amazonaws.com` |
| goblob | `go install github.com/Macmod/goblob@latest` | `goblob storageaccountname` |
| lazys3 | `git clone https://github.com/nahamsec/lazys3.git` (requires Ruby) | `ruby lazys3.rb company-name` |
| S3Scanner | `go install -v github.com/sa7mon/s3scanner@latest` | `s3scanner -bucket bucket-name -enumerate` |
| Checkov | `pip install checkov` | `checkov --directory /path/to/iac` |
| Cloud Custodian | `pip install c7n` | `custodian run -s out policy.yml` |
| Prowler | `pip install prowler` | `prowler aws` |
| ScoutSuite | `pip install scoutsuite` | `scout aws` |
| Steampipe | `sudo /bin/sh -c "$(curl -fsSL https://steampipe.io/install/steampipe.sh)"` | `steampipe query "select * from aws_s3_bucket"` |
| Amass | `go install github.com/owasp-amass/amass/v4/...@master` | `amass enum -d target.com` |
| dnsrecon | `pip install dnsrecon` | `dnsrecon -d target.com` |
| SpiderFoot | `git clone https://github.com/smicallef/spiderfoot.git && pip3 install -r spiderfoot/requirements.txt` | `python3 sf.py -l 127.0.0.1:5001` |
| Sublist3r | `pip install sublist3r` | `sublist3r -d target.com` |
| theHarvester | `pip install theHarvester` | `theHarvester -d target.com -b all` |

## Subcategories

- **AWS Enumeration** — S3 bucket discovery, IAM recon, service fingerprinting
- **Azure/GCP Discovery** — Azure AD enumeration, blob storage, GCS bucket brute-forcing
- **S3/Blob Storage** — Cross-provider object storage exposure scanning
- **Cloud Configuration Analysis** — IaC scanning, policy compliance, posture assessment
- **SaaS Footprinting** — Subdomain enumeration and DNS recon to uncover cloud-hosted services

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Cloud Infrastructure tool search",
  prompt="Find OSINT tools for Cloud Infrastructure reconnaissance.\n
    Read skills/cloud-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Cloud Infrastructure investigation: [target]",
  prompt="Investigate cloud infrastructure for: [target]\n\n
    Primary: Read skills/cloud-recon/references/tools.md\n
    Secondary: Read skills/domain-recon/references/tools.md\n
    Secondary: Read skills/ip-address-recon/references/tools.md\n
    Execute available CLI tools (cloud_enum, subfinder, S3Scanner),
    query web resources, report findings.\n
    Start with passive tools (Subfinder, Sublist3r, theHarvester)
    before active enumeration (cloud_enum, Prowler, ScoutSuite)."
)
```

## Investigation Workflow

1. **Domain/subdomain discovery**: Run Subfinder, Amass, or Sublist3r to identify cloud-hosted subdomains (e.g., `*.s3.amazonaws.com`, `*.blob.core.windows.net`, `*.storage.googleapis.com`)
2. **Cloud storage enumeration**: Use cloud_enum with target keywords to sweep AWS, Azure, and GCP for exposed storage assets
3. **Provider-specific bucket scanning**: Run AWSBucketDump or S3Scanner for S3, goblob for Azure Blob, GCPBucketBrute for GCS
4. **Azure AD reconnaissance**: If Azure presence is confirmed, use ROADtools or AADInternals to enumerate tenant objects and trust relationships
5. **Configuration auditing**: Run Prowler (AWS/Azure/GCP), ScoutSuite, or Checkov against discovered IaC artifacts for misconfiguration analysis
6. **DNS/IP pivot**: Resolve discovered cloud endpoints, then investigate IPs with `ip-address-recon` and domains with `domain-recon`
7. **Correlate and report**: Consolidate findings across providers, flag publicly exposed resources, map attack surface

## Cross-Category Pivots

| Finding | Pivot To | Reason |
| --------- | ---------- | -------- |
| Cloud-hosted subdomain discovered | `domain-recon` | Full DNS/WHOIS/certificate analysis |
| Cloud endpoint IP resolved | `ip-address-recon` | Geolocation, ASN, reverse DNS |
| Email addresses in bucket objects | `email-recon` | Validate and investigate leaked emails |
| Exposed credentials or API keys | `breach-data-recon` | Check for prior breach exposure |
| SaaS application identified | `domain-recon` | Technology detection and further enumeration |

## OPSEC Notes

**Passive tools** (no direct target interaction):

- Subfinder, Sublist3r, theHarvester, BucketLoot, Checkov (local IaC analysis)
- Public Buckets (web search of pre-indexed data)

**Active tools** (directly probe target infrastructure):

- cloud_enum, AWSBucketDump, GCPBucketBrute, goblob, lazys3, S3Scanner
- AADInternals, MicroBurst, ROADtools, Stormspotter
- Prowler, ScoutSuite, Cloud Custodian, Steampipe
- Amass (enum mode), dnsrecon, SpiderFoot

Active tools generate network traffic to target systems and may trigger
security alerts or rate limiting. Use passive tools first to scope the
target before active enumeration. When running bucket enumeration tools,
be aware that high-volume requests may be logged by cloud providers.
