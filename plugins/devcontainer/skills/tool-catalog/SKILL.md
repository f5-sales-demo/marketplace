---
name: tool-catalog
description: >-
  Recommend tools for an explicitly identified devcontainer. Compare the catalog with observed runtime inventory before claiming tools are installed. Ordinary host tool selection stays with host capabilities.
user-invocable: false
---

**Canonical skill URI**: `skill://devcontainer:tool-catalog`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# Devcontainer Tool Catalog

The catalog describes expected tools. Verify the identified container
using runtime inspection; execute lookups directly by reading references.
Optional tool-advisor delegation is available for large catalog searches.

## Direct execution and optional delegation

When this skill activates, optionally delegate to the tool-advisor agent immediately:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="devcontainer:tool-advisor",
  description="Look up tools for: [summarize user's question in 5 words]",
  prompt="User asked: [user's exact question]\n\nSkill dir: ${CLAUDE_SKILL_DIR}\n\nIdentify the correct category from the index, read references/<file>.md, and return the best tool recommendation with purpose, quick-start commands, and auth requirements."
)
```

Complete the requested operation and verify usable results before responding.
If delegated, review the result and integrate it with independent work.

## Target and inventory

Use only when the request identifies a container. Observe its runtime identity
and executable inventory directly before asserting installed tools, user,
capabilities, or version. A catalog describes expected tools; discrepancies
remain visible. Independent host work continues if the container is unavailable.

## Important Notes

- Tool availability must be observed; install only within separately authorized setup scope
- Some security tools require elevated capabilities (NET_RAW, NET_ADMIN)
  which are granted via docker-compose.yml
- Observe the actual container user and required capabilities
- For tool drift detection (catalog vs Dockerfile), use the
  `devcontainer:tool-auditor` agent
- To install, remove, or search for tools (and update the Dockerfile
  via GitHub issue), use the `devcontainer:container-maintainer` agent
