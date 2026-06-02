---
description: >-
  Check sales engineering demo environment readiness and available workflows
---

Delegate to the demo-housekeeping agent to check sales engineer environment status.

## Delegation

Spawn the demo-housekeeping agent with the following instructions:

1. Check workspace for demo configuration files
2. Verify demo-related tools are available: `git --version`, check for infrastructure CLI tools
3. Report:
   - Available personas: demo-executor, presenter, subject-matter-expert
   - Available workflows: demo-ops, demo-executor
   - Workspace demo readiness (config files found/missing)
   - Available commands: /sales-engineer:sales-engineer-status
4. If demo environment needs setup, suggest reviewing the plugin README
