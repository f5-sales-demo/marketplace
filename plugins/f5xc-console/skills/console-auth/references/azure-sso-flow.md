# Azure SSO Flow — MCP Tool Sequences

Detailed Chrome DevTools MCP tool call sequences for each
authentication path. Validated against the f5-amer-ent tenant
on 2026-03-26.

## Path A: Cached Session (Single-Click)

Precondition: User previously authenticated and selected
"Stay signed in: Yes".

```
1. navigate_page(url="${F5XC_API_URL}/web/login")
   # Redirects to login.ves.volterra.io
2. wait_for(text=["Sign In with Azure"])
3. take_snapshot()
4. click(uid=<sign-in-with-azure-link>)
5. wait_for(text=["web/home", "F5 Distributed Cloud"],
            timeout=15000)
6. take_snapshot()   # Verify console loaded
```

Expected duration: 3-10 seconds.

## Path B: Account Picker then Cached Session

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

## Path C: Full MFA Flow

Precondition: No cached session or session expired. Validated
against f5-amer-ent tenant with Azure AD and DUO verified push.

```
 1. navigate_page(url="${F5XC_API_URL}/web/login")
    # Redirects to login.ves.volterra.io with SSO options
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

## URL Patterns Observed

| URL Pattern | Meaning |
| ------------- | --------- |
| `login.ves.volterra.io/auth/realms/*` | Volterra SSO selection page |
| `login.microsoftonline.com/*` | Azure AD login (username/password) |
| `login.microsoftonline.com/*/login` | Azure AD post-password (DUO redirect) |
| `api-*.duosecurity.com/frame/*` | DUO MFA challenge |
| `login.microsoftonline.com/common/federation/*` | "Stay signed in" prompt |
| `f5-amer-ent.console.ves.volterra.io/web/home*` | Console loaded (authenticated) |

## Element Identification Strategy

Always use `take_snapshot()` before interacting. Find
elements using this priority:

1. **Text content** — most reliable for auth flows since
   each screen uses standard text ("Next", "Sign in", "Yes")
2. **Input type** — textbox with description containing
   "email" for username, "password" for password
3. **Link text** — "Sign In with Azure" is a link, not a
   button, on the Volterra login page
4. **Button text** — "Next", "Sign in", "Continue", "Yes",
   "Try again"

## Key Observations from Live Testing

- The Volterra login page (`login.ves.volterra.io`) hosts the
  SSO provider selection, not `${F5XC_API_URL}/web/login`
- "Sign In with Azure" is a link element, not a button
- Azure AD shows a "Verification Required" intermediate screen
  with a "Continue" button before redirecting to DUO
- DUO uses verified push (3-digit code entry) not simple push
- The console SPA loads at `/web/home` (not `/web/workspaces`)
  and can take 15-30 seconds for the initial render
- The page reports as `busy` during SPA initialization
