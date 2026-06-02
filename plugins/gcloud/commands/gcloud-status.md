---
description: >-
  Check Google Cloud CLI authentication status and show current
  project configuration
---

Delegate to the cli-operator agent to check Google Cloud connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify gcloud CLI is installed: `gcloud version`
2. List authenticated accounts: `gcloud auth list`
3. Show current configuration: `gcloud config list --format=json`
4. Report:
   - gcloud CLI version
   - Active account
   - Current project
   - Default region and zone
5. If no accounts are authenticated, suggest using
   `/gcloud:gcloud-login`
