---
description: Search the OSINT tool catalog for tools matching a query
argument-hint: "<query>"
---

# /osint-search

Search the OSINT Framework tool catalog for tools matching your query.

## Scope and result

Search only the installed catalog references for the supplied query. Show source paths,
matched categories, total and shown counts, completion and the first twelve rows using
Tool, Type, OPSEC, Pricing and Match columns. Offer a continuation and the complete safe
evidence once. If the query is missing, ask for a query. If no catalog tools match, say so;
missing or truncated references are unavailable or partial rather than a successful empty search.
Do not open catalog URLs or run recommended tools as part of this command.

## Delegation

```text
Agent(
  subagent_type="osint-framework:osint-researcher",
  description="OSINT tool search: [args]",
  prompt="Search the OSINT tool catalog for: [args]\n\n
    1. Read skills/osint-catalog/references/tree-index.md to identify matching categories\n
    2. Read the references/tools.md file for each matching category\n
    3. Filter to tools matching the query\n
    4. Return a scoped first twelve rows preview, counts, completion and continuation; catalog reads only"
)
```
