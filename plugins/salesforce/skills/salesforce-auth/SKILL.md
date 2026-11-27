---
name: salesforce-auth
description: Route Salesforce authentication requests to xcsh's reviewed, human-only plugin setup flow.
user-invocable: false
---

# Salesforce authentication

Authentication is owned by the generic integration lifecycle. Do not run Salesforce login or credential-configuration commands from a model turn.

Ask the user to run `xcsh plugin setup salesforce` in an interactive terminal. That command displays the immutable installer and login argv, required plugin dependencies, inherited environment-variable names, collected profile categories, and verification command before requesting confirmation.

Never echo, request, log, persist, or place credential values in command arguments. Authentication-dependent tools must report `setup_required` with the same canonical setup command until the shared integration probe reports `ready`.

When authentication is valid, setup reuses it and reviews discovered private configuration. It refreshes metadata and preserves confirmed mappings at `~/.xcsh/private/salesforce/config.json` or the user-owned `SF_PIPELINE_CONFIG` path. Custom business meaning remains unresolved until confirmed. Cancellation and invalid mappings do not write the file; ordinary tools and probes only read it.
