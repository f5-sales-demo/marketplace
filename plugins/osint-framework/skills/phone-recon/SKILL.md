---
name: phone-recon
description: >-
  Phone number lookup, caller ID, carrier identification, and VoIP analysis.
  Use when the user mentions: phone lookup, caller ID, phone number, carrier,
  VoIP, telephone, reverse phone, phone owner, spam caller, number validation.
user-invocable: false
---

**Canonical skill URI**: `skill://osint-framework:phone-recon`

# Phone & Telephone Reconnaissance

Phone number lookup, caller ID, carrier identification, reverse phone
search, and VoIP analysis.

## Evidence and reporting

Lead with the selected category, query or authorized target, the sources inspected, important
findings, warnings and stage completion. Label catalog-only discovery and recommendations;
record actual executed commands, results and conclusions separately. A listed tool or URL does
not prove installation, availability or a completed investigation.

Use the first twelve rows as the default list preview, with total and shown counts, readable
columns and an explicit continuation. Supply the complete safe evidence once when expanded or
requested. Keep counts separate from units, URLs and command text. Preserve zero, false, empty
strings, unknown values and literal corrective guidance; missing evidence is unknown rather than
an empty successful result. Identify unavailable, partial and failed sources and the exact next
action. Do not repeat the same evidence in both summary and expanded sections.

For executed operations, show the exact executable and argv with effective scope and flags.
Quote literal target values, and label install or usage examples as recommendations until run.
Retain existing authorization, write and OPSEC guards; catalog browsing does not start an
investigation, install software or contact external targets.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/phone-recon/references/tools.md` for the complete
list of 13 free/freemium tools in this category.

## Web Resources

| Tool | URL | Pricing | Best For |
| ------ | ----- | --------- | ---------- |
| Slydial | slydial.com | Freemium | Voicemail-direct delivery without ringing |
| Numbering Plans | numberingplans.com | Free | International numbering plan validation |
| Numberway | numberway.com | Freemium | Reverse phone owner and location lookup |
| CallerID Test | calleridtest.com | Freemium | Caller ID behavior and number validation |
| True Caller | truecaller.com | Freemium | Caller ID enrichment and spam reputation |
| Reverse Genie | reversegenie.com | Free | Quick reverse number triage |
| SpyDialer | spydialer.com | Freemium | Phone attribution and voicemail lookup |
| Phone Validator | phonevalidator.com | Free | Number format, type, and carrier validation |
| Phonerator | martinvigo.com/phonerator | Free | Phone number pattern generation for testing |
| Numspy-Api | numspy.pythonanywhere.com | Freemium | Programmatic phone number verification |
| Family Tree Now | familytreenow.com | Freemium | Phone-to-person and household pivoting |
| Whitepages Reverse Phone | whitepages.com/reverse-phone | Freemium | US reverse phone attribution |
| Hiya | hiya.com | Freemium | Spam classification and caller ID enrichment |

## Subcategories

- **Voicemail** -- Direct voicemail access and voicemail-based intelligence (Slydial, SpyDialer)
- **Caller ID** -- Identify callers and check spam reputation (True Caller, Hiya, CallerID Test)
- **Carrier Lookup** -- Validate number format, line type, and carrier (Phone Validator, Numbering Plans)
- **VoIP & Number Generation** -- Generate test numbers and verify VoIP lines (Phonerator, Numspy-Api)
- **Reverse Phone** -- Look up owner, address, and associated records from a phone number (Reverse Genie, Numberway, Whitepages, SpyDialer, Family Tree Now)

## Delegation

### Tool Lookup

```text
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Phone reconnaissance tool search",
  prompt="Find OSINT tools for phone number investigation.\n
    Read skills/phone-recon/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```text
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Phone reconnaissance investigation: [target]",
  prompt="Investigate phone number: [target]\n\n
    Primary: Read skills/phone-recon/references/tools.md\n
    Secondary: Read skills/people-search/references/tools.md\n
    Execute available CLI tools, query web resources, report findings.\n
    Start with passive validation before active lookups."
)
```

## Investigation Workflow

1. **Validate**: Check number format, line type (mobile/landline/VoIP), and carrier with Phone Validator
2. **International Context**: For non-US numbers, use Numbering Plans to identify country and carrier
3. **Reverse Lookup**: Query Reverse Genie, Whitepages, and Numberway for owner and address data
4. **Caller ID**: Check True Caller and Hiya for caller identity and spam/scam flags
5. **Voicemail Probe**: Use SpyDialer for voicemail-based intelligence gathering
6. **People Pivot**: If owner identified, pivot to `people-search` for deeper profile
7. **Messaging Pivot**: Check if number is registered on messaging platforms via `messaging-comms`
8. **Username Pivot**: Search for phone-linked accounts via `username-recon`

## Cross-Category Pivots

| When you find... | Pivot to |
| ------------------ | ---------- |
| Owner name from reverse lookup | `people-search` -- Background checks, address history |
| Number linked to messaging apps | `messaging-comms` -- Telegram, WhatsApp, Signal lookups |
| Username associated with number | `username-recon` -- Cross-platform username search |
| Email associated with owner | `email-recon` -- Email verification, breach checks |

## OPSEC Notes

- Most tools are **passive** but Slydial and Numspy-Api are **active** -- they may generate calls or API requests traceable to you
- True Caller and Hiya require **registration**; use a research persona, not your real identity
- SpyDialer requires **registration** and may log your queries
- Freemium tools (8 of 13) offer limited free lookups; heavy use may require payment or trigger rate limits
- Reverse phone lookups may return outdated or inaccurate data; cross-reference across multiple tools
- Family Tree Now results may include sensitive relationship data; handle ethically
- Never use Slydial's voicemail drop feature to impersonate or harass
