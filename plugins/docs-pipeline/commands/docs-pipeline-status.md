---
description: >-
  Check documentation pipeline configuration and build readiness
---

Delegate to the pipeline-operator agent to check docs pipeline status.

## Delegation

Spawn the pipeline-operator agent with the following instructions:

1. Check if pipeline configuration exists: look for `astro.config.*`, `package.json` with astro dependency
2. Check if build tools are available: `bun --version` or `npm --version`
3. Check managed files configuration: look for `.claude/governance.json`
4. Report:
   - Pipeline configuration detected (yes/no)
   - Build tool available and version
   - Managed files governance active (yes/no)
   - Available commands: /docs-pipeline:preview-docs
4. If pipeline not configured, suggest reviewing the plugin README
