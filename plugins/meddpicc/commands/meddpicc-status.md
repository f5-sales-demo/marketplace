---
description: >-
  Check MEDDPICC framework readiness and deal data availability
---

Delegate to the deal-analyst agent to check MEDDPICC framework status.

## Delegation

Spawn the deal-analyst agent with the following instructions:

1. Verify MEDDPICC schema exists: check for `schema/meddpicc-schema.json`
2. Check if any deal data files exist in the current workspace (*.json files matching schema)
3. Report:
   - Schema status (loaded/missing)
   - Number of deal files found in workspace
   - Available commands: /meddpicc:qualify-deal, /meddpicc:deal-review, /meddpicc:update-deal, /meddpicc:build-map, /meddpicc:champion-test
4. If no deals found, suggest starting with `/meddpicc:qualify-deal`
