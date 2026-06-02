---
name: azure-auth
description: >-
  Container-adapted Azure CLI authentication. Supports managed identity,
  service principal, device code, and browser login flows for headless
  environments. Use when the user says "login to azure", "az login",
  "authenticate azure", "connect subscription", or when any Azure
  operation fails with auth errors.
user-invocable: false
---

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
az login --identity --username <CLIENT_ID> --output json
```

### Method 2: Service Principal (Recommended for Automation)

Best for CI/CD pipelines and automated environments. Requires a
registered application with client credentials.

**Prerequisites:**

- App registration with a client secret or certificate
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` set

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
  --password /path/to/cert.pem \
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

## Subscription Selection

After login, set the active subscription:

```bash
az account set --subscription "$AZURE_SUBSCRIPTION_ID"
```

Or by name:

```bash
az account set --subscription "My Subscription Name"
```

## Validation

After authenticating, verify the connection:

```bash
az account show --output json
```

A successful response shows the active subscription name, ID, and
tenant ID.

## Delegation

When executing auth commands, spawn the cli-operator agent with these
instructions:

1. Run `az account list --output json` to check existing sessions.
2. Pick the first fully satisfied auth method in order:
   - Running inside Azure compute -> `az login --identity`
   - `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET` + `AZURE_TENANT_ID`
     all set -> `az login --service-principal`
   - None satisfied -> `az login --use-device-code`
3. Do NOT choose an option unless all its required env vars are set.
4. If `AZURE_SUBSCRIPTION_ID` is set, run
   `az account set --subscription "$AZURE_SUBSCRIPTION_ID"` after login.
5. After auth, run `az account show --output json` to confirm.
6. Never echo client secrets or certificates in output.

## Environment Variables

| Variable                | Purpose                                               |
| ----------------------- | ----------------------------------------------------- |
| `AZURE_CLIENT_ID`       | Service principal application (client) ID             |
| `AZURE_CLIENT_SECRET`   | Service principal client secret                       |
| `AZURE_TENANT_ID`       | Microsoft Entra ID tenant ID                          |
| `AZURE_SUBSCRIPTION_ID` | Default subscription ID to select after login         |
| `AZURE_DEFAULTS_GROUP`  | Default resource group for az commands                |
| `AZURE_DEFAULTS_LOCATION` | Default location/region for az commands             |

## Security Rules

- Never echo client secrets, certificates, or tokens
- Use `$AZURE_CLIENT_SECRET` placeholder in output
- Prefer `--output json` for all commands
- Do not store credentials in project files
