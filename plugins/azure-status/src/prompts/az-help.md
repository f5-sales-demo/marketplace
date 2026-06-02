Fetch help for any `az` CLI command group or subcommand.

## Usage

Pass command path without `az` prefix via `command_path`.

**Example:** `az network vnet --help`:

```json
{ "command_path": "network vnet" }
```

Empty `command_path` returns top-level `az --help`.

## When to Use

- Before using `az_exec` with an unfamiliar command group
- To discover subcommands, flags, and required parameters
