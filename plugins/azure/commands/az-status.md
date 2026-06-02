---
description: >-
  Check Azure CLI authentication status and list
  available subscriptions
---

Delegate to the cli-operator agent to check Azure connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify az CLI is installed: `az version --output json`
2. List available subscriptions: `az account list --output json`
3. For the active subscription, run:
   `az account show --output json`
4. Report:
   - az CLI version
   - Number of available subscriptions
   - Active subscription name, ID, tenant ID
   - User or service principal name
   - Subscription state (Enabled/Disabled)
5. If no subscriptions are available, suggest using
   `/azure:az-login`
