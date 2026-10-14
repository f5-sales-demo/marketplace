---
name: salesforce-index
description: >-
  Top-level intent router for Salesforce operations. Routes auth requests
  to salesforce-auth, org management to the cli-operator agent, and
  account/opportunity intelligence to native tools, and development tasks (Apex, Flow, LWC, metadata, deployment) to the
  official forcedotcom/afv-library skills. Use when the user mentions
  Salesforce, sf CLI, orgs, or any Salesforce development topic but the
  request does not clearly match a specific skill trigger.
user-invocable: false
---

**Canonical skill URI**: `skill://salesforce:salesforce-index`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

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
  task(
    subagent_type="salesforce:cli-operator",
    description="Check Salesforce org status",
    prompt="Run sf org list --json and sf org display --json for the default org. Report which orgs are authenticated and their status."
  )
  ```

### Account and opportunity intelligence

For project-file analysis, customer account discovery, recent opportunities,
product relevance, qualification or ad-hoc SOQL, use `sf_query` and
`sf_describe` directly. Discover them when they are not active. Follow
sf_query's project/account evidence chain: verify the account, keep org scope,
define recency, confirm custom schema and product evidence, preserve currencies,
and report coverage and uncertainty. Use `sf_pipeline_report` for the user's
team pipeline rather than a specific customer investigation.

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
queries, or inspecting org limits, optionally delegate to the cli-operator agent:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="salesforce:cli-operator",
  description="<brief description of the operation>",
  prompt="<specific sf CLI commands to execute and what to report>"
)
```

## Important Notes

- The optional forcedotcom/afv-library supplies Salesforce development skills.
  Verify that the relevant skill is installed before invoking it
- This plugin adds container-specific auth and org management on top
- Always check org authentication status before development operations
