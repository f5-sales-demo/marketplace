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

# AWS Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication and Credentials

Keywords: "login", "authenticate", "aws sso", "credentials",
"configure aws", "aws login", "sso login"

- Auth setup -> invoke `aws:aws-auth` skill

### Service Operations

Keywords: "S3", "EC2", "Lambda", "IAM", "CloudFormation",
"DynamoDB", "RDS", "ECS", "EKS", "SQS", "SNS", "Route53",
"CloudWatch", "VPC", "ELB", "API Gateway"

- Delegate to `aws:cli-operator` agent:

  ```text
  Agent(
    subagent_type="aws:cli-operator",
    description="<brief description of the AWS operation>",
    prompt="<specific aws CLI commands to execute and what to report>"
  )
  ```

### Generic AWS CLI Operations

For any `aws` subcommand not covered above, delegate to the
cli-operator agent. The agent will use `aws <service> help` or
`aws <service> <subcommand> help` for discovery when needed.

```text
Agent(
  subagent_type="aws:cli-operator",
  description="Execute AWS CLI command",
  prompt="Run aws <subcommand> and report the results. Use --output json for structured output."
)
```

## Important Notes

- Always check AWS authentication status before service operations
- The cli-operator agent handles all direct `aws` CLI execution
- Never run `aws` commands in the main session -- delegate to cli-operator
