---
name: console-discover
description: >-
  Crawl the F5 Distributed Cloud console navigation tree and
  discover all menu sections, routes, and page types. Outputs
  YAML catalog entries matching the console repo schemas
  (navigation tree, route definitions). Use when populating
  or refreshing the console catalog with the full menu structure.
user-invocable: true
---

# Console Discover

Crawl the F5 XC console sidebar navigation and extract the
complete menu tree with routes, labels, and page types. Outputs
YAML files matching the `f5xc-salesdemos/console` catalog schemas.

## Prerequisites

- Chrome DevTools MCP server connected
- Browser open to the F5 XC console (authenticated)
- If not authenticated, invoke `console-auth` first

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | Auto-detected from browser URL | Tenant URL |
| `F5XC_NAMESPACE` | No | — | Default namespace for route patterns |

## Discovery Procedure

### Step 1: Verify session

Read `references/session-detection.md` from the `console-auth`
skill. Execute session health check. If re-auth needed, invoke
`console-auth`.

### Step 2: Navigate to console home

```
navigate_page(url=<tenant-url>/web/home)
wait_for(text=["Dashboard", "Home"], timeout=15000)
take_snapshot()
```

### Step 3: Extract sidebar navigation

Use `take_snapshot()` to capture the full accessibility tree.
Identify the sidebar/navigation region. Extract all menu items
with their:

- **Label** — visible text
- **Nesting level** — parent/child hierarchy
- **Link target** — href or route URL
- **Expandable state** — whether the item has sub-items

For collapsed menu sections, click to expand and re-snapshot:

```
click(uid=<collapsed-section-uid>)
take_snapshot()
```

Repeat until all sections are expanded and captured.

### Step 4: Build navigation tree

Assemble the extracted menu items into a tree structure matching
the `urn:f5xc:console:navigation:v1` schema:

```yaml
schema: "urn:f5xc:console:navigation:v1"
console_version: "<detected-version>"
discovered_at: "<today's date>"

tree:
  - id: "<kebab-case-id>"
    label: "<menu label>"
    menu_path: ["<parent>", "<child>"]
    route: "<url-path>"
    route_file: "routes/<area>/<name>.yaml"
    children:
      - id: "<child-id>"
        ...
```

### Step 5: Classify each route

For each discovered route, navigate to it and classify the page:

```
navigate_page(url=<route-url>)
take_snapshot()
```

Determine:
- **Screen type**: list, detail, form, wizard, dashboard, settings
- **Primary controls**: buttons, search, filters
- **Table presence**: columns, row actions
- **Tab presence**: tab labels

Record the classification for `console-inspect` to process later.

### Step 6: Output results

Write the navigation tree YAML to the console catalog:

```
catalog/navigation/console-tree.yaml
```

For each classified route, write a skeleton route file:

```
catalog/routes/<area>/<name>.yaml
```

Report:
```
## Discovery: COMPLETE
- Sections found: <count>
- Routes discovered: <count>
- Page types: <breakdown>
- Output: catalog/navigation/console-tree.yaml
- Skeleton routes: <count> files in catalog/routes/
```

## Output Schema

All output files must validate against the JSON Schemas in
`f5xc-salesdemos/console/schemas/`. Run `npm run validate`
in the console repo after writing files.

## Incremental Discovery

When re-running discovery:
1. Read existing `catalog/navigation/console-tree.yaml`
2. Compare with freshly discovered tree
3. Mark new entries as `confidence: "draft"`
4. Mark removed entries as `confidence: "stale"`
5. Preserve `confidence: "validated"` entries unchanged
