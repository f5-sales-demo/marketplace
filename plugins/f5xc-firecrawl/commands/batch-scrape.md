---
description: Batch scrape multiple URLs at once using local firecrawl
argument-hint: "<url1> <url2> [<url3>...] [--format markdown,html]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to batch scrape "$ARGUMENTS".

Use the BATCH_SCRAPE protocol. Parse the arguments:

- All URL arguments (space-separated) form the URL list
- `--format` or `-f`: output formats (comma-separated)
- `--full`: disable onlyMainContent

If no URLs are provided, ask the user for them.
