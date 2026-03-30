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

# Config Analysis — Configuration Q&A

Analyzes customer JSON configurations against the api-operations
resource profiles to answer questions about security posture,
feature enablement, and best practices. Delegates analysis to
the `config-analyzer` agent to keep large JSON configs out of
the main session.

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

## Critical: Subagent Delegation

**Never analyze large JSON configs in the main session.** Customer
configurations can be hundreds of lines. All analysis must be
delegated to the `config-analyzer` agent:

```
Agent(
  subagent_type="f5xc-platform:config-analyzer",
  description="Analyze {resource_type} configuration",
  prompt="<task details with JSON config and reference file paths>"
)
```

The agent reads the resource profile reference files itself and
returns a structured analysis report.

## Resource Type Detection

Identify the resource type from the JSON config before dispatching
to the agent. Use these structural indicators:

| JSON Indicators | Resource Type | Domain | Profile Path |
| --------------- | ------------- | ------ | ------------ |
| `spec.detection_settings` | app_firewall | virtual | `resources/virtual/app_firewall.md` |
| `spec.domains` + `spec.advertise_*` | http_loadbalancer | virtual | `resources/virtual/http_loadbalancer.md` |
| `spec.listen_port` + `spec.dns_volterra_managed` | tcp_loadbalancer | virtual | `resources/virtual/tcp_loadbalancer.md` |
| `spec.origin_servers` | origin_pool | virtual | `resources/virtual/origin_pool.md` |
| `spec.dns_type` or `spec.primary` | dns_zone | DNS | `resources/dns/dns_zone.md` |
| `spec.rule_list` or `spec.legacy_rule_list` | service_policy | virtual | `resources/virtual/service_policy.md` |
| `spec.http_health_check` | healthcheck | virtual | `resources/virtual/healthcheck.md` |
| `spec.certificate_url` | certificate | certificates | `resources/certificates/certificate.md` |

All profile paths are relative to:
`skills/api-operations/references/`

If the resource type is ambiguous, include multiple candidate
profile paths in the agent prompt — the agent will determine the
correct one.

## Dispatch Patterns

### First Question (new config)

````text
Agent(
  subagent_type="f5xc-platform:config-analyzer",
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
Agent(
  subagent_type="f5xc-platform:config-analyzer",
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

````text
Agent(
  subagent_type="f5xc-platform:config-analyzer",
  description="Analyze {primary_type} with {related_type} context",
  prompt="Read these reference files first:
  1. skills/api-operations/references/resources/{domain}/{primary}.md
  2. skills/api-operations/references/resources/{domain}/{related}.md

  Then analyze this JSON configuration:
  ...
  "
)
````

## Multi-Turn Q&A Protocol

The `config-analyzer` agent is ephemeral — it has no memory
between dispatches. The main session must maintain conversational
state:

1. **First question**: Dispatch agent with JSON config + question.
   Store the agent's Findings and Security Posture sections.
2. **Follow-up**: Re-dispatch with same JSON config + compressed
   previous findings + new question.
3. **Context compression**: Extract only the key findings from
   the previous analysis — do not accumulate full agent outputs.
   Include them as bullet points under "Previous findings" in
   the new dispatch prompt.

This keeps follow-up dispatches focused while preserving
conversational continuity.

## Antipatterns — Do NOT Use

- **SendMessage to a completed agent**: The config-analyzer
  agent is ephemeral. Once it returns, it is gone. Do not
  attempt SendMessage or team-based continuation. Always
  spawn a fresh Agent invocation with accumulated context.
- **Team-based coordination**: Do not create a team or use
  persistent agent patterns for config analysis. The
  dispatch-and-forget model is intentional — it prevents
  context accumulation in long-lived agents.
- **Raw JSON accumulation**: Do not pass full prior agent
  outputs into follow-up prompts. Compress findings to
  bullet points to keep dispatch token cost low.

## Common Question Patterns

| Question Pattern | Key Analysis |
| ---------------- | ------------ |
| "Is WAF enabled?" | Check `spec.monitoring` vs `spec.blocking` for app_firewall; check `spec.enable_waf` vs `spec.disable_waf` for http_loadbalancer |
| "Is it in blocking mode?" | Check app_firewall top-level mode: `spec.monitoring: {}` = detect-only, `spec.blocking: {}` = active blocking |
| "What violations are disabled?" | Check `spec.detection_settings.violation_settings.disabled_violation_types` |
| "How to add an exclusion?" | Reference detection_settings structure for signature and violation exclusions |
| "What signatures are active?" | Check `spec.detection_settings.signature_selection_setting` accuracy level |
| "Is bot defense enabled?" | Check the `bot_defense` mutually exclusive group on the LB or `spec.default_bot_setting` on the WAF |
| "What's the security posture?" | Enumerate all security features across mutually exclusive groups |
| "How to switch from monitoring to blocking?" | Explain mode change + recommend reviewing staged signatures and disabled violations first |
