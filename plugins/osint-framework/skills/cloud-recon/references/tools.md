# Cloud Infrastructure — OSINT Tools Reference

> Auto-generated from arf.json. 23 free/freemium tools.
> Source: <https://osintframework.com>

## Subcategories

- AWS Enumeration
- Azure/GCP Discovery
- S3/Blob Storage
- Cloud Configuration Analysis
- SaaS Footprinting

---

### AWSBucketDump (T)

- **URL**: <https://github.com/jordanpotti/AWSBucketDump>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Targeted S3 bucket discovery and object collection
- **Input**: AWS account naming patterns, keywords, and optional wordlists
- **Output**: Discovered bucket names and downloadable object listings/files
- **Description**: Python tool that enumerates AWS S3 buckets and optionally downloads accessible objects using keyword and pattern-based discovery.

### cloud_enum (T)

- **URL**: <https://github.com/initstring/cloud_enum>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Rapid discovery of cloud storage exposure across major providers
- **Input**: Company names, domains, and custom keywords/wordlists
- **Output**: Potentially exposed cloud storage resources by provider
- **Description**: Multi-cloud enumeration tool that looks for exposed AWS, Azure, and GCP storage assets from target naming patterns.

### Subfinder (T)

- **URL**: <https://github.com/projectdiscovery/subfinder>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Passive subdomain enumeration for cloud asset inventorying
- **Input**: Domain name and optional API credentials for data sources
- **Output**: Resolved and unresolved subdomain candidates
- **Description**: Fast passive subdomain discovery utility that aggregates results from many curated OSINT and API-backed sources.

### AADInternals (T)

- **URL**: <https://github.com/Gerenios/AADInternals>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Deep Azure AD reconnaissance and security assessment
- **Input**: Tenant identifiers, domain names, and account context
- **Output**: Tenant/user intelligence, configuration findings, and attack-path indicators
- **Description**: PowerShell toolkit for Azure AD and Entra ID assessment, including tenant reconnaissance and hybrid identity attack-path analysis.

### GCPBucketBrute (T)

- **URL**: <https://github.com/RhinoSecurityLabs/GCPBucketBrute>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Enumerating likely GCS bucket names at scale
- **Input**: Target company names, domains, and custom wordlists
- **Output**: Valid bucket names with access status and findings
- **Description**: Google Cloud Storage bucket enumeration utility for identifying publicly accessible or weakly protected buckets.

### MicroBurst (T)

- **URL**: <https://github.com/NetSPI/MicroBurst>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Azure subscription and service-level exposure testing
- **Input**: Azure tenant/subscription context and optional credentials
- **Output**: Recon data and security findings for Azure resources
- **Description**: PowerShell collection focused on Azure security assessment, including subscription discovery and cloud service misconfiguration checks.

### ROADtools (T)

- **URL**: <https://github.com/dirkjanm/roadtools>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Enumerating Azure AD objects and privilege relationships
- **Input**: Azure AD tenant context and authentication tokens/credentials
- **Output**: Users, groups, applications, roles, and privilege mappings
- **Description**: Azure AD exploration framework for dumping tenant objects, principals, and permissions to support attack-path and privilege analysis.

### Stormspotter (T)

- **URL**: <https://github.com/Azure/Stormspotter>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Visual analysis of Azure attack paths and privilege chains
- **Input**: Azure subscription/tenant metadata collected by collectors
- **Output**: Interactive graph of Azure identities, resources, and attack edges
- **Description**: Graph-based Azure reconnaissance platform that maps cloud attack paths and trust relationships using Neo4j-backed visualization.

### BucketLoot (T)

- **URL**: <https://github.com/redhuntlabs/BucketLoot>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Supplemental bucket discovery when validating legacy workflows
- **Input**: Bucket name patterns and target-related keywords
- **Output**: Candidate bucket names and accessible resource indications
- **Description**: Open-source cloud bucket discovery utility with limited current documentation and unclear maintenance signals.

### goblob (T)

- **URL**: <https://github.com/Macmod/goblob>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Enumerating Azure blob container exposure quickly
- **Input**: Target naming patterns and optional custom wordlists
- **Output**: Discovered blob storage endpoints and access results
- **Description**: Go-based Azure blob storage enumeration utility designed for fast discovery of publicly exposed containers and blobs.

### lazys3 (T)

- **URL**: <https://github.com/nahamsec/lazys3>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Quick permutation-based S3 bucket name discovery
- **Input**: Base target keywords and optional custom wordlists
- **Output**: Potential S3 buckets with accessible bucket responses
- **Description**: S3 bucket brute-forcing utility that generates candidate names from permutations and checks bucket accessibility.

### Public Buckets

- **URL**: <https://buckets.grayhatwarfare.com/>
- **Type**: Web
- **Pricing**: Freemium
- **OPSEC**: Passive
- **Registration**: Yes
- **API**: No
- **CLI Install**: N/A
- **Best For**: Investigating exposed bucket contents without running local scanners
- **Input**: Keywords, domains, filenames, and object metadata filters
- **Output**: Indexed public bucket/object matches with downloadable links
- **Description**: Search interface for publicly indexed cloud object storage buckets and files across multiple providers.

### S3Scanner (T)

- **URL**: <https://github.com/sa7mon/s3scanner>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Validating bucket exposure and permissions across S3-compatible targets
- **Input**: Bucket names, generated candidates, or wordlist-driven targets
- **Output**: Bucket existence and permission states (list/read/write/public indicators)
- **Description**: Command-line scanner for enumerating and checking S3 bucket misconfigurations across AWS and compatible object storage services.

### Checkov (T)

- **URL**: <https://github.com/bridgecrewio/checkov>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Shift-left cloud misconfiguration detection in IaC repositories
- **Input**: IaC source files, templates, and configuration manifests
- **Output**: Policy violations with severity and remediation context
- **Description**: Infrastructure-as-code security scanner that checks Terraform, CloudFormation, Kubernetes, and other cloud configs against policy rules.

### Cloud Custodian (T)

- **URL**: <https://github.com/cloud-custodian/cloud-custodian>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Automated cloud governance and continuous configuration enforcement
- **Input**: Cloud account credentials and YAML policy definitions
- **Output**: Matched resources, policy findings, and optional remediation actions
- **Description**: Policy-as-code engine for cloud governance and security that can detect and remediate risky cloud configurations.

### Prowler (T)

- **URL**: <https://github.com/prowler-cloud/prowler>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Broad cloud security and compliance baseline assessments
- **Input**: Cloud account credentials, profiles, and optional compliance benchmarks
- **Output**: Findings by control/check with compliance mapping and export options
- **Description**: Cloud security posture and compliance assessment framework covering AWS, Azure, GCP, Kubernetes, and SaaS surfaces.

### ScoutSuite (T)

- **URL**: <https://github.com/nccgroup/ScoutSuite>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Snapshot-style multi-cloud security posture reviews
- **Input**: Cloud account credentials and provider-specific profile configuration
- **Output**: Interactive audit report with categorized misconfiguration findings
- **Description**: Multi-cloud auditing tool that inventories cloud resources and highlights security risks in an interactive HTML report.

### Steampipe (T)

- **URL**: <https://github.com/turbot/steampipe>
- **Type**: CLI
- **Pricing**: Freemium
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: SQL-driven cloud inventory and security query workflows
- **Input**: SQL queries and plugin connections to cloud/provider APIs
- **Output**: Tabular query results from live cloud metadata
- **Description**: SQL interface over cloud APIs and services, enabling ad hoc querying of AWS, Azure, GCP, and many other data sources.

### Amass (T)

- **URL**: <https://github.com/owasp-amass/amass>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: Yes
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Comprehensive external attack-surface and subdomain mapping
- **Input**: Domain names, ASN data, CIDRs, and optional API credentials
- **Output**: Correlated graph of domains, subdomains, infrastructure, and relationships
- **Description**: Advanced attack surface mapping framework for DNS and subdomain enumeration with graph correlation and extensive data-source support.

### dnsrecon (T)

- **URL**: <https://github.com/darkoperator/dnsrecon>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Detailed DNS reconnaissance and validation
- **Input**: Domain names, name servers, and optional DNS wordlists
- **Output**: DNS records, discovered hosts, and transfer/bruteforce findings
- **Description**: DNS enumeration script for recon workflows, supporting record discovery, zone transfer checks, brute-force, and reverse lookups.

### SpiderFoot (T)

- **URL**: <https://github.com/smicallef/spiderfoot>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Active
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Automated recon, attack surface mapping, threat intelligence
- **Input**: Domain, IP, email, name, phone, subnet
- **Output**: Correlated intelligence graph, structured findings across modules
- **Description**: Automated OSINT collection tool with 200+ modules for reconnaissance and threat intelligence.

### Sublist3r (T)

- **URL**: <https://github.com/aboul3la/Sublist3r>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: No
- **CLI Install**: Yes
- **Best For**: Quick passive subdomain discovery for reconnaissance
- **Input**: Domain name
- **Output**: Discovered subdomain list and optional live-host checks
- **Description**: Passive subdomain enumeration tool that aggregates subdomains from public search engines and certificate-related sources.

### theHarvester (T)

- **URL**: <https://github.com/laramies/theHarvester>
- **Type**: CLI
- **Pricing**: Free
- **OPSEC**: Passive
- **Registration**: No
- **API**: Yes
- **CLI Install**: Yes
- **Best For**: Email and host discovery tied to a target organization
- **Input**: Domain names, company names, and selected data-source modules
- **Output**: Emails, hosts, domains, IPs, and related reconnaissance artifacts
- **Description**: Reconnaissance tool for gathering emails, domains, hosts, and employee-related intelligence from public search and data sources.
