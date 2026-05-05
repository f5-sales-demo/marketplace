---
name: deal-review
description: >-
  Facilitate a structured weekly MEDDPICC deal review with JSON data
  persistence. Use when the user says "deal review", "pipeline review",
  "forecast call", "inspect the deal", "weekly review", or "deal
  inspection". Reads existing deal JSON files, guides evidence-based
  review, and writes updates back to JSON.
user-invocable: true
---

# MEDDPICC Deal Review

Facilitate a weekly deal inspection using evidence-based questions.
This is the operational heartbeat of MEDDPICC — it keeps deals real
and forecastable. Reviews read from and write to structured JSON deal
files.

## Schema

The deal data model is defined in
[meddpicc-schema.json](../../schema/meddpicc-schema.json). Reviews
read and update deal JSON files conforming to this schema.

## Review Protocol

### Step 1 — Load deal data

Check for an existing deal JSON file:
- Look for `{accountName}-{dealName}.json` at the configured path
  or current working directory
- If found: load it and present current scores as the starting point
- If not found: ask for deal context (same as deal-qualification
  Mode 1) and create a new file

### Step 2 — Establish context

Present the current deal state from the JSON:

- Deal name, account, stage, close date
- Current MEDDPICC scores (element-by-element)
- Overall score and rating (Red/Yellow/Green)
- Last review date

### Step 3 — Evidence inspection

For each MEDDPICC element, ask the inspection questions from
[review-template.md](references/review-template.md). Adapt based
on deal stage — early-stage deals focus on M, I, and initial D/C;
late-stage deals focus on E, P, and Champion actions.

Use the `scoreDefinition` from the schema to contextualize scores:
explain what the current score means and what it would take to
improve by one level.

### Step 4 — Weekly delta

Focus the review on what changed since the last review:

- "What evidence changed this week for each MEDDPICC letter?"
- "What is the next customer action that advances the Decision
  Process?"
- "Do we have EB access scheduled? If not, why not?"
- "Who is the Champion, and what did they do for us this week?"
- "What competitive threat increased or decreased?"
- "What is the riskiest assumption remaining?"

Update the JSON `responses`, `scores`, `evidence`, and `notes`
fields based on new information from the review.

### Step 5 — Action items

For each gap identified, produce:

- **Action:** Specific next step
- **Owner:** Named role (AE, SE, CSM, etc.)
- **Due date:** Concrete date, not "ASAP"
- **Success criteria:** How we'll know this is done

Add actions to `closePlan.criticalActions` in the JSON file.

### Step 6 — Forecast assessment

Based on the review, recommend one of:

- **Commit** — EB, MAP dates, Paper Process all verified (score ≥3
  on each)
- **Best Case** — Most elements strong, 1-2 gaps with closing plan
- **Pipeline** — Significant gaps remain; not ready for forecast
- **At Risk** — Deal has stalled or has fundamental gaps
- **Qualify Out** — Evidence suggests this deal should not be pursued

### Step 7 — Save and report

1. Update `metadata.reviewDate` to today's date
2. Recalculate `scoring.overallScore` and `scoring.overallRating`
3. Update `completionStatus` for any sections that changed
4. Write the updated JSON file
5. Present the review output

## Output Format

```
## Deal Review: [Account Name]
### Date: [today's date]
### Stage: [stage] → [recommended stage change, if any]
### Score: [X/32] ([percentage]%) — [Red/Yellow/Green]

### Evidence Delta (This Week)

| Element | Previous Score | Current Score | Change | Key Update |
| ------- | ------------- | ------------- | ------ | ---------- |
| M | X/4 | X/4 | +/-N | [brief] |
| E | X/4 | X/4 | +/-N | [brief] |
| D (Criteria) | X/4 | X/4 | +/-N | [brief] |
| D (Process) | X/4 | X/4 | +/-N | [brief] |
| P | X/4 | X/4 | +/-N | [brief] |
| I | X/4 | X/4 | +/-N | [brief] |
| C (Champion) | X/4 | X/4 | +/-N | [brief] |
| C (Competition) | X/4 | X/4 | +/-N | [brief] |

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

If the user requests XLS output, render using the same process as
deal-qualification (template + cell mapping).
