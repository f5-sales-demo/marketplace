---
name: console-run
description: >-
  Execute an F5 Distributed Cloud console workflow from the
  catalog. Drives a browser through the steps defined in a
  workflow YAML file — navigate, click, fill forms, verify
  results. Use when the user asks to "create", "delete",
  "edit", "clone", or perform any CRUD operation on an F5 XC
  resource via the console UI.
user-invocable: true
---

# Console Run

Execute a catalog workflow against a live F5 XC console browser
session. This skill translates user intent into a call to the
`catalog_workflow_runner` tool with the correct parameters.

## Prerequisites

- Browser open and authenticated to F5 XC console
  (invoke `console-auth` if needed)
- Console catalog repository cloned locally
  (default: `~/GIT/f5-sales-demo/console`)

## Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `F5XC_API_URL` | No | Auto-detected from browser | Console base URL |
| `F5XC_NAMESPACE` | No | — | Default namespace for operations |
| `CONSOLE_CATALOG_PATH` | No | `~/GIT/f5-sales-demo/console` | Path to console catalog repo |

## Procedure

### Step 1: Parse user intent

Extract from the user's request:
- **Resource**: which F5 XC resource (e.g., http-load-balancer,
  origin-pool, app-firewall, health-check, tcp-load-balancer,
  service-policy, namespace)
- **Operation**: what to do (create, delete, view, edit, clone)
- **Parameters**: name, namespace, domains, and any other
  resource-specific values

### Step 2: Verify browser session

Read `references/session-detection.md` from `console-auth`.
Check if the browser is authenticated. If not, invoke
`console-auth` first.

### Step 3: Resolve catalog path

Determine the catalog path:
1. Check `CONSOLE_CATALOG_PATH` env var
2. Fall back to `~/GIT/f5-sales-demo/console`
3. Verify the path exists and contains `catalog/workflows/`

### Step 4: Verify workflow exists

Check that the workflow file exists:
```
{catalog_path}/catalog/workflows/{resource}/{operation}.yaml
```

If not found, list available workflows:
```
ls {catalog_path}/catalog/workflows/{resource}/
```

Report available operations to the user if the requested one
is missing.

### Step 5: Execute workflow

Call the `catalog_workflow_runner` tool:

```
catalog_workflow_runner(
  catalog_path: "{resolved_catalog_path}",
  resource: "{resource}",
  operation: "{operation}",
  params: {
    namespace: "{namespace}",
    name: "{name}",
    ... other extracted params
  },
  observable: true,
  base_url: "{F5XC_API_URL or auto-detected}"
)
```

Enable `observable: true` by default for demo visibility.
The user can request fast mode by saying "quickly" or "fast".

### Step 6: Report results

Present the workflow results to the user:

```
## Console Workflow: {operation} {resource}
Status: {PASS/FAIL}
Duration: {total_duration}

Steps:
  [PASS]  navigate-to-list   Navigate to list page         (1.2s)
  [PASS]  click-add          Click Add button              (0.8s)
  ...
```

If the workflow failed, explain which step failed and suggest
corrective action (e.g., check if the resource already exists,
verify namespace selection, retry with different parameters).

## Available Resources

| Resource | Operations | Catalog Path |
| --- | --- | --- |
| http-load-balancer | create, view, edit, delete, clone | workflows/http-load-balancer/ |
| tcp-load-balancer | create, delete | workflows/tcp-load-balancer/ |
| origin-pool | create, delete | workflows/origin-pool/ |
| app-firewall | create, delete | workflows/app-firewall/ |
| health-check | create, delete | workflows/health-check/ |
| service-policy | create, delete | workflows/service-policy/ |
| virtual-host | create, delete | workflows/virtual-host/ |
| route-object | create, delete | workflows/route-object/ |
| namespace | create, delete | workflows/namespace/ |

## Examples

User: "Create an HTTP load balancer called demo-lb in the demo namespace with domain app.example.com"

Extracted:
- Resource: http-load-balancer
- Operation: create
- Params: name=demo-lb, namespace=demo, domains=["app.example.com"]

User: "Delete the origin pool named backend-pool"

Extracted:
- Resource: origin-pool
- Operation: delete
- Params: name=backend-pool, namespace=(from F5XC_NAMESPACE)
