---
name: azure-auth
description: >-
  Container-adapted Azure CLI authentication. Supports managed identity,
  workload federation, service principal, device code, and browser login flows for headless
  environments. Use when the user says "login to azure", "az login",
  "authenticate azure", "connect subscription", or when any Azure
  operation fails with auth errors.
user-invocable: false
---

**Canonical skill URI**: `skill://azure:azure-auth`

# Azure CLI Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based login may not be available.

## Authentication Methods

### Method 1: Managed Identity (Recommended for Azure-Hosted)

Best for VMs, Container Instances, App Service, and other Azure-hosted
compute. No credentials needed — identity is assigned to the resource.

**Command:**

```bash
az login --identity --output json
```

For user-assigned managed identity:

```bash
az login --identity --client-id <CLIENT_ID> --output json
```

### Method 2: Service Principal Credentials

Use when workload federation is unavailable. Requires a registered application
with client credentials.

**Prerequisites:**

- App registration with a client secret or certificate
- `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` set
- A client secret or PEM certificate path for the chosen method

**Command:**

```bash
az login --service-principal \
  --username "$AZURE_CLIENT_ID" \
  --password "$AZURE_CLIENT_SECRET" \
  --tenant "$AZURE_TENANT_ID" \
  --output json
```

For certificate-based auth:

```bash
az login --service-principal \
  --username "$AZURE_CLIENT_ID" \
  --tenant "$AZURE_TENANT_ID" \
  --certificate /path/to/cert.pem \
  --output json
```

### Method 3: Device Code (Headless/Container)

Use when no browser is available and no service principal is configured.

**Command:**

```bash
az login --use-device-code --output json
```

### Method 4: Browser Login

Works when a browser is available (VNC enabled or desktop environment).

**Command:**

```bash
az login --output json
```

## Subscription and Cloud Scope

Keep an explicit subscription ID for every resource operation. Verify it without
changing global defaults:

```bash
az account show --subscription "$AZURE_SUBSCRIPTION_ID" --output json
az cloud show --query name --output tsv
```

Require the selected cloud to match the deployment. Do not run `az account set`
or `az cloud set` as part of CE planning or execution. A separate CLI configuration
directory can isolate authentication for a different cloud.

## Workload Federation

Prefer an existing federated identity over a client secret for automation.
Configure a matching issuer, subject and audience on the application, then use
`AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_FEDERATED_TOKEN_FILE`. The setup
wizard reads the issued token file privately and invokes `az login
--service-principal --username <client-id> --tenant <tenant-id>
--federated-token <issued-token>`. Never substitute the token into a displayed
command or transcript. Refresh the external token before retrying an expired login.

## Execution Workflow

1. Check existing sessions with `az account list --output json`. Verify the
   requested subscription and cloud before choosing an authentication method.
2. Prefer an explicitly selected managed identity, then complete federation
   credentials, a certificate, or a client secret. The setup wizard requires
   `AZURE_USE_MANAGED_IDENTITY=true` to select managed identity; `AZURE_CLIENT_ID`
   optionally selects a user-assigned identity.
3. Use device code for headless interactive login when workload credentials are
   unavailable. Let the user complete the first-party sign-in challenge.
4. Verify with `az account show --subscription <requested-id> --output json`.
   Resource commands must retain the same explicit subscription.
5. Keep login tokens, certificates, secrets and raw authentication failures out
   of tool output. The wizard uses a private subprocess for credential login.

See the current [Azure CLI login interface](https://learn.microsoft.com/en-us/cli/azure/reference-index#az-login).
`--client-id` selects managed identity; service principals retain `--username`.

## Environment Variables

| Variable                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `AZURE_CLIENT_ID`               | Service principal application (client) ID                |
| `AZURE_FEDERATED_TOKEN_FILE`    | Issued workload identity token file                      |
| `AZURE_CLIENT_CERTIFICATE_PATH` | PEM certificate and private key path                     |
| `AZURE_USE_MANAGED_IDENTITY`    | Set `true` to select managed identity                    |
| `AZURE_CLIENT_SECRET`           | Service principal client secret                          |
| `AZURE_TENANT_ID`               | Microsoft Entra ID tenant ID                             |
| `AZURE_SUBSCRIPTION_ID`         | Explicit subscription ID for verification and operations |
| `AZURE_DEFAULTS_GROUP`          | Default resource group for az commands                   |
| `AZURE_DEFAULTS_LOCATION`       | Default location/region for az commands                  |

## Security Rules

- Never echo client secrets, certificates, or tokens
- Use `$AZURE_CLIENT_SECRET` placeholder in output
- Prefer `--output json` for all commands
- Do not store credentials in project files
