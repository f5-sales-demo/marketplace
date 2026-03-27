# f5xc-platform

F5 Distributed Cloud platform automation — web console UI
via Chrome DevTools MCP and REST API management via cURL.
Provides Azure SSO authentication, deterministic console
navigation, API token management, and a foundation for
workflow automation across both interfaces.

## Prerequisites

### Console (Web UI)
- **Chrome DevTools MCP server** connected to the session
- **Browser instance** open and accessible via MCP
- **VPN connection** if required by tenant network policy

### API (REST)
- **F5XC_API_TOKEN** environment variable set with a valid
  API token, or P12 certificate file available
- **VPN connection** if required by tenant network policy

## Environment Variables

| Variable | Domain | Required | Purpose |
| -------- | ------ | -------- | ------- |
| `F5XC_API_URL` | Both | No (has default) | Tenant base URL |
| `F5XC_USERNAME` | Console | Full MFA only | Azure AD email address |
| `F5XC_CONSOLE_PASSWORD` | Console | Full MFA only | Azure AD password |
| `F5XC_API_TOKEN` | API | Yes (unless P12) | API token for REST calls |
| `F5XC_P12_FILE` | API | No (alternative) | Path to P12 certificate |
| `F5XC_P12_PASSWORD` | API | With P12_FILE | P12 certificate password |
| `F5XC_NAMESPACE` | Both | No | Default namespace |

## Skills

| Skill | Type | Domain | Purpose |
| ----- | ---- | ------ | ------- |
| `platform-index` | Auto-activated | Both | Top-level router between console and API |
| `console-index` | Auto-activated | Console | Route console UI requests |
| `console-auth` | Auto-activated | Console | Azure SSO authentication (cached + MFA) |
| `console-navigator` | Auto-activated | Console | Navigate to console sections by name |
| `api-index` | Auto-activated | API | Route REST API requests |
| `api-auth` | Auto-activated | API | API token and P12 certificate auth |

## Agents

| Agent | Domain | Purpose |
| ----- | ------ | ------- |
| `console-operator` | Console | Autonomous browser automation executor |
| `api-operator` | API | Autonomous REST API executor (cURL + jq) |

## Commands

| Command | Purpose |
| ------- | ------- |
| `/login-console` | Authenticate to the F5 XC console |
| `/check-api-token` | Validate your F5 XC API token |

## Console Authentication Modes

### Cached Session (fast)

If the user previously authenticated and selected "remember
this device", the plugin clicks "Sign in with Azure" and the
session resumes automatically. Takes 3-8 seconds.

### Full MFA (interactive)

When no cached session exists:

1. Navigate to login page
2. Click "Sign in with Azure"
3. Enter username (from `F5XC_USERNAME`)
4. Enter password (from `F5XC_CONSOLE_PASSWORD`)
5. DUO verified push — plugin reads the 3-digit code from
   screen and relays it to the user to enter in Duo Mobile
6. "Stay signed in?" — plugin clicks Yes for future caching
7. Console loads

## API Authentication

### API Token (recommended)

Set `F5XC_API_TOKEN` and run `/check-api-token` to verify.
Tokens are created in the console at System > Tenant
Management > API Credentials.

### P12 Certificate

Set `F5XC_P12_FILE` and `F5XC_P12_PASSWORD` for mutual TLS
authentication without a token header.

## Usage Examples

```
# Console: Authenticate
/login-console

# Console: Navigate to a section
"Navigate to HTTP Load Balancers in the demo namespace"

# Console: Check current location
"Where am I in the console?"

# API: Validate token
/check-api-token

# API: List resources
"List all namespaces via the API"

# API: Get resource details
"Get the HTTP load balancer 'my-lb' in namespace 'demo' via API"
```

## Security

- Credentials are read from environment variables only
- Passwords and tokens are never logged, stored, or echoed
- Session cookies are managed by the browser, not the plugin
- API tokens use `$F5XC_API_TOKEN` placeholders in output
