---
name: config-analysis
description: >-
  Configuration analysis and advisory for F5 XC platform
  resources. Analyzes customer JSON configurations to answer
  questions about security posture, feature enablement, mode
  settings, exclusions, and best practices. Supports multi-turn
  Q&A within agent dispatch. Use when user provides a JSON
  config and asks questions about it, or asks to analyze,
  review, or audit a configuration.
user-invocable: false
---

**Canonical skill URI**: `skill://platform:config-analysis`

Direct execution is the default for the requested task. Use available typed
native tools or the documented protocol directly. Delegation examples are
optional for substantial work. Keep source inspection, independent research,
and unrelated follow-ups available; native authorization and credential
safeguards apply to each operation.

# Config Analysis — Configuration Q&A

Analyzes customer JSON configurations against the api-operations
resource profiles to answer questions about security posture,
feature enablement, and best practices. Analyze directly using reference
files; optionally delegate large configurations to config-analyzer.

## When This Skill Applies

Route here when the user:

- Provides a JSON configuration and asks a question about it
- Asks "is [feature] enabled/disabled" with a config present
- Asks about security posture, mode settings, or configuration
  review
- Asks "how to change/enable/disable [feature]" in context of
  a provided config
- Asks to analyze, review, audit, or explain a configuration
- Asks follow-up questions about a previously analyzed config

## Direct execution and optional delegation

Execute the requested task directly with available tools. For large payloads,
optional delegation is available:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:config-analyzer",
  description="Analyze {resource_type} configuration",
  prompt="<task details with JSON config and reference file paths>"
)
```

The agent reads the resource profile reference files itself and
returns a structured analysis report.

## Resource Type Detection

Identify the resource type from the JSON config before dispatching
to the agent. Use these structural indicators:

| JSON Indicators                                  | Resource Type     | Domain       | Profile Path                             |
| ------------------------------------------------ | ----------------- | ------------ | ---------------------------------------- |
| `spec.detection_settings`                        | app_firewall      | virtual      | `resources/virtual/app_firewall.md`      |
| `spec.domains` + `spec.advertise_*`              | http_loadbalancer | virtual      | `resources/virtual/http_loadbalancer.md` |
| `spec.listen_port` + `spec.dns_volterra_managed` | tcp_loadbalancer  | virtual      | `resources/virtual/tcp_loadbalancer.md`  |
| `spec.origin_servers`                            | origin_pool       | virtual      | `resources/virtual/origin_pool.md`       |
| `spec.dns_type` or `spec.primary`                | dns_zone          | DNS          | `resources/dns/dns_zone.md`              |
| `spec.rule_list` or `spec.legacy_rule_list`      | service_policy    | virtual      | `resources/virtual/service_policy.md`    |
| `spec.http_health_check`                         | healthcheck       | virtual      | `resources/virtual/healthcheck.md`       |
| `spec.certificate_url`                           | certificate       | certificates | `resources/certificates/certificate.md`  |

All profile paths are relative to:
`skills/api-operations/references/`

If the resource type is ambiguous, include multiple candidate
profile paths in the agent prompt — the agent will determine the
correct one.

## Optional delegation prompts

### First Question (new config)

````text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:config-analyzer",
  description="Analyze {resource_type} configuration",
  prompt="Read these reference files first:
  1. skills/api-operations/references/resources/{domain}/{resource}.md
  [2. additional profiles if cross-resource analysis needed]

  Then analyze this JSON configuration:
  ```json
  {paste the customer's JSON config here}
  ```

  Question: {user's question}

  Use the resource profile to interpret mutually exclusive groups,
  constrained fields, dependencies, and relationships. Cite specific
  sections from the reference files in your findings."
)
````

### Follow-up Question (same config)

For follow-up questions about a previously analyzed configuration,
re-dispatch with accumulated context:

````text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:config-analyzer",
  description="Follow-up analysis on {resource_type}",
  prompt="Read these reference files first:
  1. skills/api-operations/references/resources/{domain}/{resource}.md

  Original JSON configuration:
  ```json
  {same config — paste again}
  ```

  Previous findings:
  - {compressed key findings from the prior analysis report}

  New question: {follow-up question}

  Build on the previous findings. Do not repeat analysis already
  covered unless the new question contradicts or extends it."
)
````

### Cross-Resource Analysis

When a config references other resource types (e.g., an HTTP LB
config that includes `enable_waf` referencing an app_firewall),
include both resource profiles:

```text
Optional delegation prompt (expand with the available task schema):
Agent(
  subagent_type="platform:config-analyzer",
  description="Analyze {primary_type} with {related_type} context",
  prompt="Read these reference files first:
  1. skills/api-operations/references/resources/{domain}/{primary}.md
  2. skills/api-operations/references/resources/{domain}/{related}.md

  Then analyze this JSON configuration:
  ...
  "
)
```

## Follow-up questions

Keep the relevant configuration and verified findings available for follow-ups.
Analyze the next question directly. If optional delegation is useful, supply
only the necessary configuration, reference paths, previous findings, and the
new question. Review the returned evidence before responding.

## Common Question Patterns

| Question Pattern                             | Key Analysis                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| "Is WAF enabled?"                            | Check `spec.monitoring` vs `spec.blocking` for app_firewall; check `spec.enable_waf` vs `spec.disable_waf` for http_loadbalancer |
| "Is it in blocking mode?"                    | Check app_firewall top-level mode: `spec.monitoring: {}` = detect-only, `spec.blocking: {}` = active blocking                    |
| "What violations are disabled?"              | Check `spec.detection_settings.violation_settings.disabled_violation_types`                                                      |
| "How to add an exclusion?"                   | Reference detection_settings structure for signature and violation exclusions                                                    |
| "What signatures are active?"                | Check `spec.detection_settings.signature_selection_setting` accuracy level                                                       |
| "Is bot defense enabled?"                    | Check the `bot_defense` mutually exclusive group on the LB or `spec.default_bot_setting` on the WAF                              |
| "What's the security posture?"               | Enumerate all security features across mutually exclusive groups                                                                 |
| "How to switch from monitoring to blocking?" | Explain mode change + recommend reviewing staged signatures and disabled violations first                                        |
