---
name: salesforce-index
description: >-
  Top-level intent router for Salesforce operations. Routes auth requests
  to salesforce-auth, org management to the cli-operator agent, and
  development tasks (Apex, Flow, LWC, SOQL, metadata, deployment) to the
  official forcedotcom/afv-library skills. Use when the user mentions
  Salesforce, sf CLI, orgs, or any Salesforce development topic but the
  request does not clearly match a specific skill trigger.
user-invocable: false
---

# Salesforce Intent Router

Route the user's request to the correct skill or agent.

## Routing Rules

### Authentication and Org Management

Keywords: "login", "authenticate", "connect org", "sf org", "org list",
"check org", "switch org"

- Auth setup → invoke `salesforce:salesforce-auth` skill
- Org switching → invoke `switching-org` skill (afv-library)
- Org status check → delegate to `salesforce:cli-operator` agent:

  ```text
  Agent(
    subagent_type="salesforce:cli-operator",
    description="Check Salesforce org status",
    prompt="Run sf org list --json and sf org display --json for the default org. Report which orgs are authenticated and their status."
  )
  ```

### Salesforce Development (afv-library skills)

These requests should be routed to the installed afv-library skills,
which activate automatically based on their trigger descriptions:

| Topic                         | afv-library Skill               |
| ----------------------------- | ------------------------------- |
| Apex classes, services, batch | `generating-apex`               |
| Apex tests                    | `generating-apex-test`          |
| Flows                         | `generating-flow`               |
| LWC / UI bundles              | `building-ui-bundle-app`        |
| Custom objects                | `generating-custom-object`      |
| Custom fields                 | `generating-custom-field`       |
| Validation rules              | `generating-validation-rule`    |
| Permission sets               | `generating-permission-set`     |
| FlexiPages                    | `generating-flexipage`          |
| Agentforce agents             | `developing-agentforce`         |
| Agentforce testing            | `testing-agentforce`            |
| Deployment                    | `deploying-ui-bundle`           |
| SLDS2 migration               | `uplifting-components-to-slds2` |
| Trigger refactoring           | `trigger-refactor-pipeline`     |

If the user's request matches one of these topics, the afv-library skill
will activate automatically — no explicit delegation needed.

### CLI Operations (not covered by afv-library)

For direct sf CLI operations like listing metadata types, running SOQL
queries, or inspecting org limits, delegate to the cli-operator agent:

```text
Agent(
  subagent_type="salesforce:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific sf CLI commands to execute and what to report>"
)
```

## Important Notes

- The forcedotcom/afv-library provides 30 Salesforce development skills
  that are already installed and activate automatically
- This plugin adds container-specific auth and org management on top
- Always check org authentication status before development operations
