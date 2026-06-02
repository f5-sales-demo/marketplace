---
description: >-
  Check container environment status and available development tools
---

Delegate to the container-introspector agent to check devcontainer status.

## Delegation

Spawn the container-introspector agent with the following instructions:

1. Detect container runtime: check for `/.dockerenv` or `/run/.containerenv`
2. If in a container, report container identity: `cat /etc/hostname 2>/dev/null`
3. Count available development tools from the tool catalog
4. Check key tools: `git --version`, `node --version`, `bun --version`, `python3 --version`
5. Report:
   - Container detected (yes/no)
   - Container hostname
   - Number of development tools available
   - Key tool versions (git, node, bun, python3)
6. If not in a container, note that some devcontainer features may not be available
