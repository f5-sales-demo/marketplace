---
description: >-
  Check Firecrawl API service status and connectivity on localhost:3002
---

Delegate to the firecrawl-operator agent to check Firecrawl service readiness.

## Delegation

Spawn the firecrawl-operator agent with the following instructions:

1. Check if Firecrawl API is reachable: `curl -sf http://localhost:3002/ | head -c 200`
2. If reachable, check version: `curl -sf http://localhost:3002/v1/health 2>/dev/null | jq -r '.version // "unknown"'`
3. Report:
   - Firecrawl service status (reachable/unreachable)
   - Service version (if available)
   - API endpoint: `http://localhost:3002`
4. If not reachable, suggest checking that `ENABLE_FIRECRAWL=true` in devcontainer configuration
