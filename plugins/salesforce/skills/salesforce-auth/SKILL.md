---
name: salesforce-auth
description: >-
  Container-adapted Salesforce org authentication. Supports JWT Bearer,
  access-token, and SFDX URL flows for headless environments. Also
  supports web login when a browser is available (VNC enabled). Use when
  the user says "login to salesforce", "authenticate org", "connect org",
  "sf login", or when any Salesforce operation fails with auth errors.
  Note: device flow (sf org login device) is BLOCKED since August 2025.
user-invocable: false
---

# Salesforce Org Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based login may not be available.

## Authentication Methods

### Method 1: JWT Bearer Flow (Recommended for Automation)

Best for CI/CD and automated environments. Requires a connected app
with a digital certificate configured in the Salesforce org.

**Prerequisites:**

- Connected App with OAuth enabled and digital certificate uploaded
- Private key file (`.key` or `.pem`) accessible in the container
- Consumer Key (Client ID) from the Connected App

**Command:**

```bash
sf org login jwt \
  --client-id <CONSUMER_KEY> \
  --jwt-key-file <PATH_TO_PRIVATE_KEY> \
  --username <USERNAME> \
  --alias my-dev-org \
  --set-default \
  --instance-url https://login.salesforce.com
```

### Method 2: Access Token (Environment Variable)

Use when an access token is available via environment variable.

**Setup:**

```bash
export SF_ACCESS_TOKEN="<your-access-token>"
export SF_ORG_INSTANCE_URL="https://myorg.my.salesforce.com"
```

**Command:**

```bash
sf org login access-token \
  --instance-url "$SF_ORG_INSTANCE_URL" \
  --alias my-dev-org \
  --set-default \
  --no-prompt
```

### Method 3: SFDX Auth URL

Use the force auth URL obtained from `sf org display --verbose`.

**Setup:**

```bash
export SFDX_AUTH_URL="force://..."
```

**Command:**

```bash
echo "$SFDX_AUTH_URL" | sf org login sfdx-url \
  --sfdx-url-stdin=- \
  --alias my-dev-org \
  --set-default
```

Never write the auth URL to a file — use `--sfdx-url-stdin=-` with a
pipe to avoid persisting credentials on disk.

### Method 4: Web Login (Browser Required)

Works when VNC is enabled (`ENABLE_VNC=true`) or a browser is
available. Opens a browser window for OAuth consent.

**Command:**

```bash
sf org login web \
  --alias my-dev-org \
  --set-default \
  --instance-url https://login.salesforce.com
```

### BLOCKED: Device Flow

`sf org login device` is **blocked since August 2025**. Salesforce
removed support for the default connected app's device flow. Use one
of the methods above instead.

## Validation

After authenticating, verify the connection:

```bash
sf org display --target-org my-dev-org --json
```

A successful response shows `connectedStatus: "Connected"`.

## Delegation

When executing auth commands, spawn the cli-operator agent with these
instructions:

1. Run `sf org list --json` to check existing connections.
2. Pick the first fully satisfied auth method in order:
   - `SF_ACCESS_TOKEN` + `SF_ORG_INSTANCE_URL` both set →
     `sf org login access-token`
   - `SF_JWT_KEY_FILE` + `SF_CLIENT_ID` + `SF_USERNAME` all set →
     `sf org login jwt`
   - `SFDX_AUTH_URL` set →
     `echo "$SFDX_AUTH_URL" | sf org login sfdx-url --sfdx-url-stdin=-`
   - None satisfied → `sf org login web` (requires browser/VNC)
3. Do NOT choose an option unless all its required env vars are set.
4. Never echo tokens or auth URLs in output.

## Environment Variables

| Variable              | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `SF_ACCESS_TOKEN`     | Bearer token for Method 2                                        |
| `SFDX_AUTH_URL`       | Force auth URL for Method 3                                      |
| `SF_ORG_INSTANCE_URL` | Org instance URL (default: `https://login.salesforce.com`)       |
| `SF_JWT_KEY_FILE`     | Path to JWT private key for Method 1                             |
| `SF_CLIENT_ID`        | Connected App consumer key for Method 1                          |
| `SF_USERNAME`         | Salesforce username for Method 1                                 |

## Security Rules

- Never echo access tokens, refresh tokens, or auth URLs
- Use `$SF_ACCESS_TOKEN` placeholder in output
- Never write credentials to disk — use stdin pipes (`--sfdx-url-stdin=-`)
- Do not store credentials in project files
