---
name: web-scraper
description: >-
  Local firecrawl web scraping, crawling, site mapping, web search,
  structured extraction, and llms.txt generation. Activates when the
  user asks to scrape a URL, crawl a website, map site URLs, search
  the web, extract structured data from pages, generate llms.txt,
  batch scrape multiple URLs, cancel a crawl, list active crawls,
  convert a web page to markdown, or fetch page content. Uses the
  self-hosted firecrawl instance on localhost:3002 — no API keys or
  subscriptions required.
user-invocable: false
---

# Web Scraper (Local Firecrawl)

This skill provides web scraping, crawling, URL mapping, web search,
LLM-powered extraction, and llms.txt generation via the local
self-hosted firecrawl API. All operations run against
`http://localhost:3002` with no authentication required.

Delegate to the firecrawl-operator agent to keep API payloads out of
the main session context.

## Capabilities

| Operation | What it does | Endpoint | Type |
| ----------- | ------------- | ---------- | ------ |
| **Scrape** | Extract content from a single URL | `POST /v1/scrape` | Sync |
| **Batch Scrape** | Scrape multiple URLs at once | `POST /v1/batch/scrape` | Async |
| **Crawl** | Crawl multiple pages from a starting URL | `POST /v1/crawl` | Async |
| **Crawl Cancel** | Cancel a running crawl job | `DELETE /v1/crawl/:id` | Sync |
| **Crawl Active** | List all active crawl jobs | `GET /v1/crawl/active` | Sync |
| **Crawl Errors** | Get error details for a crawl | `GET /v1/crawl/:id/errors` | Sync |
| **Map** | Discover all URLs on a website | `POST /v1/map` | Sync |
| **Search** | Web search with optional scraping | `POST /v1/search` | Sync |
| **Extract** | LLM-powered structured data extraction | `POST /v1/extract` | Async |
| **llms.txt** | Generate llms.txt for a site | `POST /v1/llmstxt` | Async |

## Delegation Protocol

When this skill activates, delegate immediately to the firecrawl-operator agent.

### For scrape requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Scrape: [URL in 3 words]",
  prompt="PROTOCOL: SCRAPE\nURL: <the target URL>\nFORMATS: <requested formats or 'markdown'>\nOPTIONS: <any user-specified options like onlyMainContent, waitFor, etc.>\n\nScrape this URL and return the content."
)
```

### For batch scrape requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Batch scrape: [count] URLs",
  prompt="PROTOCOL: BATCH_SCRAPE\nURLS: <comma-separated list of URLs>\nFORMATS: <requested formats or 'markdown'>\n\nBatch scrape these URLs and return results."
)
```

### For crawl requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Crawl: [URL in 3 words]",
  prompt="PROTOCOL: CRAWL\nURL: <the target URL>\nLIMIT: <page limit, default 10>\nOPTIONS: <any user-specified options like maxDepth, includePaths, etc.>\n\nCrawl this site and return page summaries."
)
```

### For crawl management requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Crawl mgmt: [action]",
  prompt="PROTOCOL: CRAWL_CANCEL|CRAWL_ACTIVE|CRAWL_ERRORS\nJOB_ID: <if applicable>\n\nExecute the requested crawl management operation."
)
```

### For map requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Map: [URL in 3 words]",
  prompt="PROTOCOL: MAP\nURL: <the target URL>\nOPTIONS: <any user-specified options like search, includeSubdomains, etc.>\n\nMap all URLs on this site."
)
```

### For search requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Search: [query in 3 words]",
  prompt="PROTOCOL: SEARCH\nQUERY: <the search query>\nLIMIT: <result limit, default 5>\nOPTIONS: <any options like lang, country, tbs, scrapeOptions>\n\nSearch the web and return results."
)
```

### For extract requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="Extract: [what] from [URL]",
  prompt="PROTOCOL: EXTRACT\nURLS: <target URLs>\nPROMPT: <what to extract>\nSCHEMA: <JSON schema if user specified one>\n\nExtract structured data from these URLs."
)
```

### For llms.txt requests

```
Agent(
  subagent_type="f5xc-firecrawl:firecrawl-operator",
  description="llms.txt: [URL in 3 words]",
  prompt="PROTOCOL: LLMSTXT\nURL: <the target URL>\n\nGenerate an llms.txt file for this site."
)
```

Wait for the agent's response and relay it directly to the user.

## When to activate

- "scrape this URL" / "scrape https://..."
- "batch scrape" / "scrape these URLs" / "scrape multiple pages"
- "crawl this website" / "crawl https://..."
- "cancel the crawl" / "stop the crawl" / "list active crawls"
- "map this site" / "find all URLs on"
- "search for" / "search the web for" / "web search"
- "extract data from" / "extract structured data" / "pull fields from"
- "generate llms.txt" / "create llms.txt" / "make an llms.txt"
- "convert this page to markdown"
- "fetch page content" / "get markdown from"
- Any request to read, extract, or search web content

## What this does NOT do

- **No cloud API** — uses local self-hosted instance only
- **No API keys** — no FIRECRAWL_API_KEY needed
- **No browser sessions** — cloud-only feature
- **No deep research** — cloud-only feature
- **Extract requires LLM proxy** — needs OPENAI_BASE_URL configured
