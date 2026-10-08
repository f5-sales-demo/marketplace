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

**Canonical skill URI**: `skill://gcloud:gcloud-index`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

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

- Optionally delegate to `gcloud:cli-operator` agent:

  ```text
  task(
    subagent_type="gcloud:cli-operator",
    description="Google Cloud project operations",
    prompt="<specific gcloud project commands to execute>"
  )
  ```

### Compute / GKE / Cloud Run / Cloud Functions

Keywords: "compute", "instance", "VM", "GKE", "kubernetes", "cluster",
"Cloud Run", "Cloud Functions", "serverless"

- Optionally delegate to `gcloud:cli-operator` agent:

  ```text
  task(
    subagent_type="gcloud:cli-operator",
    description="<brief description of the operation>",
    prompt="<specific gcloud commands to execute and what to report>"
  )
  ```

### Generic gcloud Commands

For any gcloud CLI operation not covered above, optionally delegate to the
cli-operator agent. The agent will use `gcloud <subcommand> --help`
for discovery when needed:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="gcloud:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific gcloud commands to execute and what to report>"
)
```

## Important Notes

- Always check authentication status before infrastructure operations
- Direct tools and the optional cli-operator agent support gcloud CLI execution
- Execute directly with typed native tools or guarded CLI operations
- Use `gcloud <subcommand> --help` for command discovery when unsure
