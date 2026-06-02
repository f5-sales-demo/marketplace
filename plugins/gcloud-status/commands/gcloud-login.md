---
description: >-
  Authenticate to Google Cloud using container-adapted auth methods
  (service account key, application default credentials, or browser login)
argument-hint: "[project-id]"
---

Delegate to the cli-operator agent to handle Google Cloud authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. The user-provided project ID is `$ARGUMENTS` (use
   `$CLOUDSDK_CORE_PROJECT` or `$GOOGLE_CLOUD_PROJECT` if empty).
2. Run `gcloud auth list` to check existing authentication.
3. If accounts exist, report them and ask if the user wants to
   reuse one.
4. For new authentication, check credentials in order -- use the
   first fully satisfied option:
   - `GOOGLE_APPLICATION_CREDENTIALS` is set and file exists ->
     `gcloud auth activate-service-account --key-file "$GOOGLE_APPLICATION_CREDENTIALS"`
   - Explicit key file path provided ->
     `gcloud auth activate-service-account --key-file <path>`
   - None satisfied ->
     `gcloud auth login --no-launch-browser`
5. Do NOT choose an option unless all required env vars are present.
6. After auth, if a project ID was provided or env var is set, run
   `gcloud config set project <project-id>`.
7. After auth, run
   `gcloud auth print-access-token --quiet` to confirm.
8. Never echo service account keys or access tokens in output.

## After Authentication

Report the result:

- **Connected:** Show active account, project, region, and zone
- **Failed:** Show the error and suggest checking credentials
- **No credentials:** Explain how to set up environment variables
