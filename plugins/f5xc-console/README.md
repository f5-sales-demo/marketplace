# f5xc-console

F5 Distributed Cloud web console automation via Chrome DevTools
MCP. Provides Azure SSO authentication, deterministic console
navigation, and a foundation for workflow automation.

## Prerequisites

- **Chrome DevTools MCP server** connected to the Claude Code
  session
- **Browser instance** open and accessible via MCP
- **VPN connection** if required by tenant network policy

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | `https://<tenant>.console.ves.volterra.io` | Tenant console URL |
| `F5XC_USERNAME` | Full MFA only | — | Azure AD email address |
| `F5XC_CONSOLE_PASSWORD` | Full MFA only | — | Azure AD password |
| `F5XC_NAMESPACE` | No | — | Default namespace for navigation |

## Skills

| Skill | Type | Purpose |
| ------- | ------ | --------- |
| `console-auth` | Auto-activated | Azure SSO authentication (cached + MFA) |
| `console-navigator` | Auto-activated | Navigate to console sections by name |
| `console-index` | Auto-activated | Route ambiguous intent to correct skill |

## Agents

| Agent | Purpose |
| ------- | --------- |
| `console-operator` | Autonomous browser automation executor |

## Commands

| Command | Purpose |
| --------- | --------- |
| `/login-console` | Authenticate to the F5 XC console |

## Authentication Modes

### Cached Session (fast)

If the user previously authenticated and selected "remember
this device", the plugin clicks "Sign in with Azure" and the
session resumes automatically. Takes 3–8 seconds.

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

## Usage Examples

```
# Authenticate to the console
/login-console

# Authenticate to a specific tenant
/login-console https://my-tenant.console.ves.volterra.io

# Navigate to a section (after auth)
"Navigate to HTTP Load Balancers in the demo namespace"

# Check current location
"Where am I in the console?"
```

## Security

- Credentials are read from environment variables only
- Passwords are never logged, stored in files, or echoed
- Session cookies are managed by the browser, not the plugin
