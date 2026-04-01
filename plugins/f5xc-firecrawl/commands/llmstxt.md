---
description: Generate an llms.txt file for a website using local firecrawl
argument-hint: "<url>"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to generate llms.txt for "$ARGUMENTS".

Use the LLMSTXT protocol. Parse the arguments:

- First argument is the target URL
- `--max-urls`: max URLs to process
- `--full`: include full text content

If no URL is provided, ask the user for one.
