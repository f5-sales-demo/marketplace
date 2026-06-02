---
name: azure-index
description: >-
  Top-level intent router for Azure operations. Routes auth requests
  to azure-auth, resource queries to the cli-operator agent, and
  help/discovery to the az_help tool. Use when the user mentions
  Azure, az CLI, subscriptions, resource groups, VMs, or any Azure
  topic but the request does not clearly match a specific skill trigger.
user-invocable: false
---

# Azure Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication and Account Management

Keywords: "login", "authenticate", "az login", "subscription",
"switch subscription", "account", "tenant"

- Auth setup -> invoke `azure:azure-auth` skill
- Account/subscription status -> delegate to `azure:cli-operator` agent:

  ```text
  Agent(
    subagent_type="azure:cli-operator",
    description="Check Azure account status",
    prompt="Run az account show --output json and az account list --output json. Report current subscription, tenant, and all available subscriptions."
  )
  ```

### Resource Operations

Keywords: "resource group", "list resources", "VM", "virtual machine",
"storage account", "web app", "function app"

- Resource queries -> delegate to `azure:cli-operator` agent with
  the specific `az` commands needed. The agent will use
  `az <subcommand> --help` to discover correct syntax when unsure.

### CLI Help and Discovery

Keywords: "how do I", "az help", "what command", "az reference"

- CLI discovery -> the `az_help` tool provides embedded Azure CLI
  knowledge. For commands not covered, the cli-operator agent runs
  `az <subcommand> --help` via Bash for deterministic discovery.

### Generic Azure Commands

For any `az` command execution not covered above, delegate to the
cli-operator agent:

```text
Agent(
  subagent_type="azure:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific az CLI commands to execute and what to report>"
)
```

## Important Notes

- Always check authentication status before resource operations
- The cli-operator agent prefers `--output json` for structured results
- Use `az <subcommand> --help` for command syntax discovery, not guessing
