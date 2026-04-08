---
name: documentation-evidence
description: >-
  Screenshot tools, web archiving, evidence preservation, and documentation
  capture. Use when the user mentions: screenshot, evidence capture, web
  archive, documentation, preserve evidence, screen recording, timeline,
  map evidence, archival, note-taking, forensic capture.
user-invocable: false
---

# Documentation & Evidence Capture

Screenshot tools, web archiving, evidence preservation, and documentation
capture for OSINT investigations.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service.

## Tools Reference

Read `skills/documentation-evidence/references/tools.md` for the complete
list of 15 free tools in this category.

## Web Resources

| Tool | URL | Best For |
| ------ | ----- | ---------- |
| Forensic OSINT | forensicosint.com | Forensic-grade web evidence capture and documentation |
| Fiddler | telerik.com/download/fiddler | HTTP traffic capture and session inspection |
| Burp Suite | portswigger.net/burp | Web traffic interception and request analysis |
| Page2Images | page2images.com | Automated live site screenshot generation |
| Archive.is | archive.is | Permanent web page archival with timestamped snapshots |
| Web Page Saver | magnetforensics.com | Forensic-quality web page preservation |
| Snapper | github.com/dxa4481/Snapper | Mass screenshot tool for large URL lists |
| Full Page Screen Capture | Chrome Extension | Full-page browser screenshot capture |
| EZR OSINT Sidebar | Chrome Extension | OSINT workflow sidebar for in-browser research |
| FRAPS | fraps.com | Screen recording and video capture |
| ShareX | getsharex.com | Advanced screenshot and screen recording with annotation |
| Greenshot | getgreenshot.org | Lightweight screenshot tool with editing |
| Google Street View Hyperlapse | github.com/TeehanLax/Hyperlapse.js | Animated Street View path documentation |
| ZeeMaps | zeemaps.com | Interactive map creation for location evidence |
| Timeline JS3 | timeline.knightlab.com | Interactive timeline creation for event documentation |

## Subcategories

- **Web Browsing Capture** -- HTTP traffic interception and session recording (Fiddler, Burp Suite, Forensic OSINT)
- **Screenshots** -- Full-page and element-level screen capture (ShareX, Greenshot, FRAPS, Snapper, Page2Images, Full Page Screen Capture)
- **Archival** -- Permanent web page preservation with timestamps (Archive.is, Web Page Saver)
- **Note-taking & Presentation** -- Organize findings into timelines, maps, and structured reports (Timeline JS3, ZeeMaps, EZR OSINT Sidebar)

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Documentation & Evidence Capture tool search",
  prompt="Find OSINT tools for Documentation & Evidence Capture.\n
    Read skills/documentation-evidence/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Documentation & Evidence Capture investigation: [target]",
  prompt="Investigate using Documentation & Evidence Capture tools: [target]\n\n
    Primary: Read skills/documentation-evidence/references/tools.md\n
    Execute available CLI tools, query web resources, report findings."
)
```

## Investigation Workflow

1. **Capture**: Take screenshots or full-page captures of target content before it changes or disappears
2. **Archive**: Submit URLs to Archive.is for timestamped, immutable snapshots
3. **Traffic Analysis**: Use Fiddler or Burp Suite to capture HTTP requests and responses for deeper analysis
4. **Organize**: Plot events on Timeline JS3 or map locations with ZeeMaps
5. **Annotate**: Add notes, highlights, and context to captured evidence using ShareX or Greenshot
6. **Preserve Chain of Custody**: Record timestamps, URLs, and hashes for all captured artifacts
7. **Cross-reference**: Pivot to `archives-cache` for historical versions and `images-videos` for media analysis

## Cross-Category Pivots

| When you find... | Pivot to |
| ------------------ | ---------- |
| Archived page versions needed | `archives-cache` -- Wayback Machine, cached pages |
| Images or video in captured evidence | `images-videos` -- Reverse image search, EXIF analysis |
| Geographic locations in evidence | `geolocation` -- Mapping and geo-verification |
| Domain or URL context needed | `domain-recon` -- WHOIS, DNS, hosting analysis |

## OPSEC Notes

- All 15 tools are **passive** -- no direct contact with the target
- Archive.is creates a public snapshot; consider whether archiving alerts the target via analytics
- Burp Suite and Fiddler intercept local traffic only; do not use against systems you do not own
- Screenshots and recordings should be hashed (SHA-256) immediately for evidence integrity
- Browser extensions (EZR OSINT Sidebar, Full Page Screen Capture) may leak browsing data to extension developers
- Use a dedicated research browser profile to avoid cross-contamination with personal browsing
