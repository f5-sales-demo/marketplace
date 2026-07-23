Show the caller identity for the active AWS credentials via `aws sts get-caller-identity`.

## Usage

```
aws sts get-caller-identity [--profile NAME] --output json
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `profile` | Optional named profile from `~/.aws/config` / `~/.aws/credentials` |

## Output Fields (JSON)

- `Account` — 12-digit AWS account ID
- `Arn` — ARN of the calling principal (IAM user, assumed role, etc.)
- `UserId` — Unique identifier of the principal

## Notes

Use this to confirm which account and identity your credentials resolve to before
running privileged operations. It requires no IAM permissions and is the quickest
way to verify that a profile or SSO session is active.

For advanced field selection, add `--query` with a JMESPath expression, e.g.
`--query Account`.

## Related Commands

- `aws configure list` — Show the resolved credential/config sources
- `aws sso login --profile NAME` — Refresh an expired SSO session
