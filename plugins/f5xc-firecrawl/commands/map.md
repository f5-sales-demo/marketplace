---
description: Discover all URLs on a website using local firecrawl
argument-hint: "<url> [--search <query>] [--subdomains]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to map "$ARGUMENTS".

Use the MAP protocol. Parse the arguments:

- First argument is the target URL
- `--search` or `-s`: filter URLs by keyword
- `--subdomains`: include subdomain URLs
- `--limit`: max URLs to return

If no URL is provided, ask the user for one.
