---
description: Authenticate to the F5 Distributed Cloud console via Azure SSO
argument-hint: "[tenant-url]"
---

Invoke the `f5xc-console:console-auth` skill to authenticate
to the F5 XC console.

If the user provided a tenant URL as an argument (`$ARGUMENTS`),
use that as the target tenant instead of the `F5XC_API_URL`
environment variable.

Follow the skill's authentication flow exactly — detect session
state, handle cached or full MFA authentication, and report the
result.
