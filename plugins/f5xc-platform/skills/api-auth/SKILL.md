---
name: api-auth
description: >-
  API authentication for the F5 Distributed Cloud platform.
  Supports API token header authentication and P12 certificate
  authentication. Includes token validation procedure.
  Use when the user says "check token", "validate token",
  "API authentication", or when any API workflow requires
  verified credentials.
user-invocable: false
---

# API Authentication

Manages authentication for F5 XC REST API operations.

## Authentication Methods

### Method 1: API Token (Recommended)

Uses the `Authorization: APIToken <token>` header.

**Environment variable**: `F5XC_API_TOKEN`

```bash
curl -s -H "Authorization: APIToken ${F5XC_API_TOKEN}" \
  "${F5XC_API_URL}/api/web/namespaces" | jq .
```

### Method 2: P12 Certificate

Uses a PKCS#12 certificate file for mutual TLS.

**Environment variables**: `F5XC_P12_FILE`, `F5XC_P12_PASSWORD`

```bash
curl -s --cert-type P12 \
  --cert "${F5XC_P12_FILE}:${F5XC_P12_PASSWORD}" \
  "${F5XC_API_URL}/api/web/namespaces" | jq .
```

## Token Validation Procedure

To verify a token is valid and has appropriate permissions:

1. **Check env vars are set**:
   ```bash
   test -n "${F5XC_API_TOKEN}" && test -n "${F5XC_API_URL}"
   ```

2. **Call the namespaces endpoint** (lightweight, always available):
   ```bash
   HTTP_CODE=$(curl -s -o /tmp/f5xc-auth-check.json \
     -w '%{http_code}' \
     -H "Authorization: APIToken ${F5XC_API_TOKEN}" \
     "${F5XC_API_URL}/api/web/namespaces")
   ```

3. **Interpret the result**:
   - `200` — Token is valid, list namespaces in response
   - `401` — Token expired or invalid
   - `403` — Token valid but insufficient permissions
   - Network error — Check F5XC_API_URL connectivity

4. **Report token status**:
   ```bash
   jq -r '.items[] | .name' /tmp/f5xc-auth-check.json
   ```

## Environment Variables

| Variable | Purpose | Required |
| -------- | ------- | -------- |
| `F5XC_API_URL` | Tenant base URL | Yes |
| `F5XC_API_TOKEN` | API token string | Yes (unless P12) |
| `F5XC_P12_FILE` | Path to P12 certificate | No |
| `F5XC_P12_PASSWORD` | P12 certificate password | No |

## Security Rules

- Tokens must come from environment variables only
- Never echo or log token values in output
- When displaying cURL commands, use `$F5XC_API_TOKEN`
  placeholder, never the actual value
- Clean up temporary files after validation

## Cross-Reference

API tokens are managed in the F5 XC console at:
**System → Tenant Management → API Credentials**
(URL path: `/web/system/tenant_management/api_credentials`)

See `console-navigator/references/url-patterns.md` for the
full console URL catalog.
