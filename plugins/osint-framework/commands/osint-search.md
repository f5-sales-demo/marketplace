---
description: Search the OSINT tool catalog for tools matching a query
argument-hint: "<query>"
---

# /osint-search

Search the OSINT Framework tool catalog for tools matching your query.

## Delegation

```
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="OSINT tool search: [args]",
  prompt="Search the OSINT tool catalog for: [args]\n\n
    1. Read skills/osint-catalog/references/tree-index.md to identify matching categories\n
    2. Read the references/tools.md file for each matching category\n
    3. Filter to tools matching the query\n
    4. Return a structured table of matching tools"
)
```
