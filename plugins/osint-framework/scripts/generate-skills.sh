#!/usr/bin/env bash
# Generate SKILL.md files for all categories that have references but no SKILL.md
set -eo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS="$PLUGIN_DIR/skills"

# Category skill metadata: skill-dir|display-name|description|triggers
CATEGORIES="ai-tools|AI Tools|AI-powered OSINT analysis tools — deepfake detection, AI content identification, and machine learning assisted intelligence gathering|AI OSINT, deepfake detection, AI analysis, machine learning intelligence
archives-cache|Archives & Cache|Web archives, cached pages, and historical internet data retrieval|web archive, wayback machine, cached page, internet archive, historical web
blockchain-crypto|Blockchain & Cryptocurrency|Blockchain analysis, cryptocurrency tracing, wallet investigation, and transaction tracking|blockchain, cryptocurrency, bitcoin, ethereum, wallet lookup, crypto tracing, transaction analysis
business-records|Business Records|Corporate filings, annual reports, SEC data, company research, and organizational intelligence|company research, business lookup, SEC filing, corporate records, annual report, company information
classifieds|Classifieds|Classified ad search across platforms like Craigslist, eBay, and marketplace sites|classified ads, Craigslist search, marketplace, eBay lookup, online listings
cloud-recon|Cloud Infrastructure|Cloud asset discovery — AWS, Azure, GCP enumeration, S3 bucket scanning, and cloud service identification|cloud recon, AWS enumeration, S3 bucket, Azure, GCP, cloud infrastructure
compliance-risk|Compliance & Risk Intelligence|Sanctions screening, PEP checks, regulatory compliance, and risk assessment tools|sanctions check, PEP screening, compliance, AML, KYC, regulatory risk, OFAC
dark-web|Dark Web|Dark web monitoring, onion service analysis, and Tor network intelligence|dark web, onion, tor, darknet, hidden service, dark web monitoring
disinfo-verification|Disinformation & Media Verification|Deepfake detection, fact-checking, media authenticity verification, and misinformation analysis|fact check, deepfake, media verification, disinformation, fake news, image manipulation
documentation-evidence|Documentation & Evidence Capture|Screenshot tools, web archiving, evidence preservation, and documentation capture|screenshot, evidence capture, web archive, documentation, preserve evidence
encoding-decoding|Encoding & Decoding|Encode/decode data — Base64, hex, URL encoding, barcode/QR scanning, and cipher tools|encode, decode, base64, hex, barcode, QR code, cipher, hash
exploits-advisories|Exploits & Advisories|Vulnerability databases, CVE lookup, exploit research, and security advisories|CVE, exploit, vulnerability, advisory, security bulletin, default password
geolocation|Geolocation & Maps|Location intelligence — geolocation, satellite imagery, mapping, and geographic analysis|geolocation, map, satellite, location, coordinates, geographic, street view
images-videos|Images, Videos & Documents|Reverse image search, face recognition, video analysis, document metadata extraction, and EXIF data|reverse image, face recognition, EXIF, metadata, image search, video analysis, document analysis
ip-address-recon|IP & MAC Address|IP geolocation, port scanning, ASN lookup, MAC vendor identification, and network reputation|IP lookup, geolocation, port scan, ASN, MAC address, network reputation, IP reputation
language-translation|Language Translation|Text translation, language detection, and multilingual OSINT support|translate, language detection, translation, multilingual
malicious-file-analysis|Malicious File Analysis|Malware analysis, file reputation, sandbox detonation, and hash lookup|malware analysis, virus scan, file hash, sandbox, malicious file, VirusTotal
messaging-comms|Messaging & Communications|Instant messaging and dating platform investigation — Telegram, Discord, WhatsApp, Signal, and dating sites|Telegram, Discord, WhatsApp, Signal, messaging, chat, dating site, instant messaging
mobile-osint|Mobile OSINT|Mobile device intelligence — Android/iOS app analysis, mobile forensics, and device fingerprinting|mobile, Android, iOS, app analysis, mobile forensics, IMEI, device
online-communities|Online Communities|Blog search, forum analysis, Reddit investigation, and online community monitoring|blog, forum, Reddit, community, discussion board, online community
opsec|Operational Security|OPSEC tools — persona creation, privacy protection, anonymous browsing, and counter-surveillance|OPSEC, privacy, anonymous, persona, VPN, counter-surveillance, operational security
osint-tools|OSINT Tools & Frameworks|General OSINT automation frameworks, collection tools, and multi-purpose reconnaissance suites|OSINT framework, automation, recon tool, collection, SpiderFoot, Maltego, recon-ng
people-search|People Search|Person lookup, identity verification, background research, and people finder tools|people search, person lookup, find person, background check, identity, people finder
phone-recon|Phone & Telephone|Phone number lookup, caller ID, carrier identification, and VoIP analysis|phone lookup, caller ID, phone number, carrier, VoIP, telephone, reverse phone
public-records|Public Records|Government records, court filings, property records, voter data, and public document search|public records, court records, property records, voter, government records, FOIA
search-engines|Search Engines|General and specialized search engines — Google dorking, Shodan, academic search, and code search|search engine, Google dork, Shodan, code search, academic search, specialized search
social-networks|Social Networks|Platform-specific OSINT — Facebook, Twitter/X, Instagram, LinkedIn, Reddit, TikTok analysis|social media, Facebook, Twitter, Instagram, LinkedIn, Reddit, TikTok, social network
threat-intelligence|Threat Intelligence|Threat feeds, IOC databases, phishing detection, C2 tracking, and cyber threat analysis|threat intelligence, IOC, phishing, C2, threat feed, cyber threat, indicator of compromise
training|Training|OSINT training resources, CTF challenges, practice platforms, and educational materials|OSINT training, CTF, practice, learning, education, OSINT course
transportation|Transportation|Vehicle records, flight tracking, ship tracking, and transportation intelligence|vehicle, flight tracking, ship tracking, license plate, VIN, maritime, aviation"

echo "Generating SKILL.md files for remaining categories..."

while IFS='|' read -r skill_dir display_name description triggers; do
  [[ -z "$skill_dir" ]] && continue

  skill_path="$SKILLS/$skill_dir/SKILL.md"

  if [[ -f "$skill_path" ]]; then
    continue
  fi

  # Count tools from reference file
  tool_count=0
  ref_file="$SKILLS/$skill_dir/references/tools.md"
  if [[ -f "$ref_file" ]]; then
    tool_count=$(grep -c '^### ' "$ref_file" || true)
  fi

  cat > "$skill_path" << SKILL_EOF
---
name: $skill_dir
description: >-
  $description.
  Use when the user mentions: $triggers.
user-invocable: false
---

# $display_name

$description.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read \`skills/$skill_dir/references/tools.md\` for the complete
list of $tool_count free tools in this category.

## Delegation

### Tool Lookup

\`\`\`
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="$display_name tool search",
  prompt="Find OSINT tools for $display_name.\n
    Read skills/$skill_dir/references/tools.md\n
    Return recommendations matching the user's specific need."
)
\`\`\`

### Active Investigation

\`\`\`
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="$display_name investigation: [target]",
  prompt="Investigate using $display_name tools: [target]\n\n
    Primary: Read skills/$skill_dir/references/tools.md\n
    Execute available CLI tools, query web resources, report findings."
)
\`\`\`
SKILL_EOF

  echo "  Created: $skill_dir ($tool_count tools)"

done <<< "$CATEGORIES"

echo "Done."
