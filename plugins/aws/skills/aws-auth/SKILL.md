---
name: aws-auth
description: Route AWS authentication requests to xcsh's reviewed, human-only plugin setup flow.
user-invocable: false
---

# AWS authentication

Authentication is owned by the generic integration lifecycle. Do not run AWS login or credential-configuration commands from a model turn.

Ask the user to run `xcsh plugin setup aws` in an interactive terminal. That command displays the immutable installer and login argv, required plugin dependencies, inherited environment-variable names, collected profile categories, and verification command before requesting confirmation.

Never echo, request, log, persist, or place credential values in command arguments. Authentication-dependent tools must report `setup_required` with the same canonical setup command until the shared integration probe reports `ready`.
