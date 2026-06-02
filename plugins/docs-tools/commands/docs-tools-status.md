---
description: >-
  Check MDX documentation tooling readiness and content review capabilities
---

Delegate to the mdx-content-reviewer agent to check docs tooling status.

## Delegation

Spawn the mdx-content-reviewer agent with the following instructions:

1. Check if the current workspace has MDX content: look for `*.mdx` files
2. Check if Astro/Starlight configuration exists: look for `astro.config.*` files
3. Report:
   - MDX files found in workspace (count)
   - Astro/Starlight project detected (yes/no)
   - Content review capabilities available
   - Available commands: /docs-tools:review-mdx
4. If no MDX files found, note that this plugin is designed for MDX documentation projects
