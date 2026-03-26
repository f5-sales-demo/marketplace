# Authentication Flows — MCP Tool Sequences

Detailed Chrome DevTools MCP tool call sequences for each
authentication path. Validated against multiple tenants with
different login configurations on 2026-03-26.

## Path N: Native F5 XC Login

Precondition: Tenant uses native email/password authentication
(no SSO provider). Some tenants present credentials directly
on the login page.

```
1. navigate_page(url="${F5XC_API_URL}/web/login")
   # Redirects to the tenant's login host
2. take_snapshot()
   # Detect: page shows email + password fields directly
   # with "Please enter your email address and password"
3. fill_form(elements=[
     {uid: <email-textbox>, value: "${F5XC_USERNAME}"},
     {uid: <password-textbox>, value: "${F5XC_CONSOLE_PASSWORD}"}
   ])
4. click(uid=<sign-in-button>)   # Text: "Sign In"
5. wait_for(text=["F5 Distributed Cloud", "Welcome",
                  "Common workspaces", "Invalid"],
            timeout=30000)
6. take_snapshot()   # Verify console loaded
```

Expected duration: 5-15 seconds.

Detection: The login page shows both email and password fields
on the same screen, with text "Please enter your email address
and password to log in." and a "Sign In" button. There is no
"Sign in with Azure" or SSO provider selection.

## Path A: Azure SSO Cached Session (Single-Click)

Precondition: User previously authenticated and selected
"Stay signed in: Yes".

```
1. navigate_page(url="${F5XC_API_URL}/web/login")
   # Redirects to the tenant's login host
2. wait_for(text=["Sign In with Azure"])
3. take_snapshot()
4. click(uid=<sign-in-with-azure-link>)
5. wait_for(text=["web/home", "F5 Distributed Cloud"],
            timeout=15000)
6. take_snapshot()   # Verify console loaded
```

Expected duration: 3-10 seconds.

## Path B: Azure SSO Account Picker

Precondition: Multiple Azure AD accounts cached in browser.

```
1. navigate_page(url="${F5XC_API_URL}/web/login")
2. wait_for(text=["Sign In with Azure"])
3. take_snapshot()
4. click(uid=<sign-in-with-azure-link>)
5. wait_for(text=["Pick an account"], timeout=15000)
6. take_snapshot()
7. click(uid=<account-matching-F5XC_USERNAME>)
8. wait_for(text=["web/home", "Enter password"], timeout=15000)
   # If /web/home -> done. If password -> continue to Path C
9. take_snapshot()
```

## Path C: Azure SSO Full MFA Flow

Precondition: No cached session or session expired. Tenant
uses Azure AD with DUO verified push MFA.

```
 1. navigate_page(url="${F5XC_API_URL}/web/login")
    # Redirects to the tenant's login host with SSO options
 2. wait_for(text=["Sign In with Azure"])
 3. take_snapshot()
 4. click(uid=<sign-in-with-azure-link>)

 # Username screen (login.microsoftonline.com)
 5. wait_for(text=["Sign in", "Enter your email"], timeout=15000)
 6. take_snapshot()
 7. fill(uid=<email-textbox>, value="${F5XC_USERNAME}")
 8. click(uid=<next-button>)

 # Password screen
 9. wait_for(text=["Enter password"], timeout=10000)
10. take_snapshot()
11. fill(uid=<password-textbox>, value="${F5XC_CONSOLE_PASSWORD}")
12. click(uid=<sign-in-button>)

 # DUO redirect screen
 # Azure shows "Verification Required" with a Continue button
 # BEFORE redirecting to DUO
13. wait_for(text=["Verification Required"], timeout=10000)
14. take_snapshot()
15. click(uid=<continue-button>)

 # DUO verified push screen (duosecurity.com)
 # DUO displays a 3-digit code the user must enter in
 # the Duo Mobile app — this is NOT a simple push approval
16. wait_for(text=["Enter code in Duo Mobile"], timeout=15000)
17. take_snapshot()
    # Extract the 3-digit code from snapshot text
    # Report to operator: "DUO verification code: <CODE>"
18. wait_for(text=["Stay signed in"], timeout=60000)
    # If timeout: look for "Try again" button, click it,
    # extract new code, report again

 # Stay signed in
19. take_snapshot()
20. click(uid=<yes-button>)

 # Console loading (heavy SPA, may take 15-30 seconds)
21. wait_for(text=["F5 Distributed Cloud", "Welcome",
                   "Common workspaces"], timeout=30000)
22. take_snapshot()   # Verify console loaded
```

Expected duration: 30-90 seconds (depends on DUO approval).

## Auth Provider Detection Logic

After navigating to the login URL and taking a snapshot:

| Page Content | Auth Type | Path |
| -------------- | ----------- | ------ |
| "Please enter your email address and password" + email field + password field | Native F5 XC | Path N |
| "Sign In with Azure" link | Azure SSO | Path A/B/C |
| "Log In as Tenant Owner" link only | Tenant owner (native) | Path N variant |

## URL Patterns Observed

Different tenants redirect to different login hosts. The
plugin does not rely on URL patterns for auth detection —
it uses page content instead. These patterns are documented
for debugging reference only:

| URL Pattern | Meaning |
| ------------- | --------- |
| `login*.volterra.*/auth/realms/*` | F5 XC login host |
| `login.microsoftonline.com/*` | Azure AD login screens |
| `api-*.duosecurity.com/frame/*` | DUO MFA challenge |
| `login.microsoftonline.com/common/federation/*` | "Stay signed in" prompt |
| `*/web/home*` | Console loaded (authenticated) |

## Element Identification Strategy

Always use `take_snapshot()` before interacting. Find
elements using this priority:

1. **Text content** — most reliable for auth flows since
   each screen uses standard text ("Next", "Sign in", "Yes")
2. **Input type** — textbox with description containing
   "email" for username, "password" for password
3. **Link text** — "Sign In with Azure" is a link, not a
   button, on SSO-enabled F5 XC login pages
4. **Button text** — "Next", "Sign in", "Continue", "Yes",
   "Try again"

## Key Observations from Live Testing

- Different tenants use different login hosts and auth methods
- The plugin detects auth type from page content, not URLs
- Native login uses a single form with both email and password
  fields visible simultaneously
- Azure SSO uses a multi-screen flow (email → password → DUO)
- "Sign In with Azure" is a link element, not a button
- Azure shows "Verification Required" before DUO redirect
- DUO uses verified push (3-digit code entry) not simple push
- Console SPA loads at `/web/home` and takes 15-30 seconds
- Page reports as `busy` during SPA initialization

## Subagent Validation Results (2026-03-26)

Validated via `f5xc-console:console-operator` subagent:

### Path N — Native Login

- Agent correctly detected native login from page content
- Used `fill_form` for both email and password fields
- **Post-login redirect quirk**: browser may redirect to
  `chrome://new-tab-page/` instead of the console after native
  login. The session cookie IS set correctly — navigate
  directly to `${F5XC_API_URL}/web/home` to recover.
- **SPA resource errors**: first load may hit
  `ERR_INSUFFICIENT_RESOURCES`. Retry with a hard reload
  (`navigate_page` with `ignoreCache: true`) to recover.

### Path A — Azure SSO Cached Session

- Agent correctly detected "Sign In with Azure" link
- Clicked the link and the cached session auto-completed
- No DUO MFA was required (session from previous "Stay
  signed in: Yes" persisted across browser restarts)
- Auth succeeded (redirect back with valid auth code)
- SPA may fail to load in resource-constrained environments

### Recovery Procedures

- **Post-login redirect to chrome://new-tab-page**: Navigate
  directly to `${F5XC_API_URL}/web/home`
- **ERR_INSUFFICIENT_RESOURCES**: Hard reload with
  `ignoreCache: true`. If that fails, the browser needs more
  memory — this is an infrastructure constraint, not an auth
  issue.
- **SPA stuck on busy**: Wait up to 30 seconds. If still
  blank, hard reload once. Verify the page title is
  "F5 Distributed Cloud Console" (auth succeeded) vs
  a login page title (auth failed).
