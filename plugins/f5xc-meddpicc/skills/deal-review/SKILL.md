---
name: deal-review
description: >-
  Facilitate a structured weekly MEDDPICC deal review. Use when the
  user says "deal review", "pipeline review", "forecast call",
  "inspect the deal", "weekly review", or "deal inspection". Guides
  the review with evidence-based questions for each element.
user-invocable: true
---

# MEDDPICC Deal Review

Facilitate a weekly deal inspection using evidence-based questions.
This is the operational heartbeat of MEDDPICC — it keeps deals real
and forecastable.

## Review Protocol

### Step 1 — Establish context

Ask for:

- Deal/account name
- Current stage
- Target close date
- Last review date (if known)

### Step 2 — Evidence inspection

For each MEDDPICC element, ask the following inspection questions.
Adapt based on deal stage — early-stage deals focus on M, I, and
initial D/C; late-stage deals focus on E, P, and Champion actions.

Refer to [review-template.md](references/review-template.md) for
the full question set.

### Step 3 — Weekly delta

Focus the review on what changed:

- "What evidence changed this week for each MEDDPICC letter?"
- "What is the next customer action that advances the Decision
  Process?"
- "Do we have EB access scheduled? If not, why not?"
- "Who is the Champion, and what did they do for us this week?"
- "What competitive threat increased or decreased?"
- "What is the riskiest assumption remaining?"

### Step 4 — Action items

For each gap identified, produce:

- **Action:** Specific next step
- **Owner:** Named role (AE, SE, CSM, etc.)
- **Due date:** Concrete date, not "ASAP"
- **Success criteria:** How we'll know this is done

### Step 5 — Forecast assessment

Based on the review, recommend one of:

- **Commit** — EB, MAP dates, Paper Process all verified
- **Best Case** — Most elements strong, 1–2 gaps with closing plan
- **Pipeline** — Significant gaps remain; not ready for forecast
- **At Risk** — Deal has stalled or has fundamental gaps
- **Qualify Out** — Evidence suggests this deal should not be pursued

## Output Format

```
## Deal Review: [Account Name]
### Date: [today's date]
### Stage: [stage] → [recommended stage change, if any]

### Evidence Delta (This Week)

| Element | Last Week | This Week | Change |
| ------- | --------- | --------- | ------ |
| M | | | |
| E | | | |
| D (Criteria) | | | |
| D (Process) | | | |
| P | | | |
| I | | | |
| C (Champion) | | | |
| C (Competition) | | | |

### Key Risks

1. [Risk + impact + mitigation]
2. [Risk + impact + mitigation]

### Action Items

| # | Action | Owner | Due | Success Criteria |
| - | ------ | ----- | --- | ---------------- |
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

### Forecast: [Commit / Best Case / Pipeline / At Risk]
[Justification]

### Next Review: [date]
```
