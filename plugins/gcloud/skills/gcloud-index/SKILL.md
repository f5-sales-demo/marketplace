---
name: gcloud-index
description: >-
  Top-level intent router for Google Cloud operations. Routes auth
  requests to gcloud-auth, project/compute/GKE operations to the
  cli-operator agent, and generic gcloud commands to the cli-operator.
  Use when the user mentions Google Cloud, GCP, gcloud CLI, Compute
  Engine, GKE, Cloud Run, Cloud Functions, or any Google Cloud topic
  but the request does not clearly match a specific skill trigger.
user-invocable: false
---

# Google Cloud Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication and Account Management

Keywords: "login", "authenticate", "gcloud auth", "connect gcp",
"service account", "application default credentials"

- Auth setup -> invoke `gcloud:gcloud-auth` skill

### Project Operations

Keywords: "project", "gcloud projects", "list projects",
"switch project", "set project", "current project"

- Delegate to `gcloud:cli-operator` agent:

  ```text
  Agent(
    subagent_type="gcloud:cli-operator",
    description="Google Cloud project operations",
    prompt="<specific gcloud project commands to execute>"
  )
  ```

### Compute / GKE / Cloud Run / Cloud Functions

Keywords: "compute", "instance", "VM", "GKE", "kubernetes", "cluster",
"Cloud Run", "Cloud Functions", "serverless"

- Delegate to `gcloud:cli-operator` agent:

  ```text
  Agent(
    subagent_type="gcloud:cli-operator",
    description="<brief description of the operation>",
    prompt="<specific gcloud commands to execute and what to report>"
  )
  ```

### Generic gcloud Commands

For any gcloud CLI operation not covered above, delegate to the
cli-operator agent. The agent will use `gcloud <subcommand> --help`
for discovery when needed:

```text
Agent(
  subagent_type="gcloud:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific gcloud commands to execute and what to report>"
)
```

## Important Notes

- Always check authentication status before infrastructure operations
- The cli-operator agent handles all gcloud CLI execution
- Never run gcloud commands directly in the main session
- Use `gcloud <subcommand> --help` for command discovery when unsure
