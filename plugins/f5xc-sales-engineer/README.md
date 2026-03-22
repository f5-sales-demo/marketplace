# f5xc-sales-engineer

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-green)

Sales Engineer persona framework for F5 XC demo repositories.

**[Full documentation](https://f5xc-salesdemos.github.io/marketplace/plugins/f5xc-sales-engineer/)**

## Installation

```text
/plugin install f5xc-sales-engineer@f5xc-salesdemos-marketplace
```

Or add to `.claude/settings.json`:

```json
{
  "enabledPlugins": [
    "f5xc-sales-engineer@f5xc-salesdemos-marketplace"
  ]
}
```

## What It Does

This plugin provides a reusable Sales Engineer persona system for
F5 Distributed Cloud demo repositories. It includes four persona
skills and two autonomous agents that handle the full demo meeting
lifecycle, from pre-meeting environment verification through live
execution, Q&A, and teardown.

## Skills

| Skill | Purpose |
| --- | --- |
| `sales-engineer` | Role index, routes user intent to the correct persona |
| `demo-executor` | API-driven demo with four-stage meeting lifecycle |
| `presenter` | As-built walkthrough presentation using pre-configured demo environment |
| `subject-matter-expert` | Reference-backed Q&A with citation requirements |

## Agents

| Agent | Purpose |
| --- | --- |
| `demo-housekeeping` | Autonomous pre-meeting verification (Readiness Matrix T0-T5) and teardown |
| `demo-researcher` | Read-only research librarian with structured citation reports |

## Convention Files

This plugin reads product-specific content from standardized files
in each repository root. Create these files to configure the plugin
for your product:

| File | Purpose | Required |
| --- | --- | --- |
| `PRODUCT_EXPERTISE.md` | Product capabilities, API reference | Yes |
| `WALKTHROUGH_CONFIG.md` | Demo app URL, walkthrough order, timing | For presenter |
| `SOURCE_INDEX.md` | Research source catalog (local docs + external) | For Q&A |
| `READINESS_MATRIX.md` | Required/optional variables, readiness checks | For prep/teardown |
| `docs/api-automation/` | Phase files with cURL commands | For demo-executor |

## Trigger Phrases

| Phrase | Skill |
| --- | --- |
| "run the demo", "execute the demo", "start the demo" | demo-executor (Execute) |
| "prepare the demo", "pre-flight", "is the demo ready" | demo-executor (Prepare) |
| "Q&A", "question and answer", "take questions" | demo-executor (Q&A) |
| "tear down", "clean up", "end the meeting" | demo-executor (Teardown) |
| "walk through the demo", "present the demo", "walkthrough" | presenter |
| "answer questions", "explain", "what does" | subject-matter-expert |
