---
name: console-inspect
description: >-
  Inspect a specific F5 XC console route and extract detailed
  screen metadata: form fields, table columns, controls,
  selectors, and API field mappings. Outputs resource and
  workflow YAML catalog entries. Use when cataloging a specific
  console page or resource in detail.
user-invocable: true
---

# Console Inspect

Inspect a single F5 XC console route and extract its complete
UI structure — form sections, fields, table columns, controls,
selectors, and available operations. Outputs resource mapping
and workflow YAML files for the `f5-sales-demo/console` catalog.

## Prerequisites

- Chrome DevTools MCP server connected
- Browser open to the F5 XC console (authenticated)
- Target route known (from `console-discover` or user input)

## Environment Variables

| Variable | Required | Default | Purpose |
| ---------- | ---------- | --------- | --------- |
| `F5XC_API_URL` | No | Auto-detected from browser URL | Tenant URL |
| `F5XC_NAMESPACE` | No | — | Namespace for parameterized routes |

## Inspection Procedure

### Step 1: Navigate to target route

```
navigate_page(url=<target-route>)
wait_for(text=[<expected-heading>], timeout=15000)
take_snapshot()
```

### Step 2: Identify screen type

From the snapshot, determine the screen type:

- **List screen**: has a data table with rows and columns
- **Detail screen**: shows resource properties and tabs
- **Form screen**: has input fields for creating/editing
- **Wizard screen**: multi-step form with progress indicator

### Step 3: Extract screen structure

#### For list screens

Extract table metadata:
```
evaluate_script(function="() => {
  const headers = [...document.querySelectorAll('th')].map(th => ({
    label: th.textContent.trim(),
    testId: th.getAttribute('data-testid')
  }));
  return JSON.stringify(headers);
}")
```

Extract row actions by clicking the actions menu on any row:
```
click(uid=<first-row-actions-button>)
take_snapshot()
```

Record available actions (Edit, Delete, Clone, etc.) and their
selectors.

#### For form screens

Click the "Add" or "Create" button to open the creation form:
```
click(uid=<add-button>)
take_snapshot()
```

Extract all form fields:
```
evaluate_script(function="() => {
  const fields = [...document.querySelectorAll('input, select, textarea')].map(el => ({
    type: el.tagName.toLowerCase() === 'select' ? 'select' : el.type,
    name: el.name || el.getAttribute('data-testid'),
    label: el.closest('label')?.textContent?.trim() || el.getAttribute('aria-label'),
    required: el.required,
    testId: el.getAttribute('data-testid')
  }));
  return JSON.stringify(fields);
}")
```

For each collapsible section, expand it and re-extract:
```
click(uid=<collapsed-section>)
take_snapshot()
```

#### For detail screens

Extract tab labels and their content areas:
```
take_snapshot()
```

Click through each tab and record its structure:
```
click(uid=<tab-uid>)
take_snapshot()
```

### Step 4: Map API fields

If the resource has a known API kind (from api-specs-enriched),
cross-reference form field names with API schema field paths.
Record the mapping in `api_field` for each form field.

### Step 5: Generate catalog files

#### Route file (`catalog/routes/<area>/<name>.yaml`)

```yaml
schema: "urn:f5xc:console:route:v1"
id: "<resource-id>"
label: "<page heading>"
route:
  pattern: "<url-pattern-with-params>"
  params:
    namespace:
      required: true
  supports_direct_link: true
  breadcrumbs: [<extracted-breadcrumbs>]
context:
  requires_login: true
  requires_namespace: true
screen:
  type: "<detected-type>"
  primary_resource: "<resource-id>"
  controls: [<extracted-controls>]
  table: <extracted-table-def>  # for list screens
operations: [<detected-operations>]
metadata:
  confidence: "draft"
  discovered_at: "<today>"
  console_version: "<detected>"
```

#### Resource file (`catalog/resources/<name>.yaml`)

```yaml
schema: "urn:f5xc:console:resource:v1"
id: "<resource-id>"
label: "<resource label>"
api:
  kind: "<api-kind>"
  crud_endpoints: <mapped-endpoints>
console:
  list_route: "routes/<area>/<name>.yaml"
  navigation:
    menu_path: [<from-navigation-tree>]
form:
  sections: [<extracted-sections-and-fields>]
metadata:
  confidence: "draft"
  discovered_at: "<today>"
  console_version: "<detected>"
```

#### Workflow files (`catalog/workflows/<name>/create.yaml`, etc.)

Generate step-by-step workflows from the observed interaction
sequence. Each step records:
- action (navigate, click, fill, select, assert)
- selector (prefer data-testid, fallback to CSS)
- wait_for condition
- human-readable description

### Step 6: Capture screenshots

Take a screenshot of each key state for documentation:

```
take_screenshot(filePath="<console-repo>/docs/screenshots/<resource>-list.png")
take_screenshot(filePath="<console-repo>/docs/screenshots/<resource>-create.png")
```

### Step 7: Report results

```
## Inspection: COMPLETE
- Resource: <name>
- Screen type: <type>
- Form sections: <count>
- Form fields: <count>
- Operations detected: <list>
- Selectors extracted: <count> (data-testid: <count>, css: <count>)
- Files written:
  - catalog/routes/<area>/<name>.yaml
  - catalog/resources/<name>.yaml
  - catalog/workflows/<name>/create.yaml
  - catalog/workflows/<name>/delete.yaml
```

## Validation

After writing files, run validation in the console repo:

```bash
cd <console-repo-path>
npm run validate
npm run lint
```

Fix any schema violations before committing.
