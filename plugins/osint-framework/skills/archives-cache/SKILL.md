---
name: archives-cache
description: >-
  Web archives, cached pages, and historical internet data retrieval.
  Use when the user mentions: web archive, wayback machine, cached page, internet archive, historical web.
user-invocable: false
---

# Archives & Cache

Web archives, cached pages, historical internet data retrieval,
code archives, and public dataset access.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/archives-cache/references/tools.md` for the complete
list of 21 free tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| Waybackpack | `pip install waybackpack` | `waybackpack example.com -d output_dir` |
| Wayback Machine Chrome Extension | Install from Chrome Web Store | Browser extension — auto-detects dead pages and loads Wayback snapshots |

### All Install Methods — Waybackpack

| Method | Command |
| -------- | --------- |
| pip | `pip install waybackpack` |
| Git clone | `git clone https://github.com/jsvine/waybackpack && cd waybackpack && pip install .` |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

### All Install Methods — Wayback Machine Chrome Extension

| Method | Command |
| -------- | --------- |
| Chrome Web Store | `https://chrome.google.com/webstore/detail/wayback-machine/fpnmgdkabkmnadcjpehmlllkndpkmiak` |
| pip | N/A |
| Git clone | N/A |
| go | N/A |
| apt | N/A |
| npm | N/A |
| Docker | N/A |
| brew | N/A |
| snap | N/A |
| cargo | N/A |

## Subcategories

- **Web Archives** — Historical site snapshots, regional archives, on-demand page capture (Internet Archive Wayback Machine, Archive.is, UK Web Archive, Web Archive-RU, Common Crawl)
- **Cache** — Cached page retrieval from search engines and archive providers (Cached Pages, Cached View)
- **RSS & Evidence Capture** — PDF snapshots, screenshot archives, visual timeline checks (PDF My URL, Screenshots.com)
- **Code Archives** — Bulk download of archived captures for offline analysis (Waybackpack)
- **Public Datasets** — Network graph data, ML benchmark datasets, academic corpora (Stanford SNAP, UCI Spambase, Visual Genome, Labeled Faces in the Wild)
- **Leak Archives** — Historical leaked documents and breach data discovery (Cryptome, WikiLeaks, Databases.Today)
- **Media Archives** — TV closed caption search, historical text files (TV Closed Caption Search, Textfiles.com, Anna's Archive)

## Investigation Workflow

1. **Wayback check**: Query the internet Archive Wayback Machine for historical snapshots of the target URL
2. **Bulk download**: Use Waybackpack (CLI) to batch-download all archived snapshots for offline analysis
3. **Cache fallback**: If Wayback has no results, check Cached Pages and Cached View for search-engine cached copies
4. **On-demand capture**: Use Archive.is to create a point-in-time snapshot before content changes or disappears
5. **Regional archives**: Check UK Web Archive and Web Archive-RU for geographically-specific web captures
6. **Common Crawl mining**: Query Common Crawl indices for large-scale historical content matching
7. **Evidence preservation**: Generate PDF captures via PDF My URL for court-admissible documentation
8. **Leak correlation**: Search Cryptome and WikiLeaks for related disclosures; check Databases.Today for breach exposure
9. **Media search**: Use TV Closed Caption Search for broadcast mentions; check Textfiles.com for early-internet artifacts

## Cross-Category Pivots

- **domain-recon** — Archived web pages reveal historical domain configurations, technologies, and ownership changes; pivot to domain-recon for current WHOIS, DNS, and subdomain analysis
- **documentation-evidence** — Archived snapshots serve as forensic evidence; pivot to documentation-evidence for evidence chain-of-custody and reporting workflows

## OPSEC Notes

- Most archive tools are **Passive** — they query existing public archives without alerting the target
- **Waybackpack** is **Passive** — it downloads from the internet Archive API; queries are logged by archive.org but not by the target
- **Archive.is** snapshots are **Passive** to retrieve but creating a new snapshot fetches the live page (the target may see the archiver's IP)
- **Anna's Archive** is marked **Active** and requires **registration** — it aggregates shadow library content; access may have legal implications in some jurisdictions
- **WikiLeaks** is marked **Active** — accessing the site may attract attention depending on jurisdiction and monitoring
- **Databases.Today** is marked **Active** and requires **registration** — it indices breach data; use with caution
- Common Crawl data is fully public and passive to access via S3/API
- When creating Archive.is snapshots, the target site sees a request from archive.is servers, not your IP

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Archives & Cache tool search",
  prompt="Find OSINT tools for Archives & Cache.\n
    Read skills/archives-cache/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Archives & Cache investigation: [target]",
  prompt="Investigate using Archives & Cache tools: [target]\n\n
    Primary: Read skills/archives-cache/references/tools.md\n
    Secondary: Read skills/domain-recon/references/tools.md\n
    Execute available CLI tools (waybackpack for bulk archive download),
    query web resources, report findings.\n
    Start with Wayback Machine lookups before broader archive searches."
)
```
