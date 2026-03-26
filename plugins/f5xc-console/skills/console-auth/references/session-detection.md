# Session Detection — Reusable Health Check

This reference defines a reusable procedure for detecting
whether the user has an active F5 XC console session. Other
skills (console-navigator, future workflow skills) should
use this check before starting work.

## Session Health Check Procedure

### Step 1: Snapshot current page

```
take_snapshot()
```

### Step 2: Evaluate session state

Check the following indicators in order:

**Active session (no action needed):**

- URL contains `/web/home` or `/web/namespaces/`
- Snapshot contains navigation sidebar elements
- Snapshot contains user account menu or avatar

**Expired session (re-auth needed):**

- URL contains `/web/login` or a Volterra login host
  (`login*.volterra.*`)
- Snapshot contains "Sign in" or "Session Expired" text
- Modal overlay with "Sign in again" or "Your session has
  expired"
- Redirect from a console page to the login page

**No session (auth needed):**

- URL does not match any F5 XC console pattern
- Browser on a blank page or different site

### Step 3: Take action

| State | Action |
| ------- | -------- |
| Active session | Continue with the calling skill's workflow |
| Expired session | Invoke `console-auth` skill, then resume |
| No session | Navigate to login URL, invoke `console-auth` |

## Session Expiry Indicators

The F5 XC console may expire sessions in these ways:

1. **Hard redirect** — browser redirects to `/web/login`
   with no warning
2. **Modal dialog** — overlay appears saying the session
   expired, with a "Sign in" button
3. **API errors** — network requests return 401/403,
   console shows error banners

For modal-based expiry, dismiss the modal and proceed
to re-authentication. For redirect-based expiry, the
auth flow handles it naturally.

## Integration Pattern

Skills that need session verification should include
this at the start of their workflow:

```
# Read references/session-detection.md
# Execute the session health check
# If re-auth needed: invoke console-auth, then continue
# If active: proceed with workflow
```
