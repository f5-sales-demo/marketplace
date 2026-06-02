---
description: >-
  Check Salesforce org connection status and list
  authenticated orgs
---

Delegate to the cli-operator agent to check Salesforce connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify sf CLI is installed: `sf --version`
2. List authenticated orgs: `sf org list --json`
3. For the default org (if set), run:
   `sf org display --json`
4. Report:
   - sf CLI version
   - Number of authenticated orgs
   - Default org alias, username, instance URL, connected status
   - API version
5. If no orgs are authenticated, suggest using `/salesforce:sf-login`
