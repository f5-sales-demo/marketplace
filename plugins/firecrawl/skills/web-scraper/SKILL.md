---
name: web-scraper
description: >-
  Use for explicit Firecrawl requests or a selected scraping, crawling, extraction, or mapping operation using the local Firecrawl service. Generic research uses available host research capabilities. A missing service affects only the selected Firecrawl operation.
user-invocable: false
---

**Canonical skill URI**: `skill://firecrawl:web-scraper`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# Web Scraper (Local Firecrawl)

This skill provides web scraping, crawling, URL mapping, web search,
LLM-powered extraction, and llms.txt generation via the local
self-hosted firecrawl API. All operations run against
`http://localhost:3002` with no authentication required.

Optionally delegate to the firecrawl-operator agent to keep API payloads out of
the main session context.

## Capabilities

| Operation        | What it does                             | Endpoint                   | Type  |
| ---------------- | ---------------------------------------- | -------------------------- | ----- |
| **Scrape**       | Extract content from a single URL        | `POST /v1/scrape`          | Sync  |
| **Batch Scrape** | Scrape multiple URLs at once             | `POST /v1/batch/scrape`    | Async |
| **Crawl**        | Crawl multiple pages from a starting URL | `POST /v1/crawl`           | Async |
| **Crawl Cancel** | Cancel a running crawl job               | `DELETE /v1/crawl/:id`     | Sync  |
| **Crawl Active** | List all active crawl jobs               | `GET /v1/crawl/active`     | Sync  |
| **Crawl Errors** | Get error details for a crawl            | `GET /v1/crawl/:id/errors` | Sync  |
| **Map**          | Discover all URLs on a site              | `POST /v1/map`             | Sync  |
| **Search**       | Web search with optional scraping        | `POST /v1/search`          | Sync  |
| **Extract**      | LLM-powered structured data extraction   | `POST /v1/extract`         | Async |
| **llms.txt**     | Generate llms.txt for a site             | `POST /v1/llmstxt`         | Async |
| **Research**     | Search + scrape + synthesize answer      | Multiple                   | Sync  |

## Direct execution and optional delegation

Execute the selected Firecrawl operation directly using its documented API.
For large payloads, optionally delegate to firecrawl-operator.

### For scrape requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Scrape: [URL in 3 words]",
  prompt="PROTOCOL: SCRAPE\nURL: <the target URL>\nFORMATS: <requested formats or 'markdown'>\nOPTIONS: <any user-specified options like onlyMainContent, waitFor, etc.>\n\nScrape this URL and return the content."
)
```

### For batch scrape requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Batch scrape: [count] URLs",
  prompt="PROTOCOL: BATCH_SCRAPE\nURLS: <comma-separated list of URLs>\nFORMATS: <requested formats or 'markdown'>\n\nBatch scrape these URLs and return results."
)
```

### For crawl requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Crawl: [URL in 3 words]",
  prompt="PROTOCOL: CRAWL\nURL: <the target URL>\nLIMIT: <page limit, default 10>\nOPTIONS: <any user-specified options like maxDepth, includePaths, etc.>\n\nCrawl this site and return page summaries."
)
```

### For crawl management requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Crawl mgmt: [action]",
  prompt="PROTOCOL: CRAWL_CANCEL|CRAWL_ACTIVE|CRAWL_ERRORS\nJOB_ID: <if applicable>\n\nExecute the requested crawl management operation."
)
```

### For map requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Map: [URL in 3 words]",
  prompt="PROTOCOL: MAP\nURL: <the target URL>\nOPTIONS: <any user-specified options like search, includeSubdomains, etc.>\n\nMap all URLs on this site."
)
```

### For search requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Search: [query in 3 words]",
  prompt="PROTOCOL: SEARCH\nQUERY: <the search query>\nLIMIT: <result limit, default 5>\nOPTIONS: <any options like lang, country, tbs, scrapeOptions>\n\nSearch the web and return results."
)
```

### For extract requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="Extract: [what] from [URL]",
  prompt="PROTOCOL: EXTRACT\nURLS: <target URLs>\nPROMPT: <what to extract>\nSCHEMA: <JSON schema if user specified one>\n\nExtract structured data from these URLs."
)
```

### For llms.txt requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-operator",
  description="llms.txt: [URL in 3 words]",
  prompt="PROTOCOL: LLMSTXT\nURL: <the target URL>\n\nGenerate an llms.txt file for this site."
)
```

### For research requests

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="firecrawl:firecrawl-researcher",
  description="Research: [topic in 3 words]",
  prompt="QUESTION: <the user's natural language question>\nLIMIT: <number of sources, default 5>\nDOMAINS: <comma-separated domain scope, or 'none'>\n\nResearch this question using web search + scrape and return a structured report."
)
```

Complete the requested operation and verify usable results before responding.
If delegated, review the result and integrate it with independent work.

## Selection and service failures

Use for explicit Firecrawl requests or when Firecrawl is chosen for a scraping,
crawling, mapping, or extraction operation. Execute directly using the protocol
details in firecrawl-operator. Optional delegation handles large payloads.
Observe service readiness before claiming it works. If unavailable, report the
scoped failure and continue independent research through available web_search,
HTTP, or browser capabilities without changing credentials or deploying services.

## What this does NOT do

- **No cloud API** — uses local self-hosted instance only
- **No API keys** — no FIRECRAWL_API_KEY needed
- **No browser sessions** — cloud-only feature
- **No deep research** — cloud-only feature
- **Extract requires LLM proxy** — needs OPENAI_BASE_URL configured
- **Research requires working search** — firecrawl SEARCH endpoint must be operational
