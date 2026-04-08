---
name: opsec
description: >-
  OPSEC tools -- persona creation, privacy protection, anonymous browsing,
  and counter-surveillance. Use when the user mentions: OPSEC, privacy,
  anonymous, persona, VPN, counter-surveillance, operational security,
  leak test, browser fingerprint, identity generation, metadata removal.
user-invocable: false
---

# Operational Security

OPSEC tools -- persona creation, privacy protection, anonymous browsing,
leak testing, and counter-surveillance for OSINT practitioners.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/opsec/references/tools.md` for the complete
list of 47 free tools in this category.

## Web Resources

| Tool | URL | Best For |
| ------ | ----- | ---------- |
| **Persona Creation** | | |
| Fake Name Generator | fakenamegenerator.com | Full fake identity profiles with addresses and SSNs |
| Fake Identity Generator | backgroundchecks.org | Alternative fake identity generation |
| This Person Does Not Exist | thispersondoesnotexist.com | AI-generated face photos for personas |
| Random User Generator | randomuser.me | API-driven random user data |
| Faker.js | Browser demo | Client-side fake data generation |
| Fake US Identities | xdd2.org | US-specific identity generation |
| **Anonymous Browsing & VPN** | | |
| Tor Download | torproject.org | Onion-routed anonymous browsing |
| Freenet Project | freenetproject.org | Decentralized censorship-resistant network |
| I2P Anonymous Network | geti2p.net | Garlic-routed anonymous network |
| VPN Comparisons | thatoneprivacysite.net | Independent VPN provider comparisons |
| IP2Proxy | ip2proxy.com | Proxy and VPN detection checking |
| LocaBrowser.com | locabrowser.com | Browse sites from different geographic locations |
| **Leak Testing** | | |
| IP / DNS Leak Detection | ipleak.net | All-in-one IP, DNS, and WebRTC leak check |
| DNS leak test | dnsleaktest.com | DNS query leak detection |
| DNS Leak Tests | dnsleak.com | Alternative DNS leak testing |
| IPv6 Leak Tests | ipv6leak.com | IPv6 address leak detection |
| Email Leak Tests | emailipleak.com | Email header IP leak detection |
| WebRTC Leak Test | perfect-privacy.com | WebRTC IP leak detection |
| Perfect Privacy Check | perfect-privacy.com/check-ip | Comprehensive IP and proxy checks |
| JonDonym | ip-check.info | Anonymity and browser configuration audit |
| LetMeCheck.it | letmecheck.it | Multi-protocol leak testing |
| Trace My IP | tracemyip.org | IP address tracing and visitor analytics |
| **Browser Fingerprint & Identity** | | |
| Browser Leaks | browserleaks.com | Comprehensive browser fingerprint analysis |
| Panopticlick | panopticlick.eff.org | EFF browser fingerprint uniqueness test |
| BrowserSpy.dk | browserspy.dk | Browser configuration disclosure testing |
| Social Media Fingerprint | robinlinus.github.io | Detect logged-in social media sessions |
| UserAgentString.com | useragentstring.com | User agent string lookup and analysis |
| WhatIsMyBrowser.com | whatismybrowser.com | Browser identification and capabilities |
| WhatsMyBrowser.org | whatsmybrowser.org | Quick browser identification |
| What Browser? | whatbrowser.org | Simple browser detection |
| Browser Statistics | w3schools.com | Browser market share data |
| User Agent String Decoder | tools.tracemyip.org | User agent parsing |
| **Privacy & Cleanup** | | |
| Privacy Guides | privacyguides.org | Curated privacy tool recommendations |
| Privacy Tools | privacytools.io | Privacy-focused software directory |
| Just Delete Me | backgroundchecks.org/justdeleteme | Direct links to delete online accounts |
| OptOut Credit Prescreen | optoutprescreen.com | Opt out of credit prescreening offers |
| Credit Freeze | inteltechniques.com | Credit freeze walkthrough guide |
| Intel Techniques - Hiding | inteltechniques.com | Comprehensive digital privacy workbook |
| The Many Hats Club | themanyhats.club | Aggregated privacy resources |
| Hitchhiker's Guide to Anonymity | anonymousplanet.org/guide | End-to-end online anonymity guide |
| Awesome Opt-Out Guide 2026 | github.com/thumpersecure | Data broker opt-out manual |
| **Browser Hardening** | | |
| NoScript | noscript.net | JavaScript blocking extension |
| Firefox-debloat | github.com/amq/firefox-debloat | Firefox telemetry and bloat removal |
| Self-Destructing Cookies | Firefox addon | Auto-delete cookies on tab close |
| **Metadata & Style** | | |
| Anonymouth | github.com/psal/anonymouth | Writing style anonymization |
| MAT2 | 0xacab.org/jvoisin/mat2 | File metadata removal |

## Subcategories

- **Persona Creation** -- Generate convincing fake identities for undercover research (Fake Name Generator, This Person Does Not Exist, Random User Generator, Faker.js)
- **Privacy Tools** -- Account deletion, data broker opt-out, credit freezes, and digital hygiene guides (Just Delete Me, Privacy Guides, OptOut Credit Prescreen)
- **Anonymous Browsing** -- Tor, I2P, Freenet, and location-shifting browsing (Tor, I2P, Freenet, LocaBrowser)
- **VPN & Proxy** -- VPN comparison and proxy detection (VPN Comparisons, IP2Proxy)
- **Counter-surveillance** -- Leak testing, fingerprint analysis, and browser hardening (ipleak.net, Panopticlick, Browser Leaks, NoScript, Firefox-debloat)
- **Metadata & Style** -- Strip file metadata and anonymize writing style (MAT2, Anonymouth)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Operational Security tool search",
  prompt="Find OSINT tools for Operational Security.\n
    Read skills/opsec/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Operational Security assessment: [target]",
  prompt="Assess OPSEC posture or configure privacy tools: [target]\n\n
    Primary: Read skills/opsec/references/tools.md\n
    Execute available CLI tools, query web resources, report findings."
)
```

## Usage Workflow

1. **Assess Current Exposure**: Run leak tests (ipleak.net, dnsleaktest.com, WebRTC test) to identify what your connection reveals
2. **Browser Hardening**: Check fingerprint uniqueness (Panopticlick, Browser Leaks), install NoScript, debloat Firefox
3. **Network Anonymization**: Configure Tor or VPN; re-run leak tests to verify no leaks
4. **Persona Creation**: Generate a research persona (Fake Name Generator + This Person Does Not Exist) for platforms requiring registration
5. **Account Hygiene**: Use Just Delete Me to remove unused accounts; opt out of data brokers
6. **Metadata Scrubbing**: Before sharing any files, strip metadata with MAT2; anonymize writing style with Anonymouth
7. **Ongoing Monitoring**: Periodically re-test for leaks and check Social Media Fingerprint for session leakage

## Cross-Category Pivots

| When you need... | Pivot to |
| ------------------ | ---------- |
| Dark web access via Tor/I2P | `dark-web` -- Onion directories, hidden services |
| File metadata analysis or stripping | `encoding-decoding` -- Hex editors, encoding tools |
| Verify your persona is not linked | `username-recon` -- Check username uniqueness |
| Test persona email deliverability | `email-recon` -- Email verification tools |

## OPSEC Notes

- All 47 tools are classified **passive** -- they test your own configuration, not a target's
- Leak test sites see your real IP; run them only from your intended research connection
- Persona generators produce fictional data; never use generated SSNs or government IDs for fraud
- This Person Does Not Exist images may still be detectable by AI image detectors (see `ai-tools`)
- MAT2 should be run on every file before exfiltration or sharing to prevent metadata leakage
- Browser extensions can themselves be fingerprinted; minimize extension count on research profiles
- VPN providers vary widely in logging practices; consult VPN Comparisons before choosing
