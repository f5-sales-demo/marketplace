---
name: online-communities
description: >-
  Blog search, forum analysis, Reddit investigation, and online community monitoring.
  Use when the user mentions: blog, forum, Reddit, community, discussion board, online community.
user-invocable: false
---

**Canonical skill URI**: `skill://osint-framework:online-communities`

# Online Communities

Blog search, forum analysis, Reddit investigation, IRC reconnaissance,
and online community monitoring.

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

Read `skills/online-communities/references/tools.md` for the complete
list of 16 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| ReconXplorer | `git clone https://github.com/root7am/ReconXplorer && cd ReconXplorer && pip install -r requirements.txt` | `python reconxplorer.py` |
| IRCP | `git clone https://github.com/internet-relay-chat/IRCP && cd IRCP && pip install -r requirements.txt` | `python ircp.py <irc_server>` |
| ircsnapshot | `git clone https://github.com/bwall/ircsnapshot && cd ircsnapshot && pip install -r requirements.txt` | `python ircsnapshot.py <irc_server>` |

### All Install Methods — ReconXplorer

| Method | Command |
| -------- | --------- |
| Git clone | `git clone https://github.com/root7am/ReconXplorer && cd ReconXplorer && pip install -r requirements.txt` |
| pip | N/A |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

### All Install Methods — IRCP

| Method | Command |
| -------- | --------- |
| Git clone | `git clone https://github.com/internet-relay-chat/IRCP && cd IRCP && pip install -r requirements.txt` |
| pip | N/A |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

### All Install Methods — ircsnapshot

| Method | Command |
| -------- | --------- |
| Git clone | `git clone https://github.com/bwall/ircsnapshot && cd ircsnapshot && pip install -r requirements.txt` |
| pip | N/A |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

## Subcategories

- **Blog Search** — Blog discovery, LiveJournal search, topic-focused blog post searching (Blog Search Engine, Live Journal Seek)
- **Forum Search** — Forum thread indexing, discussion search, historical threads (BoardReader, Omgili/Webz.io, Craigslist Forums, Delphi Forum Search, Google Groups Search)
- **Reddit** — User/subreddit content discovery, deleted content recovery, historical dataset analysis (Arctic Shift, Cama's Reddit Search, Reveddit)
- **IRC** — Server enumeration, channel metadata collection, user/hostmask mapping, network topology (IRCP, ircsnapshot, netsplit.de)
- **Discord** — Bot discovery, server ecosystem mapping, token-based reconnaissance (Discord Bot List, Top.gg, ReconXplorer)

## Investigation Workflow

1. **Keyword search**: Start with blog and forum search engines (BoardReader, Blog Search Engine) for broad topic discovery
2. **Reddit deep dive**: Use Cama's Reddit Search or Arctic Shift for historical post/comment analysis by username or keyword
3. **Deleted content**: Check Reveddit for removed Reddit posts and moderation activity
4. **Forum archives**: Search Google Groups for mailing-list history; check Delphi Forums and Craigslist Forums for niche discussions
5. **IRC reconnaissance**: Run IRCP for server enumeration and channel metadata; use ircsnapshot for user/hostmask mapping
6. **Discord mapping**: Search Discord Bot List and Top.gg for server ecosystem; use ReconXplorer for Discord token checks
7. **Cross-reference**: Link usernames and handles found in communities to other platforms
8. **Timeline construction**: Build activity timelines from post dates, IRC logs, and forum timestamps

## Cross-Category Pivots

- **social-networks** — Usernames and handles found in communities often map to social media profiles; pivot to social-networks for platform-specific lookups
- **username-recon** — Discovered usernames should be checked across platforms; pivot to username-recon for cross-platform enumeration

## OPSEC Notes

- Most web-based tools (BoardReader, Blog Search Engine, Reddit search tools) are **Passive** — they query indexed public data
- **ReconXplorer** is marked **Active** — it performs direct reconnaissance against targets including Discord tokens; use from a clean environment
- **IRCP** and **ircsnapshot** are marked **Active** — they connect directly to IRC servers and may be logged by server operators; your IP and connection metadata will be visible
- IRC tools create real connections that are observable; use a VPN or proxy and a non-attributable nickname
- Reddit search tools query public APIs and archives; no registration required for most
- Discord bot directories are passive; however, Discord token-based tools may violate Discord ToS
- Google Groups queries are logged by Google if performed while signed in

## Delegation

### Tool Lookup

```text
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Online Communities tool search",
  prompt="Find OSINT tools for Online Communities.\n
    Read skills/online-communities/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```text
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Online Communities investigation: [target]",
  prompt="Investigate using Online Communities tools: [target]\n\n
    Primary: Read skills/online-communities/references/tools.md\n
    Secondary: Read skills/username-recon/references/tools.md\n
    Execute available CLI tools (IRCP, ircsnapshot for IRC; ReconXplorer
    for Discord), query web resources, report findings.\n
    Start with passive search engines before active IRC/Discord probing."
)
```
