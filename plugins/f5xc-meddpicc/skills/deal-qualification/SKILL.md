---
name: deal-qualification
description: >-
  Score and qualify a deal using the MEDDPICC framework with structured
  JSON data capture. Use when the user says "qualify this deal", "score
  the deal", "how healthy is this deal", "deal health check", "MEDDPICC
  score", "assess this opportunity", or provides a Salesforce opportunity
  ID. Produces a structured JSON deal file and optional XLS spreadsheet.
  Supports fresh guided interviews, importing existing data, and
  resuming partial reviews.
user-invocable: true
---

# MEDDPICC Deal Qualification

Produce an evidence-based MEDDPICC scorecard for a deal. Collect
structured data into a JSON file that validates against the MEDDPICC
schema, score each element 0-4, identify gaps, and recommend next
actions.

## Schema

The deal data model is defined in
[meddpicc-schema.json](../../schema/meddpicc-schema.json). Every deal
review produces a JSON file conforming to this schema. The schema
embeds guiding questions and scoring rubric definitions for each
MEDDPICC element.

## Initialization — Determine Mode

When the user invokes this skill, determine which mode to use:

### Mode 1: Fresh Guided Interview (default)

User provides a deal or account name with no existing JSON file.

1. Create a new deal JSON with a generated `dealId`, the provided
   account/deal name, today's date as `reviewDate`, and all
   `completionStatus` fields set to `"not_started"`
2. Collect metadata first: deal status, close date, competition,
   win probability, forecast stage, revenue breakdown, client
   interactions
3. Walk through each MEDDPICC element sequentially using the
   `questions` from the schema — ask one question at a time
4. After each element: assign a score (0-4) using the
   `scoreDefinition` from the schema, ask for evidence, update
   `completionStatus` to `"complete"`
5. After all 8 elements: collect Three Whys, stakeholders, sales
   strategy, close plan, and team
6. Calculate `scoring.overallScore` and `scoring.overallRating`
7. Write the JSON file

The user can pause at any time. On pause, write the JSON with
`completionStatus` reflecting progress for each section.

### Mode 2: Import and Complete

User provides `--import` flag, a Salesforce opportunity ID, or there
is an existing JSON file for this deal.

**If existing JSON file found:**
1. Read the file
2. Check `completionStatus` for incomplete sections
3. Present a summary of what's complete and what's missing
4. Ask targeted questions only for incomplete/partial sections

**If Salesforce opportunity ID provided:**
1. Read the field mapping from
   [sfdc-field-mapping.json](references/sfdc-field-mapping.json)
2. Query Salesforce using the SOQL template (requires Salesforce
   MCP server or `sf`/`sfdx` CLI)
3. Map SFDC fields to schema fields using the transform definitions
4. Create a pre-populated JSON file
5. Identify gaps and start guided Q&A for missing sections

If Salesforce is not available, inform the user and fall back to
Mode 1.

### Mode 3: Review and Update

User invokes with an existing complete deal.

1. Read the existing JSON file
2. Present current scores and gaps
3. Allow the user to update any section
4. Recalculate scores after changes

## File Location

Deal JSON files are stored at a configurable path:
1. If the user specifies a path, use it
2. Otherwise, use the current working directory
3. File naming: `{accountName}-{dealName}.json` (slugified —
   lowercase, spaces replaced with hyphens, special characters
   removed)

## Scoring Protocol

For each MEDDPICC element, assess the evidence and assign a score
using the 0-4 rubric defined in the schema's `scoreDefinition`
for that element.

Refer to [scoring-rubric.md](references/scoring-rubric.md) for
detailed scoring criteria.

| Score | Label | Meaning |
| ----- | ----- | ------- |
| 4 | **Verified+** | Full evidence with action — highest confidence |
| 3 | **Strong** | Verified evidence from customer; multiple data points |
| 2 | **Developing** | Partial evidence; some assumptions remain |
| 1 | **Weak** | Minimal evidence; mostly assumptions |
| 0 | **Unknown** | No evidence or not yet explored |

### Overall Score Calculation

- **Formula:** `(sum of 8 element scores / 32) × 100`
- **Rating:** Red (0-13/32), Yellow (14-25/32), Green (26-32/32)

### Scoring Guidelines

- **26–32 (~81–100%):** Strong — Commit if Decision Process and
  Paper Process are both ≥3
- **14–25 (~44–78%):** Developing — Best Case with gap-closing plan
- **0–13 (~0–41%):** At risk — Pipeline or qualify out

## Output

### Primary output: JSON file

Write the deal data to a JSON file conforming to the schema. This
is the source of truth.

### Secondary output: Markdown scorecard

After writing the JSON file, display a scorecard summary:

```
## MEDDPICC Deal Scorecard

### Deal: [deal name]
### Account: [account name]
### Date: [review date]
### Stage: [deal status]
### Overall Score: [X/32] ([percentage]%) — [Red/Yellow/Green]

---

| Element | Score | Label | Evidence Summary | Key Gap |
| ------- | ----- | ----- | ---------------- | ------- |
| Metrics | X/4 | [label] | [brief] | [gap or "None"] |
| Economic Buyer | X/4 | [label] | [brief] | [gap or "None"] |
| Decision Criteria | X/4 | [label] | [brief] | [gap or "None"] |
| Decision Process | X/4 | [label] | [brief] | [gap or "None"] |
| Paper Process | X/4 | [label] | [brief] | [gap or "None"] |
| Implicate Pain | X/4 | [label] | [brief] | [gap or "None"] |
| Champion | X/4 | [label] | [brief] | [gap or "None"] |
| Competition | X/4 | [label] | [brief] | [gap or "None"] |

### Top 3 Gaps to Close

1. **[Element]** — [specific gap and why it matters]
   - **Next action:** [specific action]
   - **Owner:** [role]
   - **By when:** [timeframe]
```

### Optional output: XLS spreadsheet

If the user requests XLS output or says "render", "spreadsheet",
or "export":

1. Read the template from
   [meddpicc-template.xlsx](references/meddpicc-template.xlsx)
2. Use the cell mapping from
   [cell-mapping.json](references/cell-mapping.json) to populate
   the template with data from the deal JSON
3. Save as `{accountName}-{dealName}-{YYYY-MM-DD}.xlsx`
4. The XLS is disposable — the JSON file is the source of truth

## Coaching Behavior

After presenting the scorecard:

1. Highlight the single most critical gap
2. Suggest specific discovery questions to close the top gaps
3. Recommend which team member should own each action
4. Flag any antipatterns you observe (refer to
   `meddpicc-coach/references/anti-patterns.md`)
