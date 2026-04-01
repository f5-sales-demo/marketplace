# Firecrawl Local API Reference (v1)

Base URL: `http://localhost:3002`

## Endpoints

### GET /

Health check. Returns:

```json
{"message": "Firecrawl API", "documentation_url": "https://docs.firecrawl.dev"}
```

---

### POST /v1/scrape

Scrape a single URL and extract content. Synchronous.

**Request:**

```json
{
  "url": "https://example.com",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "includeTags": ["article", "main"],
  "excludeTags": ["nav", "footer"],
  "waitFor": 0,
  "timeout": 30000
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| url | string | yes | — | Target URL to scrape |
| formats | string[] | no | ["markdown"] | Output formats: markdown, html, rawHtml, links, screenshot |
| onlyMainContent | boolean | no | true | Strip navigation, footer, sidebar |
| includeTags | string[] | no | — | Only keep content in these HTML tags |
| excludeTags | string[] | no | — | Remove content in these HTML tags |
| waitFor | integer | no | 0 | Wait ms for JavaScript rendering |
| timeout | integer | no | 30000 | Request timeout in ms |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "markdown": "# Title\n\nContent...",
    "html": "<html>...</html>",
    "rawHtml": "<html>...</html>",
    "links": ["https://..."],
    "metadata": {
      "title": "Page Title",
      "description": "Meta description",
      "language": "en",
      "url": "https://example.com",
      "sourceURL": "https://example.com",
      "statusCode": 200,
      "contentType": "text/html"
    }
  }
}
```

---

### POST /v1/batch/scrape

Scrape multiple URLs in one request. Async — returns job ID.

**Request:**

```json
{
  "urls": ["https://example.com", "https://example.org"],
  "formats": ["markdown"]
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| urls | string[] | yes | — | List of URLs to scrape |
| formats | string[] | no | ["markdown"] | Output formats |
| onlyMainContent | boolean | no | true | Strip nav/footer |

**Response (200):**

```json
{
  "success": true,
  "id": "<job-id>",
  "url": "http://localhost:3002/v1/batch/scrape/<job-id>"
}
```

### GET /v1/batch/scrape/:id

Check batch scrape job status.

**Response (completed):**

```json
{
  "status": "completed",
  "total": 2,
  "completed": 2,
  "data": [
    { "markdown": "...", "metadata": { "title": "...", "url": "..." } }
  ]
}
```

---

### POST /v1/crawl

Start an async crawl job for multiple pages.

**Request:**

```json
{
  "url": "https://example.com",
  "limit": 10,
  "maxDepth": 3,
  "includePaths": ["/docs/*"],
  "excludePaths": ["/blog/*"],
  "allowSubdomains": false,
  "allowExternalLinks": false,
  "ignoreSitemap": false
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| url | string | yes | — | Starting URL |
| limit | integer | no | 10 | Max pages to crawl |
| maxDepth | integer | no | — | Maximum link depth |
| includePaths | string[] | no | — | URL path patterns to include |
| excludePaths | string[] | no | — | URL path patterns to exclude |
| allowSubdomains | boolean | no | false | Follow subdomain links |
| allowExternalLinks | boolean | no | false | Follow external links |
| ignoreSitemap | boolean | no | false | Skip sitemap.xml discovery |

**Response (200):**

```json
{
  "success": true,
  "id": "<crawl-job-id>",
  "url": "http://localhost:3002/v1/crawl/<crawl-job-id>"
}
```

### GET /v1/crawl/:id

Check crawl job status and retrieve results.

**Response (in progress):**

```json
{ "status": "scraping", "total": 10, "completed": 3 }
```

**Response (completed):**

```json
{
  "status": "completed",
  "total": 5,
  "completed": 5,
  "data": [
    { "markdown": "...", "metadata": { "title": "...", "url": "..." } }
  ]
}
```

### DELETE /v1/crawl/:id

Cancel a running crawl job.

### GET /v1/crawl/active

List all active crawl jobs.

**Response:**

```json
{
  "success": true,
  "crawls": [
    {
      "id": "...",
      "url": "https://...",
      "created_at": "2026-...",
      "options": { "limit": 10 }
    }
  ]
}
```

### GET /v1/crawl/:id/errors

Get error details for a crawl job.

---

### POST /v1/map

Discover all URLs on a website without scraping content. Synchronous.

**Request:**

```json
{
  "url": "https://example.com",
  "search": "pricing",
  "includeSubdomains": false,
  "limit": 5000
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| url | string | yes | — | Target website |
| search | string | no | — | Filter URLs by keyword |
| includeSubdomains | boolean | no | false | Include subdomain URLs |
| limit | integer | no | 5000 | Max URLs to return |

**Response (200):**

```json
{
  "success": true,
  "links": ["https://example.com/", "https://example.com/about"]
}
```

---

### POST /v1/search

Search the web and optionally scrape results. Synchronous.

**Request:**

```json
{
  "query": "web scraping tutorials",
  "limit": 5,
  "lang": "en",
  "country": "us",
  "tbs": "qdr:m",
  "scrapeOptions": {
    "formats": ["markdown"],
    "onlyMainContent": true
  }
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| query | string | yes | — | Search query |
| limit | integer | no | 5 | Max results (up to 100) |
| lang | string | no | — | Language code |
| country | string | no | — | Country code |
| tbs | string | no | — | Time filter: qdr:h/d/w/m/y |
| scrapeOptions | object | no | — | Scrape result pages (formats, onlyMainContent, etc.) |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "url": "https://...",
      "title": "Result Title",
      "description": "Result description..."
    }
  ]
}
```

With `scrapeOptions`, each result also includes `markdown`, `html`, etc.

---

### POST /v1/extract

LLM-powered structured data extraction. Async — returns job ID.
Requires OPENAI_BASE_URL and OPENAI_API_KEY configured.

**Request:**

```json
{
  "urls": ["https://example.com"],
  "prompt": "Extract the main topic and any contact information",
  "schema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string" },
      "email": { "type": "string" }
    }
  }
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| urls | string[] | yes | — | URLs to extract from (supports wildcards) |
| prompt | string | no* | — | What to extract (natural language) |
| schema | object | no* | — | JSON schema for structured output |
| enableWebSearch | boolean | no | false | Expand beyond specified URLs |

*At least one of `prompt` or `schema` is required.

**Response (200):**

```json
{ "success": true, "id": "<extract-job-id>" }
```

### GET /v1/extract/:id

Check extract job status.

**Response (completed):**

```json
{
  "success": true,
  "status": "completed",
  "data": { "topic": "...", "email": "..." }
}
```

---

### POST /v1/llmstxt

Generate an llms.txt file for a website. Async — returns job ID.

**Request:**

```json
{
  "url": "https://example.com",
  "maxUrls": 100,
  "showFullText": false
}
```

| Field | Type | Required | Default | Description |
| ------- | -------- | ---------- | --------- | ------------- |
| url | string | yes | — | Target website URL |
| maxUrls | integer | no | — | Max URLs to process |
| showFullText | boolean | no | false | Include full content |

**Response (200):**

```json
{ "success": true, "id": "<llmstxt-job-id>" }
```

### GET /v1/llmstxt/:id

Check llms.txt job status.

**Response (completed):**

```json
{
  "status": "completed",
  "data": "# example.com\n\n> Description...\n\n## Pages\n..."
}
```

---

## Infrastructure

| Component | Address | Purpose |
| ----------- | --------- | --------- |
| Firecrawl API | localhost:3002 | Main API |
| Playwright | localhost:3000 | JavaScript rendering |
| Redis | localhost:6379 | Job queue |
| PostgreSQL | /var/run/postgresql | Crawl persistence |
| LiteLLM proxy | OPENAI_BASE_URL | LLM for extract (optional) |

## Differences from Cloud API

| Feature | Cloud (v2) | Local (v1) |
| --------- | ----------- | ------------ |
| Authentication | Bearer token required | None needed |
| Browser sessions | Available | Not available |
| Deep research | Available | Not available |
| Rate limits | Per-plan credits | Unlimited (local) |
| Endpoint prefix | /v2/ | /v1/ |
| Extract LLM | Hosted by Firecrawl | Your own LLM proxy |
