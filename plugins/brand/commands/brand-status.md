---
description: >-
  Check F5 brand asset availability and configuration status
---

Delegate to the brand-operator agent to check brand compliance readiness.

## Delegation

Spawn the brand-operator agent with the following instructions:

1. Check if brand reference files exist in the plugin's references directory
2. Verify color palette reference is accessible
3. Verify typography rules reference is accessible
4. Report:
   - Brand reference files status (loaded/missing)
   - Color palette: number of defined colors
   - Typography rules: defined font families
   - Available commands: /brand:review-brand
5. If brand references are missing, note that the plugin may need reinstallation
