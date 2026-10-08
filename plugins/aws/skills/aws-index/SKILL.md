---
name: aws-index
description: >-
  Top-level intent router for AWS operations. Routes auth requests
  to aws-auth, service queries to the cli-operator agent, and
  generic AWS CLI operations to the cli-operator. Use when the user
  mentions AWS, aws CLI, S3, EC2, Lambda, IAM, or any AWS topic
  but the request does not clearly match a specific skill trigger.
user-invocable: false
---

**Canonical skill URI**: `skill://aws:aws-index`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# AWS Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### F5 Customer Edge

Keywords: "Customer Edge", "F5 CE", "Secure Mesh Site", "F5 Distributed Cloud edge",
"AWS CE AMI", "CE NLB", "CE TGW"

- Invoke `aws:aws-ce` before generic service or CLI routing.
- Do not delegate CE research or planning to the generic cli-operator.

### Authentication and Credentials

Keywords: "login", "authenticate", "aws sso", "credentials",
"configure aws", "aws login", "sso login"

- Auth setup -> invoke `aws:aws-auth` skill

### Service Operations

Keywords: "S3", "EC2", "Lambda", "IAM", "CloudFormation",
"DynamoDB", "RDS", "ECS", "EKS", "SQS", "SNS", "Route53",
"CloudWatch", "VPC", "ELB", "API Gateway"

- Optionally delegate to `aws:cli-operator` agent:

  ```text
  task(
    subagent_type="aws:cli-operator",
    description="<brief description of the AWS operation>",
    prompt="<specific aws CLI commands to execute and what to report>"
  )
  ```

### Generic AWS CLI Operations

For any `aws` subcommand not covered above, optionally delegate to the
cli-operator agent. The agent will use `aws <service> help` or
`aws <service> <subcommand> help` for discovery when needed.

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="aws:cli-operator",
  description="Execute AWS CLI command",
  prompt="Run aws <subcommand> and report the results. Use --output json for structured output."
)
```

## Important Notes

- Always check AWS authentication status before service operations
- Direct tools and the optional cli-operator agent support direct `aws` CLI execution
- Execute directly with typed native tools or guarded CLI operations
