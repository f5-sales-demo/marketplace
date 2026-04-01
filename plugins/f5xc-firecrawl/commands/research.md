---
description: Research a question by searching the web, scraping results, and synthesizing an answer with citations
argument-hint: "<question> [--limit <n>] [--domains site1.com,site2.com]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to research "$ARGUMENTS".

Use the RESEARCH protocol. Parse the arguments:

- First argument(s) form the research question
- `--limit` or `-l`: max sources to fetch and scrape (default: 5, max: 100). Clamp any value above 100 to 100 and warn the user.
- `--domains` or `-d`: comma-separated list of domains to scope the search to

If no question is provided, ask the user for one.
