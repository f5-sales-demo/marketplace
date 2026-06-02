---
name: aws-auth
description: >-
  Container-adapted AWS CLI authentication. Supports environment
  variable credentials, SSO login, IAM instance profiles, and
  interactive configure for headless environments. Use when the user
  says "login to aws", "aws login", "aws sso login", "configure aws",
  or when any AWS operation fails with auth/credential errors.
user-invocable: false
---

# AWS CLI Authentication (Container-Adapted)

This skill guides authentication for headless container environments
where browser-based SSO login may not be available.

## Authentication Methods

### Method 1: Environment Variables (Recommended for Automation)

Best for CI/CD and automated environments. Set credentials directly
via environment variables.

**Setup:**

```bash
export AWS_ACCESS_KEY_ID="<your-access-key-id>"
export AWS_SECRET_ACCESS_KEY="<your-secret-access-key>"
# Optional: for temporary credentials (STS)
export AWS_SESSION_TOKEN="<your-session-token>"
# Optional: set default region
export AWS_REGION="us-east-1"
```

No additional login command needed -- the AWS CLI picks up these
variables automatically.

### Method 2: SSO Login (Named Profile)

Use when an SSO profile is configured in `~/.aws/config`.

**Prerequisites:**

- A named profile with SSO configuration in `~/.aws/config`
- Browser access or SSO device authorization flow

**Command:**

```bash
aws sso login --profile "$AWS_PROFILE"
```

### Method 3: Instance Profile / ECS Task Role

Auto-detected when running on EC2, ECS, EKS, or Lambda. No action
needed -- the AWS SDK and CLI automatically retrieve credentials
from the instance metadata service.

### Method 4: Interactive Configure (Last Resort)

Use when no other method is available.

**Command:**

```bash
aws configure
```

This prompts for Access Key ID, Secret Access Key, default region,
and output format. Credentials are stored in `~/.aws/credentials`.

## SSO Expiry Detection

If stderr output contains `sso token` or `expired`, the SSO session
has expired. Re-run `aws sso login --profile <profile>` to refresh.

## Validation

After authenticating, verify the connection:

```bash
aws sts get-caller-identity --output json
```

A successful response shows Account, UserId, and Arn.

## Delegation

When executing auth commands, spawn the cli-operator agent with these
instructions:

1. Run `aws sts get-caller-identity --output json` to check existing
   session.
2. If already authenticated, report the identity and stop.
3. Pick the first fully satisfied auth method in priority order:
   - `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` both set ->
     already authenticated via env vars, validate with
     `aws sts get-caller-identity`
   - `AWS_PROFILE` set ->
     `aws sso login --profile "$AWS_PROFILE"`
   - Instance profile detected (running on EC2/ECS/EKS) ->
     auto-detected, validate with `aws sts get-caller-identity`
   - None satisfied -> `aws configure` (interactive, last resort)
4. Do NOT choose an option unless all its required env vars are set.
5. Never echo access keys or session tokens in output.

## Environment Variables

| Variable                | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `AWS_ACCESS_KEY_ID`     | IAM access key ID for Method 1                   |
| `AWS_SECRET_ACCESS_KEY` | IAM secret access key for Method 1               |
| `AWS_SESSION_TOKEN`     | Temporary session token (STS) for Method 1       |
| `AWS_PROFILE`           | Named profile for SSO (Method 2)                 |
| `AWS_REGION`            | Default AWS region                               |
| `AWS_DEFAULT_REGION`    | Fallback region (if `AWS_REGION` not set)        |
| `AWS_DEFAULT_OUTPUT`    | Default output format (`json`, `text`, `table`)  |

## Security Rules

- Never echo access keys, secret keys, or session tokens
- Use `$AWS_ACCESS_KEY_ID` placeholder in output
- Do not store credentials in project files
- Prefer environment variables over `aws configure` for automation
