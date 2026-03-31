---
name: osint-index
description: >-
  Top-level OSINT intent router. Routes intelligence-gathering requests
  to the appropriate category skill based on the target type or
  investigation domain. Use when the user mentions OSINT, reconnaissance,
  intelligence gathering, investigation, lookup, search for accounts,
  find information about, who is, background check, digital footprint,
  or any open-source intelligence task.
user-invocable: false
---

# OSINT Index — Top-Level Router

Routes OSINT requests to the correct category skill based on target type and intent.

## Legal Notice

All OSINT activities must use only publicly available information and
authorized tools. Never access private systems, bypass authentication,
or violate terms of service. Users are responsible for ensuring their
use complies with applicable laws and regulations.

## Routing Table

### By Target Type

| Target | Primary Skill | Secondary Skills |
|--------|--------------|------------------|
| Username/handle | `username-recon` | `social-networks`, `messaging-comms` |
| Email address | `email-recon` | `username-recon`, `people-search` |
| Domain name | `domain-recon` | `ip-address-recon`, `threat-intelligence` |
| IP address | `ip-address-recon` | `domain-recon`, `geolocation` |
| Phone number | `phone-recon` | `people-search`, `messaging-comms` |
| Person name | `people-search` | `social-networks`, `public-records` |
| Company/org | `business-records` | `domain-recon`, `compliance-risk` |
| Image/photo | `images-videos` | `geolocation`, `disinfo-verification` |
| Crypto address | `blockchain-crypto` | `threat-intelligence` |
| Cloud asset | `cloud-recon` | `domain-recon`, `ip-address-recon` |
| Malware/hash | `malicious-file-analysis` | `threat-intelligence`, `exploits-advisories` |

### By Intent

| Intent | Skill |
|--------|-------|
| Browse tool catalog | `osint-catalog` |
| Search for tools | `osint-catalog` |
| Encode/decode data | `encoding-decoding` |
| Check OPSEC posture | `opsec` |
| Verify media/disinfo | `disinfo-verification` |
| Dark web research | `dark-web` |
| Geolocation/mapping | `geolocation` |
| Threat intel lookup | `threat-intelligence` |
| Vulnerability/exploit research | `exploits-advisories` |
| Training/learning OSINT | `training` |
| AI-assisted analysis | `ai-tools` |

## How to Route

1. **Identify the target type** from the user's request
2. **Read the primary skill** by invoking `osint-framework:<primary-skill>`
3. If the primary skill's tools are insufficient, check **secondary skills**
4. If the user wants to browse/search tools without a target, route to `osint-catalog`

## Target Auto-Detection

Use these patterns to classify the target:

- **Email**: contains `@` and `.`
- **Domain**: looks like `example.com` (no `@`, has TLD)
- **IP**: matches `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` or IPv6
- **Phone**: starts with `+` or contains 7+ consecutive digits
- **Username**: starts with `@` or is a single word without dots
- **Crypto**: Bitcoin (26-35 alphanumeric starting with 1/3/bc1), Ethereum (0x + 40 hex)
- **Hash**: MD5 (32 hex), SHA1 (40 hex), SHA256 (64 hex)

## Delegation Pattern

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="OSINT: [brief description]",
  prompt="Target: [target]\nType: [detected type]\n\n
    Primary: Read skills/[primary]/references/tools.md\n
    Secondary: Read skills/[secondary]/references/tools.md\n
    Find matching tools and return structured recommendations."
)
```
