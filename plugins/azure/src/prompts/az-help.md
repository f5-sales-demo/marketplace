Fetch help documentation for any `az` CLI command group or subcommand.

Use this tool to discover available commands, flags, and usage patterns for az CLI subcommands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without `az` prefix) to get help:

**Example:** To see `az network vnet --help`:

```json
{ "command_path": "network vnet" }
```

**Example:** To see `az storage blob --help`:

```json
{ "command_path": "storage blob" }
```

**Example:** To see top-level `az --help`:

```json
{ "command_path": "" }
```

## When to Use

- Before using `az_exec` with an unfamiliar command group
- To discover available subcommands within a group
- To find the correct flags for a specific operation
- To check required vs optional parameters

## Output

Returns the raw `az <command> --help` output, which includes:

- Available subgroups and commands
- Command arguments with descriptions
- Required vs optional parameters
- Usage examples
