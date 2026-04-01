---
description: Search the web and optionally scrape results using local firecrawl
argument-hint: "<query> [--limit <n>] [--scrape]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to search "$ARGUMENTS".

Use the SEARCH protocol. Parse the arguments:

- First argument(s) form the search query
- `--limit` or `-l`: max results (default: 5, max: 100)
- `--scrape`: also scrape content from result URLs
- `--lang`: language code (e.g., "en")
- `--country`: country code (e.g., "us")
- `--time`: time filter — `hour`, `day`, `week`, `month`, `year`

If no query is provided, ask the user for one.
