# f5xc-firecrawl

Local self-hosted web scraping plugin for Claude Code using the open-source
[firecrawl](https://github.com/mendableai/firecrawl) engine.

No API keys. No subscriptions. No cloud dependency. All scraping runs against
the local firecrawl instance on `localhost:3002` inside the devcontainer.

## Skills

| Skill | Purpose |
| ------- | ------- |
| `web-scraper` | Auto-activates on scrape/crawl/map/search/extract requests; delegates to firecrawl-operator agent |

## Agents

| Agent | Purpose |
| ------- | ------- |
| `firecrawl-operator` | Executes curl + jq against local firecrawl API; 11 protocols covering all v1 endpoints |

## Commands

| Command | Purpose |
| --------- | --------- |
| `/scrape <url>` | Scrape a single URL and extract content |
| `/batch-scrape <url1> <url2>` | Scrape multiple URLs at once |
| `/crawl <url>` | Crawl multiple pages from a starting URL |
| `/map <url>` | Discover all URLs on a website |
| `/search <query>` | Search the web and optionally scrape results |
| `/extract <url> <prompt>` | LLM-powered structured data extraction |
| `/llmstxt <url>` | Generate an llms.txt file for a site |

## Operations

### Scrape — Extract single page content

```
/scrape https://docs.example.com/getting-started
/scrape https://example.com --format markdown,links --wait 2000
```

### Batch Scrape — Multiple URLs at once

```
/batch-scrape https://example.com https://example.org https://example.net
```

### Crawl — Multi-page site crawl

```
/crawl https://docs.example.com --limit 20 --depth 2
/crawl https://docs.example.com --include /api/* --exclude /blog/*
```

### Map — Discover site URLs

```
/map https://docs.example.com
/map https://docs.example.com --search api --subdomains
```

### Search — Web search

```
/search "firecrawl web scraping" --limit 10
/search "AI tools 2026" --scrape --time month
```

### Extract — LLM-powered structured extraction

```
/extract https://example.com "Extract the main heading and any links"
/extract https://example.com/pricing --schema '{"plans": [{"name": "string", "price": "string"}]}'
```

Requires LLM proxy configured (OPENAI_BASE_URL).

### llms.txt — Generate LLM-readable site summary

```
/llmstxt https://docs.example.com
```

## Supported Protocols

| Protocol | Endpoint | Type | Description |
| ---------- | ---------- | ------ | ------------- |
| HEALTH | `GET /` | Sync | API health check |
| SCRAPE | `POST /v1/scrape` | Sync | Single URL content extraction |
| BATCH_SCRAPE | `POST /v1/batch/scrape` | Async | Multi-URL batch extraction |
| CRAWL | `POST /v1/crawl` | Async | Site crawling |
| CRAWL_CANCEL | `DELETE /v1/crawl/:id` | Sync | Cancel running crawl |
| CRAWL_ACTIVE | `GET /v1/crawl/active` | Sync | List active crawls |
| CRAWL_ERRORS | `GET /v1/crawl/:id/errors` | Sync | Crawl error details |
| MAP | `POST /v1/map` | Sync | URL discovery |
| SEARCH | `POST /v1/search` | Sync | Web search |
| EXTRACT | `POST /v1/extract` | Async | LLM structured extraction |
| LLMSTXT | `POST /v1/llmstxt` | Async | llms.txt generation |

## Infrastructure

This plugin requires the firecrawl stack running in the devcontainer:

| Component | Port | Purpose |
| ----------- | ------ | --------- |
| Firecrawl API | 3002 | All scrape/crawl/map/search/extract endpoints |
| Playwright | 3000 | JavaScript rendering engine |
| Redis | 6379 | Job queue backend |
| PostgreSQL | socket | Crawl/batch job persistence |
| LiteLLM proxy | OPENAI_BASE_URL | LLM backend for extract (optional) |

The stack starts automatically via `entrypoint.sh` when `ENABLE_FIRECRAWL=true`
(the default).

A `SessionStart` hook checks that the firecrawl API is reachable on
`localhost:3002` and prints a warning if the service is down.

## Extract LLM Configuration

The extract endpoint requires an OpenAI-compatible LLM proxy. Set these
environment variables in the firecrawl API startup:

```
OPENAI_API_KEY=<your-proxy-key>
OPENAI_BASE_URL=<your-litellm-proxy-url>
```

The extract feature uses `gpt-4o-mini` by default. Override with `MODEL_NAME`.

## Differences from Cloud Firecrawl

This plugin uses the self-hosted open-source version:

- No authentication or API keys required for scraping
- No credit limits or rate limiting
- Uses v1 API endpoints (not v2)
- Browser sessions and deep research not available
- Extract uses your own LLM proxy instead of Firecrawl's hosted models
- Runs entirely within the local container network
