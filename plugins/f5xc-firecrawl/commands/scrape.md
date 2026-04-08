---
description: Scrape a URL and extract content as markdown using local firecrawl
argument-hint: "<url> [--format markdown,html,links] [--wait <ms>]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to scrape "$ARGUMENTS".

Use the SCRAPE protocol. Parse the arguments:

- First argument is the URL
- `--format` or `-f`: output formats (comma-separated)
- `--wait`: milliseconds to wait for JavaScript rendering
- `--html`: shortcut for format HTML
- `--full`: disable onlyMainContent (include nav/footer)

If no URL is provided, ask the user for one.
