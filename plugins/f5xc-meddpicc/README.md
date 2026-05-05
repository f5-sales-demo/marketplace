# f5xc-meddpicc

MEDDPICC sales qualification and deal-execution framework plugin for Claude Code.

## Overview

This plugin provides comprehensive MEDDPICC methodology coaching, deal qualification, and account team alignment for complex enterprise B2B sales. It transforms MEDDPICC from a checkbox exercise into a living deal execution system with evidence-based qualification, structured deal reviews, and actionable coaching.

## What is MEDDPICC?

MEDDPICC is a qualification and deal-execution framework for complex B2B sales:

| Letter | Element | Purpose |
| ------ | ------- | ------- |
| **M** | Metrics | Quantified business outcomes the customer expects |
| **E** | Economic Buyer | Individual with final budget authority |
| **D** | Decision Criteria | Requirements used to evaluate options |
| **D** | Decision Process | Step-by-step path from evaluation to agreement |
| **P** | Paper Process | Procurement mechanics (legal, security, signature) |
| **I** | Identify Pain | Compelling business pain that creates urgency |
| **C** | Champion | Powerful internal advocate |
| **C** | Competition | All alternatives (vendors, build, do-nothing) |

## Skills

### Auto-activated (background knowledge)

| Skill | Activates when... |
| ----- | ----------------- |
| `meddpicc-coach` | User asks about MEDDPICC methodology, deal qualification, pipeline health, or any MEDDPICC element |

### User-invocable (slash commands)

| Command | Skill | Purpose |
| ------- | ----- | ------- |
| `/f5xc-meddpicc:qualify-deal` | `deal-qualification` | Score a deal with MEDDPICC scorecard |
| `/f5xc-meddpicc:deal-review` | `deal-review` | Facilitate weekly deal inspection |
| `/f5xc-meddpicc:champion-test` | `champion-test` | Assess if contact is a true champion |
| `/f5xc-meddpicc:build-map` | `mutual-action-plan` | Build a Mutual Action Plan |

## Agents

| Agent | Purpose |
| ----- | ------- |
| `deal-analyst` | Read-only research agent for deal health analysis |

## Reference Library

The plugin includes comprehensive reference material:

- **MEDDPICC Framework** — complete definitions and evidence requirements
- **Discovery Questions** — field-tested questions for every element
- **Roles & Responsibilities** — RACI ownership by team role
- **Deal Stage Gates** — what must be true before advancing
- **Antipatterns** — common failure modes and fixes
- **Scoring Rubric** — objective 0–4 scoring criteria
- **Review Templates** — weekly inspection question sets
- **MAP Templates** — customer-facing action plan structure

## Installation

```bash
claude /plugin install --dir ./plugins/f5xc-meddpicc
```

Or add to your marketplace configuration for automatic installation.

## Usage Examples

### Qualify a deal

```
/f5xc-meddpicc:qualify-deal Acme Corp
```

### Run a weekly deal review

```
/f5xc-meddpicc:deal-review Acme Corp
```

### Test your champion

```
/f5xc-meddpicc:champion-test Jane Smith VP Engineering
```

### Build a Mutual Action Plan

```
/f5xc-meddpicc:build-map Acme Corp
```

### Get MEDDPICC coaching (auto-activates)

```
How should I approach the Economic Buyer in this deal?
What discovery questions should I ask about Decision Process?
```

## License

Apache-2.0
