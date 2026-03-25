---
name: tool-catalog
description: >-
  Container tool knowledge base — knows every CLI tool installed in this
  devcontainer, organized by category. Activates when the user asks which
  tool to use, how to use a tool, whether something is installed, or needs
  help with tasks like sending email, scanning networks, converting files,
  managing cloud resources, automating browsers, or any operation that
  requires choosing the right installed CLI. Also activates when you need
  to determine which command-line tool is appropriate for a task.
user-invocable: false
---

# Devcontainer Tool Catalog

This container has 300+ tools pre-installed. Do NOT suggest installing
tools — check the catalog first. Delegate lookups to the tool-advisor
agent to preserve main context.

## Delegation Protocol

When this skill activates, delegate to the tool-advisor agent immediately:

```
Agent(
  subagent_type="f5xc-devcontainer:tool-advisor",
  description="Look up tools for: [summarize user's question in 5 words]",
  prompt="User asked: [user's exact question]\n\nSkill dir: ${CLAUDE_SKILL_DIR}\n\nIdentify the correct category from the index, read references/<file>.md, and return the best tool recommendation with purpose, quick-start commands, and auth requirements."
)
```

Wait for the agent's response and relay it directly to the user.

## When to activate

- "which tool should I use to..."
- "how do I [send email / scan a site / capture packets / deploy to AWS / ...]"
- "is [tool-name] installed?"
- "what CLI can I use to..."
- Any task requiring a command-line tool decision

## Important Notes

- All tools are pre-installed — do not suggest `apt install` or `pip install`
  unless the user explicitly wants to add something new
- Some security tools require elevated capabilities (NET_RAW, NET_ADMIN)
  which are granted via docker-compose.yml
- The container runs as user `vscode` — some tools may need `sudo`
- For tool drift detection (catalog vs Dockerfile), use the
  `f5xc-devcontainer:tool-auditor` agent
- To install, remove, or search for tools (and update the Dockerfile
  via GitHub issue), use the `f5xc-devcontainer:container-maintainer` agent
