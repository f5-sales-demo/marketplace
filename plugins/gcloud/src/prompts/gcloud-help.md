Fetch help documentation for any `gcloud` CLI group or command.

Use this tool to discover available groups, commands, and flags for Google Cloud CLI operations that are not covered by the embedded typed tools.

## Usage

Pass the command path (without the `gcloud` prefix) to get help. The tool appends `--help` for you.

**Example:** To see help for the `compute instances` group:

```json
{ "command_path": "compute instances" }
```

**Example:** To see help for a top-level group:

```json
{ "command_path": "projects" }
```

**Example:** To see top-level `gcloud` help:

```json
{ "command_path": "" }
```

## When to Use

- Before using `gcloud_exec` with an unfamiliar group or command
- To discover available commands within a group
- To find the correct flags for a specific command (e.g. `--filter`, `--format`)
- To check required versus optional arguments

## Output

Returns the raw `gcloud <command> --help` output as plain text, including available commands, flags, and usage examples. Once you know the command, run the read through `gcloud_exec`.
