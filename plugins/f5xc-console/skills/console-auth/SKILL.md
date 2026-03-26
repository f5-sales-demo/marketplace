---
name: console-auth
description: >-
  Multi-provider authentication for the F5 Distributed Cloud
  console. Auto-detects login type: native F5 XC login,
  Azure SSO with cached session, or Azure SSO with DUO verified
  push MFA. Use when the user says "log in", "authenticate",
  "sign in to the console", or when any console workflow
  requires an active session.
user-invocable: false
---

# Console Authentication

Authenticate to the F5 Distributed Cloud console. Supports
multiple auth providers automatically detected at runtime:

- **Native F5 XC login** — email + password on a single
  form (some tenants present credentials directly)
- **Azure SSO cached session** — user previously selected
  "Stay signed in: Yes"; single click auto-completes login
- **Azure SSO full MFA** — username → password → DUO verified
  push (3-digit code) → "Stay signed in?"

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | `https://<tenant>.console.ves.volterra.io` | Tenant URL |
| `F5XC_USERNAME` | Yes (for MFA/native) | — | Email address |
| `F5XC_CONSOLE_PASSWORD` | Yes (for MFA/native) | — | Password |

## Prerequisites

- Chrome DevTools MCP server connected to the Claude Code session
- Browser instance open and accessible via MCP
- VPN connection if required by tenant network policy

## Authentication Flow

### Step 1: Read configuration

Read the tenant URL from `F5XC_API_URL`. If not set, default to
`https://<tenant>.console.ves.volterra.io`.

Derive the login URL: `${F5XC_API_URL}/web/login`

### Step 2: Navigate and detect current state

Use `take_snapshot` on the current browser page.

- **Already authenticated** — URL contains `/web/home` or
  page title is "F5 Distributed Cloud Console" with workspace
  elements visible → skip auth, report success immediately
- **Login page visible** — proceed to Step 3
- **Other page** — navigate to the login URL, then proceed

Note: `${F5XC_API_URL}/web/login` redirects to an auth host.
Different tenants use different login hosts and auth methods.
The plugin auto-detects the auth type from the login page
content — no manual configuration is needed.

### Step 3: Detect auth provider

```
take_snapshot()
```

Examine the login page to determine the auth type:

- **Native F5 XC login** — page shows email and password
  fields directly, with a "Sign In" button and text like
  "Please enter your email address and password to log in."
  → Go to **Path A: Native Login**
- **Azure SSO** — page shows "Sign In with Azure" link and
  text "Please choose one of the options below to Log In."
  → Go to **Path B: Azure SSO**

---

## Path A: Native F5 XC Login

Single-screen email + password form. Some tenants present
credentials directly without an SSO provider selection.

### A1: Fill credentials

```
take_snapshot()
fill_form(elements=[
  {uid: <email-input>, value: "${F5XC_USERNAME}"},
  {uid: <password-input>, value: "${F5XC_CONSOLE_PASSWORD}"}
])
click(uid=<sign-in-button>)   # Text: "Sign In"
```

### A2: Wait for console

```
wait_for(text=["F5 Distributed Cloud", "Welcome",
               "Common workspaces", "Invalid"],
         timeout=30000)
take_snapshot()
```

If "Invalid" credentials text appears, report error and stop.
Otherwise jump to **Verification**.

---

## Path B: Azure SSO

### B1: Click "Sign in with Azure"

```
click(uid=<sign-in-with-azure-link>)
```

### B2: Mode detection

Wait up to 15 seconds for one of these outcomes:

```
wait_for(text=["Pick an account", "Sign in",
               "Enter your email", "web/home"],
         timeout=15000)
take_snapshot()
```

Determine the path:

- **URL contains `/web/home`** → cached session succeeded.
  Jump to **Verification**.
- **"Pick an account" visible** → click the account matching
  `F5XC_USERNAME`, then monitor for auto-completion or MFA.
- **Email/username input visible** → full MFA flow. Continue.

### B3: Username entry (Full MFA)

Azure AD uses a two-screen login. First screen: email.

```
take_snapshot()
fill(uid=<email-input>, value="${F5XC_USERNAME}")
click(uid=<next-button>)
wait_for(text=["Enter password", "Password"], timeout=10000)
```

### B4: Password entry (Full MFA)

```
take_snapshot()
fill(uid=<password-input>, value="${F5XC_CONSOLE_PASSWORD}")
click(uid=<signin-button>)
wait_for(text=["Verification Required", "Approve sign-in",
               "Stay signed in", "web/home"], timeout=10000)
```

### B5: DUO redirect

Azure shows "Verification Required" with text "You will be
redirected to DUO" and a **Continue** button.

```
take_snapshot()
click(uid=<continue-button>)
wait_for(text=["Enter code in Duo Mobile", "Check your phone"],
         timeout=15000)
```

### B6: DUO Verified Push

DUO displays a 3-digit verification code on screen that the
user must enter in the Duo Mobile app.

```
take_snapshot()
```

Extract the 3-digit code from the snapshot text.

Report to the operator:

> **DUO verification code: [CODE]**
>
> Enter this code in the Duo Mobile app on your phone.

Wait for approval:

```
wait_for(text=["Stay signed in", "web/home"], timeout=60000)
```

If timeout: take snapshot, click "Try again" if available,
extract new code, report again.

### B7: "Stay signed in?"

```
take_snapshot()
click(uid=<yes-button>)
wait_for(text=["F5 Distributed Cloud", "Welcome"],
         timeout=30000)
```

---

## Verification

```
take_snapshot()
```

Confirm success:

- URL contains `/web/home` or a known console path
- Page title is "F5 Distributed Cloud Console"
- Snapshot contains "Welcome to the F5 Distributed Cloud
  Console" or "Common workspaces"

Report structured result:

```
## Console Authentication: SUCCESS
- Tenant: ${F5XC_API_URL}
- User: ${F5XC_USERNAME}
- Mode: Native Login | Azure SSO Cached | Azure SSO Full MFA
- Page: Home
```

## Error Handling

| Failure | Detection | Action |
| --------- | ----------- | -------- |
| VPN not connected | Navigation timeout or DNS error | Report: "Cannot reach tenant. Check VPN." |
| Invalid credentials | "Invalid" or "Wrong password" text | Report error. Do NOT retry (lockout risk). |
| DUO timeout | `wait_for` exceeds 60s on DUO screen | Click "Try again" if available, relay new code. |
| Account locked | "Your account has been locked" | Report immediately. Do NOT retry. |
| Conditional Access | "You cannot access this" | Report: "Conditional Access policy blocked." |
| Session expired | Redirect to login host mid-workflow | Re-invoke this auth flow automatically. |
| Console load timeout | SPA stuck loading after auth | Wait up to 30s, retry navigation to `/web/home`. |

## Security

- Credentials are read from environment variables only
- Passwords are never logged, stored in files, or echoed
- The `F5XC_CONSOLE_PASSWORD` value is passed directly to the
  browser `fill` tool and is not retained after use
- Session cookies are managed by the browser, not the plugin
