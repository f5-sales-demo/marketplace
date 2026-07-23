Execute any `aws` CLI command directly.

This is the general-purpose tool for running AWS CLI commands that are not covered by the typed tools (aws_sts_whoami, aws_s3_ls, aws_ec2_describe_instances). Prefer the typed tools when available — they validate inputs and return structured data.

## Usage

Pass the service, operation, and flags as an array of arguments. Do NOT include `aws` itself — it is prepended automatically.

**Example:** To run `aws ec2 describe-instances --region us-east-1`:

```json
{ "args": ["ec2", "describe-instances", "--region", "us-east-1"] }
```

The AWS CLI grammar is `aws <service> <operation>` (for example `ec2 describe-instances`, `iam list-users`, `s3 ls`).

## Safety

- Arguments are passed as an array directly to the `aws` binary — **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `aws` invocation runs, including full JMESPath `--query` syntax.
- **Read-only by default:** only read operations are allowed. Reads are recognized by operation prefix (`describe-`, `list-`, `get-`, `lookup-`, `search-`, `head-`, `check-`, `resolve-`, …) plus a few exact reads (`scan`, `query`, `select`, `wait`, and `s3 ls`).
- Everything else — including `run-instances`, `terminate-instances`, `create-*`, `update-*`, `delete-*`, and the mutating `s3` verbs (`cp`, `mv`, `rm`, `sync`, `mb`, `rb`) — is blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `aws:cli-operator` agent), not `aws_exec`.
- Output is capped to prevent context overflow.

## Output format with `--output`

Control the response format with `--output json|text|table` (JSON is added automatically when you do not supply your own):

- `--output json` — machine-readable JSON (the default)
- `--output text` — tab-separated, good for piping
- `--output table` — human-readable ASCII table

## Filtering with `--filters`

Many `describe-*` operations accept server-side `--filters` in `Name=...,Values=...` form, which narrows results before they are returned:

```json
{ "args": ["ec2", "describe-instances", "--filters", "Name=instance-state-name,Values=running"] }
```

## Querying with `--query` (JMESPath)

AWS uses the JMESPath grammar for the client-side `--query` flag — pass the expression as a single argument value. This is NOT the GitHub CLI `--json`/`--jq` model; there is no `--jq`. Common patterns:

- Field projection: `--query "Reservations[].Instances[].{id:InstanceId, type:InstanceType}"`
- Filter: `--query "Reservations[].Instances[?State.Name=='running']"`
- Substring match: `--query "Buckets[?contains(Name, 'prod')]"`
- Backtick literals (numbers/booleans/quoted enums): `` --query "Volumes[?Size==`100`]" ``
- OR / AND / NOT: `--query "[?a=='x' || b=='y']"`, `--query "[?a && b]"`, `--query "[?!Encrypted]"`
- Pipe to post-process a projection: `--query "Reservations[].Instances[].InstanceId | [0]"`

All of the above — including `||`, `|`, and backticks — are accepted verbatim, because arguments bypass the shell.

## Tips

- `--output json` is added automatically unless you pass your own `--output`/`-o` (for example `-o table`, `-o text`), which is respected.
- Use `--region NAME` to target a specific region and `--profile NAME` to select credentials.
- Use the `aws_help` tool first if you are unsure about a service's available operations or flags.
