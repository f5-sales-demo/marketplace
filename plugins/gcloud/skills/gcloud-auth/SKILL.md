---
name: gcloud-auth
description: Route Google Cloud authentication requests to xcsh's reviewed, human-only plugin setup flow.
user-invocable: false
---

# Google Cloud authentication

Authentication is owned by the generic integration lifecycle. Do not run Google Cloud login or credential-configuration commands from a model turn.

Ask the user to run `xcsh plugin setup gcloud` in an interactive terminal. That command displays the immutable installer and login argv, required plugin dependencies, inherited environment-variable names, collected profile categories, and verification command before requesting confirmation.

Never echo, request, log, persist, or place credential values in command arguments. Authentication-dependent tools must report `setup_required` with the same canonical setup command until the shared integration probe reports `ready`.

For CE Marketplace qualification, Google can separately require prerequisite
Cloud terms before enabling the Consumer Procurement API. If enablement returns
`UREQ_TOS_NOT_ACCEPTED`, direct the user to
[Google Cloud terms](https://console.developers.google.com/terms/cloud), signed in
with the same account used by `gcloud`. After acceptance, retry scoped API
enablement and verify agreement qualification. Login success and prerequisite
terms acceptance do not establish consent to the F5 image agreement.
