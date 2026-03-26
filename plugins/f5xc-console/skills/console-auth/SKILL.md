---
name: console-auth
description: >-
  Azure SSO authentication for the F5 Distributed Cloud console.
  Handles both cached sessions (single-click re-login) and full
  MFA flow (username → password → DUO verified push). Use when
  the user says "log in", "authenticate", "sign in to the
  console", or when any console workflow requires an active
  session.
user-invocable: false
---

# Console Authentication — Azure SSO

Authenticate to the F5 Distributed Cloud console using Azure
SSO. Supports two modes automatically detected at runtime:

- **Cached session** — user previously selected "Stay signed
  in: Yes"; clicking "Sign in with Azure" auto-completes login
- **Full MFA** — username entry, password entry, DUO verified
  push (3-digit code), "Stay signed in?" confirmation

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | `https://f5-amer-ent.console.ves.volterra.io` | Tenant URL |
| `F5XC_USERNAME` | Full MFA only | — | Azure AD email |
| `F5XC_CONSOLE_PASSWORD` | Full MFA only | — | Azure AD password |

## Prerequisites

- Chrome DevTools MCP server connected to the Claude Code session
- Browser instance open and accessible via MCP
- VPN connection if required by tenant network policy

## Authentication Flow

### Step 1: Read configuration

Read the tenant URL from `F5XC_API_URL`. If not set, default to
`https://f5-amer-ent.console.ves.volterra.io`.

Derive the login URL: `${F5XC_API_URL}/web/login`

### Step 2: Detect current state

Use `take_snapshot` on the current browser page.

- **Already authenticated** — URL contains `/web/home` or
  `/web/workspaces` or page title is "F5 Distributed Cloud
  Console" with workspace elements visible → skip auth,
  report success immediately
- **Login page visible** — URL contains `login.ves.volterra.io`
  or snapshot shows "Sign in with Azure" → proceed to Step 3
- **Other page** — navigate to the login URL, then proceed

Note: Navigating to `${F5XC_API_URL}/web/login` redirects to
`login.ves.volterra.io` which hosts the SSO selection page.

### Step 3: Click "Sign in with Azure"

```
take_snapshot()
```

Find the Azure SSO button — it appears as a link with text
"Sign In with Azure" on the `login.ves.volterra.io` page.
Click it:

```
click(uid=<sign-in-with-azure-link-uid>)
```

### Step 4: Mode detection

Wait up to 15 seconds for one of these outcomes:

```
wait_for(text=["Pick an account", "Sign in",
               "Enter your email", "web/home"],
         timeout=15000)
take_snapshot()
```

Determine the path:

- **URL contains `/web/home`** → cached session succeeded.
  Jump to Step 9 (verification).
- **"Pick an account" visible** → click the account matching
  `F5XC_USERNAME`, then monitor for auto-completion or MFA.
- **Email/username input visible** ("Enter your email, phone,
  or Skype") → full MFA flow. Continue.

### Step 5: Username entry (Full MFA)

Azure AD uses a two-screen login. First screen: email.

```
take_snapshot()
fill(uid=<email-input-uid>, value="${F5XC_USERNAME}")
click(uid=<next-button-uid>)
wait_for(text=["Enter password", "Password"], timeout=10000)
```

### Step 6: Password entry (Full MFA)

Second screen: password.

```
take_snapshot()
fill(uid=<password-input-uid>, value="${F5XC_CONSOLE_PASSWORD}")
click(uid=<signin-button-uid>)
wait_for(text=["Verification Required", "Approve sign-in request",
               "Stay signed in", "web/home"], timeout=10000)
```

### Step 7: DUO redirect (Full MFA)

After password entry, Azure shows a "Verification Required"
screen with text "You will be redirected to DUO to verify
your identity" and a **Continue** button.

```
take_snapshot()
click(uid=<continue-button-uid>)
wait_for(text=["Enter code in Duo Mobile", "Check your phone",
               "Duo Push"], timeout=15000)
```

### Step 8: DUO Verified Push

DUO uses a **verified push** — it displays a 3-digit
verification code on screen that the user must enter in the
Duo Mobile app on their phone.

```
take_snapshot()
```

Extract the 3-digit code from the snapshot text (it appears
as a standalone number like "403", "127", etc.).

Report to the operator:

> **DUO verification code: [CODE]**
>
> Enter this code in the Duo Mobile app on your phone.

Then wait for approval:

```
wait_for(text=["Stay signed in", "web/home"], timeout=60000)
```

If timeout expires, the DUO push timed out. Take a snapshot
to check for a "Try again" button. If found, click it and
repeat this step (extract new code, report to operator).

### Step 8b: "Stay signed in?"

After DUO approval, Azure shows "Stay signed in?" prompt.

```
take_snapshot()
click(uid=<yes-button-uid>)   # Click "Yes" to persist session
wait_for(text=["F5 Distributed Cloud", "Welcome", "Home"],
         timeout=30000)
```

Note: The console is a heavy SPA that may take 15-30 seconds
to fully load after authentication completes.

### Step 9: Verification

```
take_snapshot()
```

Confirm success:

- URL contains `/web/home` or a known console path
- Page title is "F5 Distributed Cloud Console"
- Snapshot contains workspace elements (e.g., "Welcome to
  the F5 Distributed Cloud Console", "Common workspaces",
  "Web App & API Protection")

Report structured result:

```
## Console Authentication: SUCCESS
- Tenant: ${F5XC_API_URL}
- User: ${F5XC_USERNAME}
- Mode: Cached Session | Full MFA
- Page: Home
```

## Error Handling

| Failure | Detection | Action |
| --------- | ----------- | -------- |
| VPN not connected | Navigation timeout or DNS error | Report: "Cannot reach tenant. Check VPN." |
| Invalid credentials | "Wrong password" or "Account doesn't exist" | Report error. Do NOT retry (lockout risk). |
| DUO timeout | `wait_for` exceeds 60s on DUO screen | Click "Try again" if available, relay new code. |
| Account locked | "Your account has been locked" | Report immediately. Do NOT retry. |
| Conditional Access | "You cannot access this" | Report: "Conditional Access policy blocked." |
| Session expired | Redirect to `login.ves.volterra.io` mid-workflow | Re-invoke this auth flow automatically. |
| Azure AD outage | "Something went wrong" page | Report: "Azure AD service error." |
| Console load timeout | SPA stuck loading after auth | Wait up to 30s, then retry navigation to `/web/home`. |

## Security

- Credentials are read from environment variables only
- Passwords are never logged, stored in files, or echoed
- The `F5XC_CONSOLE_PASSWORD` value is passed directly to the
  browser `fill` tool and is not retained after use
- Session cookies are managed by the browser, not the plugin
