---
description: >-
  Check AWS CLI authentication status and show current identity
---

Delegate to the cli-operator agent to check AWS connectivity.

## Delegation

Spawn the cli-operator agent with the following instructions:

1. Verify AWS CLI is installed: `aws --version`
2. Check current identity: `aws sts get-caller-identity --output json`
3. Report:
   - AWS CLI version
   - Account ID
   - ARN (user or role)
   - User/role name (parsed from ARN)
   - Current region (`$AWS_REGION` or `$AWS_DEFAULT_REGION`)
   - Active profile (`$AWS_PROFILE` if set)
4. If not authenticated, suggest using `/aws:aws-login`
