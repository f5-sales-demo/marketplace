---
description: Extract structured data from URLs using LLM-powered extraction via local firecrawl
argument-hint: "<url> [<prompt>] [--schema <json>]"
allowed_tools:
  - Bash
  - Agent
---

Invoke the `f5xc-firecrawl:web-scraper` skill to extract data from "$ARGUMENTS".

Use the EXTRACT protocol. Parse the arguments:

- First argument is the URL (or comma-separated URLs)
- Remaining text (if any) is the extraction prompt
- `--schema`: JSON schema for structured output
- `--schema-file`: path to a JSON schema file

At least one of prompt or schema is required. Schema-only usage is valid:
`/extract https://example.com --schema '{"name":"string","price":"number"}'`

Requires LLM proxy (OPENAI_BASE_URL) configured in the firecrawl environment.

If no URL is provided, ask the user for one.
If neither prompt nor schema is provided, ask the user for at least one.
