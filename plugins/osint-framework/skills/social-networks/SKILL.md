---
name: social-networks
description: >-
  Platform-specific OSINT — Facebook, Twitter/X, Instagram, LinkedIn,
  Reddit, TikTok, Fediverse/Mastodon, YouTube, Threads, and other
  social network analysis. Use when the user mentions: social media,
  Facebook, Twitter, X, Instagram, LinkedIn, Reddit, TikTok,
  Mastodon, Fediverse, YouTube, Threads, Bluesky, social network,
  "who is this account", "profile lookup", "social media investigation".
user-invocable: false
---

# Social Networks

Platform-specific OSINT — Facebook, Twitter/X, Instagram, LinkedIn,
Reddit, TikTok, Fediverse/Mastodon, YouTube, Threads, and other
social network investigation and analysis.

## Legal Notice

All tools use publicly available information only. Users must comply
with applicable laws and platform terms of service. Many social
platforms prohibit scraping and automated data collection; operators
must review each platform's ToS before using active tools.
Authenticated tools (marked with registration requirements) create
attribution risk.

## Tools Reference

Read `skills/social-networks/references/tools.md` for the complete
list of 63 free/freemium tools in this category.

## Key command-line tools

| Tool | Install | Usage |
| ------ | --------- | ------- |
| Fediverse_OSINT | `git clone https://github.com/cyfinoid/fediverse_osint && pip install -r requirements.txt` | `python fediverse_osint.py <username>` |
| Masto | `pip install masto` | `python masto.py -u user@example.com` |
| Osintgram | `git clone https://github.com/Datalux/Osintgram && pip install -r requirements.txt` | `python main.py <target>` |
| tweets_analyzer | `git clone https://github.com/x0rz/tweets_analyzer && pip install -r requirements.txt` | `python tweets_analyzer.py -n <handle>` |
| Birdwatcher | `gem install birdwatcher` | `birdwatcher` (interactive console) |
| Tinfoleak.py | `git clone https://github.com/vaguileradiaz/tinfoleak` | `python tinfoleak.py` |
| DMI-TCAT | `docker run --publish 80:80 -d digitalmethodsinitiative/tcat` | Web dashboard on port 80 |
| TweetVacuum | Chrome extension — clone and load unpacked, or install from Chrome Web Store | Browser extension UI |
| ScrapedIn | `git clone https://github.com/dchrastil/ScrapedIn && pip install -r requirements.txt` | `python scrapedin.py -u <query>` |
| InSpy | `git clone https://github.com/jobroche/InSpy && pip install -r requirements.txt` | `python InSpy.py --empspy <company> <wordlist>` |
| raven | `git clone https://github.com/0x09AL/raven && go build raven` | `./raven -company <name>` |
| TikTok-OSINT | `git clone https://github.com/Omicron166/TikTok-OSINT && pip3 install -r requirements.txt` | `python3 tiktok-osint.py -u <username>` |
| Unfurl | `pip install dfir-unfurl[all]` | `unfurl parse <url>` |
| yt-dlp | `pip install yt-dlp` | `yt-dlp --dump-json <url>` |
| Threads-Scraper | `git clone https://github.com/Zeeshanahmad4/Threads-Scraper && pip install -r requirements.txt` | `python scraper.py <profile_url>` |
| ThreadsRecon | `git clone https://github.com/offseq/threadsrecon && pip install -r requirements.txt` | `python3 threadsrecon.py -u <username>` |

## Subcategories

- **Facebook** — Profile lookups, ID resolution, account recovery checks, photo permalinks
- **Twitter/X** — Advanced search operators, date/location filters, behavioral analysis, tweet archival, follower analytics
- **Instagram** — Anonymous profile viewing, post/story extraction, hashtag analysis
- **LinkedIn** — Employee enumeration, email pattern discovery, org mapping, profile scraping
- **Reddit** — User behavior profiling, subreddit discovery, comment history visualization
- **TikTok** — Profile metadata extraction, video analysis
- **Fediverse/Mastodon** — Cross-instance user search, instance discovery, account investigation
- **YouTube** — Video evidence preservation, metadata export, subtitle extraction
- **Threads** — Post scraping, profile analysis, sentiment scoring, network visualization
- **Bluesky** — Emerging platform; monitor for new tooling
- **Steam, Discord & Gaming Networks** — Gaming identity correlation
- **Other Social Networks** — VK, Odnoklassniki, Tumblr, Myspace, Ask.fm, niche platforms
- **Cross-Platform Search** — Social Searcher, Google Social Search, Talkwalker

## Delegation

### Tool Lookup

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="Social networks tool search",
  prompt="Find OSINT tools for social network investigation.\n
    Read skills/social-networks/references/tools.md\n
    Return recommendations matching the user's specific need."
)
```

### Active Investigation

```
Agent(
  subagent_type="osint-framework:osint-investigator",
  description="Social networks investigation: [target]",
  prompt="Investigate social network target: [target]\n\n
    Primary: Read skills/social-networks/references/tools.md\n
    Secondary: Read skills/username-recon/references/tools.md\n
    Execute available CLI tools (yt-dlp, Masto, Unfurl), query web
    resources, report findings.\n
    Start with passive tools (web lookups, public searches) before
    active scraping or authenticated access."
)
```

## Investigation Workflow

1. **Identify platforms**: Determine which social networks the target uses (pivot from username-recon or email results)
2. **Passive reconnaissance**: Use web-based tools and public search interfaces (Twitter Advanced Search, Reddit Metis, Inflact) to gather profile data without authentication
3. **Profile analysis**: Collect profile metadata, posting history, follower/following relationships, and bio content
4. **Content preservation**: Archive posts, videos, and media with yt-dlp or platform-specific scrapers before content is deleted
5. **Behavioral profiling**: Analyze posting patterns, active hours, language, hashtag usage, and engagement metrics (tweets_analyzer, `Foll-er-dot-me`)
6. **Network mapping**: Map connections, followers, mentions, and reply relationships (TAGSExplorer, Birdwatcher, ThreadsRecon)
7. **Geolocation extraction**: Check for geotagged posts, location check-ins, and coordinate metadata (GeoSocial Footprint, Twitter Location Search)
8. **Cross-platform correlation**: Pivot to other platforms using shared usernames, profile photos, or linked accounts

## Executable Pipelines

For copy-paste-ready command sequences, see:
`skills/osint-catalog/references/investigation-pipelines.md` — Section 1 (Username) and Section 5 (Person) pipelines are most relevant for social network investigations.

## Cross-Category Pivots

- **username-recon** — Discovered social handles feed into username enumeration across additional platforms
- **people-search** — Social profile names and details pivot into people-search engines for real-world identity correlation
- **images-videos** — Profile photos and posted media pivot into reverse image search and EXIF analysis
- **email-address** — Email addresses found in social bios or linked accounts feed into email OSINT
- **domain-recon** — Personal sites or link-in-bio domains pivot into domain investigation
- **geolocation** — Geotagged posts and check-ins feed into mapping and location analysis

## OPSEC Notes

- **Passive vs. Active**: Web-based lookup tools (URL patterns, public search) are passive. CLI scrapers and authenticated API tools are active and may trigger rate limits, CAPTCHAs, or account flags.
- **Authentication risk**: Tools requiring login (Osintgram, ScrapedIn, Birdwatcher) tie investigations to operator accounts. Use dedicated research accounts, never personal ones.
- **Rate limiting**: Social platforms aggressively rate-limit API and scraping activity. Space requests and rotate sessions to avoid blocks.
- **Content volatility**: Social media posts can be deleted at any time. Preserve evidence early with yt-dlp, screenshots, or archival tools.
- **Platform ToS**: Scraping violates most platform terms of service. Understand legal exposure in your jurisdiction before using active collection tools.
- **Metadata leakage**: Some tools send referrer headers or resolve links through the target platform, potentially revealing investigator IP or session data. Use a VPN or isolated environment.
