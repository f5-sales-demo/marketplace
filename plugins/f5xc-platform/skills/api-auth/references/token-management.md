# API Token Management Reference

Detailed reference for F5 XC API token lifecycle,
authentication patterns, and troubleshooting.

## Token Lifecycle

### Creation

API tokens are created in the F5 XC console:
1. Navigate to **System → Tenant Management → API Credentials**
   (path: `/web/system/tenant_management/api_credentials`)
2. Click **Add API Credential**
3. Select credential type: **API Token**
4. Set name, expiration date, and role bindings
5. Copy the generated token immediately — it cannot be
   viewed again after creation

### Expiration

- Tokens have a configurable expiration date set at creation
- Expired tokens return HTTP 401
- There is no auto-renewal — a new token must be created
- Best practice: set calendar reminders for token rotation

### Rotation

1. Create a new token before the old one expires
2. Update `F5XC_API_TOKEN` env var with the new value
3. Verify the new token works (see validation procedure)
4. Revoke the old token in the console

## Token Scopes and Permissions

API tokens inherit permissions from their role bindings:

| Role | Scope | Capabilities |
| ---- | ----- | ------------ |
| `ves-io-admin-role` | Tenant-wide | Full read/write access |
| `ves-io-monitor-role` | Tenant-wide | Read-only monitoring |
| `namespace-admin` | Namespace | Full access within namespace |
| `namespace-monitor` | Namespace | Read-only within namespace |

A token with insufficient permissions returns HTTP 403 with
a message indicating the required role.

## Authentication Header Format

### API Token

```
Authorization: APIToken <token-value>
```

The token value is a long base64-encoded string. Example
cURL usage:

```bash
curl -s \
  -H "Authorization: APIToken ${F5XC_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "${F5XC_API_URL}/api/web/namespaces"
```

### P12 Certificate

P12 certificates provide mutual TLS authentication without
a token header:

```bash
curl -s \
  --cert-type P12 \
  --cert "${F5XC_P12_FILE}:${F5XC_P12_PASSWORD}" \
  -H "Content-Type: application/json" \
  "${F5XC_API_URL}/api/web/namespaces"
```

P12 files are generated in the console alongside API tokens.

## Common Error Responses

### 401 Unauthorized

```json
{
  "code": 401,
  "message": "Unauthorized"
}
```

Causes: expired token, malformed token, wrong header format.

### 403 Forbidden

```json
{
  "code": 403,
  "message": "Forbidden",
  "details": "insufficient permissions for this operation"
}
```

Causes: token lacks required role binding for the operation.

### 404 Not Found

```json
{
  "code": 404,
  "message": "Not Found"
}
```

Causes: resource does not exist, wrong namespace, typo in
resource name.

### 409 Conflict

```json
{
  "code": 409,
  "message": "Conflict",
  "details": "resource already exists"
}
```

Causes: attempting to create a resource that already exists.

## API Base URL Pattern

The API base URL is the same as the console URL:
```
https://<tenant>.console.ves.volterra.io
```

All API paths are appended to this base:
- `/api/web/namespaces` — namespace operations
- `/api/config/namespaces/{ns}/...` — config object CRUD
- `/api/data/namespaces/{ns}/...` — data/metrics queries

## Pagination

List endpoints may return paginated results. Check for:

```json
{
  "items": [...],
  "metadata": {
    "next_page": "token-string"
  }
}
```

To fetch the next page, include the token as a query param
or in the request body depending on the endpoint.
