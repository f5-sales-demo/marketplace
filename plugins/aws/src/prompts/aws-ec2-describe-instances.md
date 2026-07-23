Describe Amazon EC2 instances via `aws ec2 describe-instances`.

## Usage

```
aws ec2 describe-instances [--region REGION] [--instance-ids ID ...] [--filters ...] --output json
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `region` | Optional AWS region (e.g. `us-east-1`) |
| `instanceIds` | Optional list of instance IDs (e.g. `i-0123456789abcdef0`) |
| `filters` | Optional list of `Name=...,Values=...` filter expressions |

## Output Fields (JSON, flattened)

Results arrive as `Reservations[].Instances[]` and are flattened to:

- `instanceId` — Instance ID
- `name` — Value of the `Name` tag, if present
- `state` — Lifecycle state (running, stopped, terminated, etc.)
- `type` — Instance type (e.g. `t3.micro`)
- `az` — Availability Zone
- `privateIp` — Private IPv4 address
- `publicIp` — Public IPv4 address, if assigned

## Notes

Without a region, the CLI's default region is used. Combine `--filters` for
server-side narrowing, e.g. `Name=instance-state-name,Values=running`.

For advanced field selection, add `--query` with a JMESPath expression, e.g.
`--query "Reservations[].Instances[].InstanceId"`.

## Related Commands

- `aws ec2 describe-instance-status` — Health and status checks
- `aws ec2 start-instances --instance-ids ID` — Start a stopped instance
