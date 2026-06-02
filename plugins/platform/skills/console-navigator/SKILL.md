---
name: console-navigator
description: >-
  Deterministic navigation to F5 Distributed Cloud console
  sections. Translates section names to URL paths, verifies
  session health, and confirms page load. Foundation for all
  console workflow skills. Use when the user says "navigate to",
  "go to", "open", or references a console section by name.
user-invocable: false
---

# Console Navigator

Navigate to any section of the F5 XC console by name. Verifies
session health before navigating and confirms arrival at the
target page.

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | `https://<tenant>.console.ves.volterra.io` | Tenant URL |
| `F5XC_USERNAME` | No | — | Azure AD email (for auth) |
| `F5XC_NAMESPACE` | No | — | Default namespace |

## Navigation Procedure

### Step 1: Verify session

Read `references/session-detection.md` from the `console-auth`
skill. Execute the session health check. If re-auth is needed,
invoke `console-auth` first.

### Step 2: Resolve target URL

Look up the requested section in `references/url-patterns.md`.
Substitute `${F5XC_API_URL}` and `${F5XC_NAMESPACE}` into the
URL template.

If the user specified a namespace, use that. Otherwise fall back
to `F5XC_NAMESPACE` env var. If neither is set, detect the
current namespace from the browser URL.

### Step 3: Navigate

```
navigate_page(url=<resolved-url>)
wait_for(text=[<expected-page-heading>], timeout=15000)
take_snapshot()
```

### Step 4: Verify arrival

Confirm the snapshot contains expected page elements for the
target section. Report:

```
## Navigation: SUCCESS
- Section: <section name>
- URL: <current URL>
- Namespace: <active namespace>
```

## State Detection

To answer "where am I?":

1. `take_snapshot()`
2. Parse URL path segments
3. Map to section name using `references/url-patterns.md`
4. Report current location, namespace, and page state

## Error Handling

| Failure | Action |
| --------- | -------- |
| Section not found in catalog | Report available sections |
| Namespace not set | Ask user which namespace |
| Page load timeout | Check session, retry once |
| Permission denied | Report: user lacks access to this section |
