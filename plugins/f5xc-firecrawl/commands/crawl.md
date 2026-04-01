---
description: Crawl a website and extract content from multiple pages using local firecrawl
argument-hint: "<url> [--limit <n>] [--depth <n>] [--include <paths>]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to crawl "$ARGUMENTS".

Use the CRAWL protocol. Parse the arguments:

- First argument is the starting URL
- `--limit` or `-l`: max pages to crawl (default: 10)
- `--depth`: maximum link depth
- `--include`: URL path patterns to include (comma-separated)
- `--exclude`: URL path patterns to exclude (comma-separated)
- `--subdomains`: include subdomain links

If no URL is provided, ask the user for one.
