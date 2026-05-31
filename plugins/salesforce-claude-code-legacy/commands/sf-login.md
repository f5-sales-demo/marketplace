---
description: >-
  Authenticate to a Salesforce org using container-adapted
  auth methods (JWT, access-token, SFDX URL, or web login)
argument-hint: "[org-alias]"
---

Delegate to the cli-operator agent to handle Salesforce authentication.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. The user-provided alias is `$ARGUMENTS` (use `my-dev-org` if empty).
2. Run `sf org list --json` to check existing orgs.
3. If orgs exist, report them and ask if the user wants to reuse one.
4. For a new org, check credentials in order — use the first fully
   satisfied option:
   - `SF_ACCESS_TOKEN` + `SF_ORG_INSTANCE_URL` both set →
     `sf org login access-token`
   - `SF_JWT_KEY_FILE` + `SF_CLIENT_ID` + `SF_USERNAME` all set →
     `sf org login jwt`
   - `SFDX_AUTH_URL` set →
     `echo "$SFDX_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin=-`
   - None fully satisfied → suggest `sf org login web`
5. Do NOT choose an option unless all required env vars are present.
6. Use the alias in the `--alias` flag.
7. After auth, run
   `sf org display --target-org <alias> --json` to confirm.
8. Never echo tokens or auth URLs in output.

## After Authentication

Report the result:

- **Connected:** Show org alias, username, instance URL, and API version
- **Failed:** Show the error and suggest checking credentials
- **No credentials:** Explain how to set up environment variables
