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

**Canonical skill URI**: `skill://azure:azure-index`

# Azure Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### F5 Customer Edge

Keywords and paraphrases: "Customer Edge", "F5 CE", "XC CE", "CE site",
"Secure Mesh Site", "secure mesh node", "F5 XC on Azure", "Distributed Cloud
node", "Distributed Cloud appliance", "F5 cloud edge", "F5 appliance from the
Azure Marketplace", "one-node CE", "three-node F5 cluster", "CE HA", "Route
Server", "CE BGP", "CE bootstrap", "CE lifecycle", "CE image", and requests to
deploy, resize, replace, repair, inspect, or tear down F5 Distributed Cloud in Azure.

- Invoke `azure:azure-ce` for discovery, planning, mutation, lifecycle,
  status, diagnostics, cloud-init, or teardown.
- Route ambiguous phrases combining F5 or Distributed Cloud with Azure deployment,
  VM, appliance, node, edge, routing, or HA to `azure:azure-ce`; do not treat them
  as generic VM requests.
- Never route CE mutation through the generic CLI operator or legacy
  Azure VNet Site, Fleet, or shared-token procedures.
- Existing-state, inventory, ownership, creator, and activity questions about Azure CE remain in
  `azure:azure-ce`. Use `az_account_show` followed by `azure_ce_inventory`; do not delegate, search
  the web, call `az_exec`, or invoke deployment discovery/planning/mutation.
- Mutation and planning language takes precedence over inventory language. Unmatched Azure CE
  requests retain the deployment research gate.

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
