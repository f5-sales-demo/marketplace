Fetch help documentation for any `aws` CLI service or operation.

Use this tool to discover available services, operations, and flags for AWS CLI commands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without the `aws` prefix) to get help:

**Example:** To see help for the `ec2` service:

```json
{ "command_path": "ec2" }
```

**Example:** To see help for a specific operation:

```json
{ "command_path": "ec2 describe-instances" }
```

**Example:** To see top-level `aws` help:

```json
{ "command_path": "" }
```

Note that the AWS CLI exposes help through the `help` subcommand (for example `aws ec2 help`), not a `--help` flag — this tool appends `help` for you.

## When to Use

- Before using `aws_exec` with an unfamiliar service
- To discover available operations within a service
- To find the correct flags for a specific operation
- To check required versus optional parameters

## Output

Returns the raw `aws <command> help` output, which includes:

- Available services and operations
- Command arguments with descriptions
- Required versus optional parameters
- Usage examples
