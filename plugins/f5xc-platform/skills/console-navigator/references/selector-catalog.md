# Selector Catalog — Stable Element Patterns

Priority-ordered selectors for common F5 XC console UI
elements. Always use `take_snapshot()` first and find
elements by these selectors in priority order.

## Selector Priority

1. **data-testid** — most stable, designed for automation
2. **aria-label** — accessibility attribute, rarely changes
3. **Text content** — visible button/link text
4. **Input type** — `type="email"`, `type="password"`, etc.
5. **Placeholder** — input placeholder text
6. **Role + context** — `role="button"` near specific text
7. **CSS selector** — last resort, least stable

## Common Console Elements

### Navigation

| Element | Selector Strategy |
| --------- | ------------------- |
| Namespace dropdown | Text matching current namespace name |
| Sidebar nav items | Text content of section names |
| Breadcrumb | Role "navigation" with breadcrumb items |
| Back button | aria-label "Back" or text "Back" |

### Actions

| Element | Selector Strategy |
| --------- | ------------------- |
| Create/Add button | Text "Add <object-type>" or "Create" |
| Delete button | Text "Delete" inside action menu |
| Edit button | Text "Edit" or pencil icon button |
| Save button | Text "Save and Exit" or "Apply" |
| Cancel button | Text "Cancel" |

### Tables

| Element | Selector Strategy |
| --------- | ------------------- |
| Table rows | role="row" |
| Row action menu | "..." or kebab menu icon per row |
| Search/filter input | Placeholder "Search" or "Filter" |
| Pagination | role="navigation" near page numbers |

### Forms

| Element | Selector Strategy |
| --------- | ------------------- |
| Text inputs | aria-label matching field label |
| Dropdowns/selects | role="combobox" or role="listbox" |
| Checkboxes | role="checkbox" |
| Radio buttons | role="radio" |
| Toggle switches | role="switch" |
| JSON/YAML editor | role="textbox" with multiline |

### Modals and Overlays

| Element | Selector Strategy |
| --------- | ------------------- |
| Modal dialog | role="dialog" |
| Confirmation dialog | Text "Are you sure" or "Confirm" |
| Toast notifications | role="alert" or role="status" |
| Loading spinner | Text "Loading" or aria-busy="true" |
