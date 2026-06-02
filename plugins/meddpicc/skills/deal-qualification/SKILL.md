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

## Element Key Reference

Use these exact JSON keys in all jq paths:

| Display Name | JSON Key | jq Path |
| ------------ | -------- | ------- |
| Metrics (M) | `metrics` | `.qualification.metrics` |
| Economic Buyer (E) | `economicBuyer` | `.qualification.economicBuyer` |
| Decision Criteria (D1) | `decisionCriteria` | `.qualification.decisionCriteria` |
| Decision Process (D2) | `decisionProcess` | `.qualification.decisionProcess` |
| Paper Process (P) | `paperProcess` | `.qualification.paperProcess` |
| Identify Pain (I) | `implicateThePain` | `.qualification.implicateThePain` |
| Champion (C1) | `champion` | `.qualification.champion` |
| Competition (C2) | `competition` | `.qualification.competition` |

## Data Persistence Protocol

Write data to the deal JSON **incrementally** using `jq` as each
piece is collected — never batch writes at the end. This ensures
data is preserved if the user pauses or the session ends.

Verify `jq` is installed before starting: if `jq --version` fails,
ask the user to install it (`apt install jq` or `brew install jq`).

### File variable

Set a shell variable at the start of the session and reuse it for
every write:

```bash
DEAL_FILE="/path/to/account-deal.json"
```

### Write pattern

Use `jq` with tmp-and-mv (`sponge` is not available):

```bash
jq '<expression>' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Escaping rules

- Use `--arg name value` for user-provided strings — prevents
  shell injection and handles quotes automatically
- Use `--argjson name value` for numbers and booleans
- Never use `!=` in jq — use `| not` instead
- Never use `!` in Bash — use `cmd || { handle; }` instead

### Write points and jq patterns

**Metadata field** — after each metadata answer:

```bash
jq --arg v "Discovery" '.metadata.dealStatus = $v' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Multiple metadata fields** — when collecting several at once:

```bash
jq --arg status "Discovery" --arg close "2026-09-30" \
   --argjson prob 0.25 \
  '.metadata.dealStatus = $status |
   .metadata.closeDate = $close |
   .metadata.winProbability = $prob' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**MEDDPICC element completion** — after scoring each element, write
responses, score, evidence, notes, completionStatus, and
elementScore. Replace `metrics` with the correct key from the
Element Key Reference table:

```bash
jq --arg r0 "Answer to question 1" \
   --arg r1 "Answer to question 2" \
   --argjson score 2 \
   --arg ev "[2026-05-06 interview] Supporting evidence" \
   --arg notes "Additional context" \
  '.qualification.metrics.responses = [$r0, $r1] |
   .qualification.metrics.score = $score |
   .qualification.metrics.evidence = $ev |
   .qualification.metrics.notes = $notes |
   .metadata.completionStatus.metrics = "complete" |
   .scoring.elementScores.metrics = $score' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Overall score calculation** — after all 8 elements are scored:

```bash
jq '(.scoring.elementScores | to_entries | map(.value) | add) as $sum |
  .scoring.overallScore = ($sum / 32 * 100) |
  .scoring.overallRating = (
    if $sum <= 13 then "Red"
    elif $sum <= 25 then "Yellow"
    else "Green" end)' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Array append** — for stakeholders, milestones, actions, team.
Stakeholders require `name`, `title`, and `roleInDeal`. Initialize
the array if absent:

```bash
jq --argjson item '{"name":"Jane","title":"VP","roleInDeal":"Influencer","mustSayYes":false,"canSayNo":true,"whatTheyNeedToBelieve":"...","viewOfF5":"Neutral","f5Owner":"John Smith"}' \
  'if .stakeholders then .stakeholders += [$item] else .stakeholders = [$item] end' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Scorecard display:** `scoring.overallScore` stores a percentage
(0–100). To display `X/32`, sum `scoring.elementScores` values
directly — do not back-compute from the percentage.

## Initialization — Determine Mode

When the user invokes this skill, determine which mode to use:

### Mode 1: Fresh Guided Interview (default)

User provides a deal or account name with no existing JSON file.

1. Create a new deal JSON using the `Write` tool with a **full
   skeleton** that includes all static data pre-populated from the
   schema. Use [example-deal.json](../../schema/example-deal.json)
   as the structural reference. Every MEDDPICC element must include:
   - `definition` — from the schema's `const` value
   - `questions` — from the schema's `default` array
   - `scoreDefinition` — from the schema's `default` object
   - `responses: []` — empty array (not null)
   - `score: 0` — integer zero
   - `evidence: ""` — empty string (not null, not omitted)
   - `notes: ""` — empty string (not null, not omitted)

   The `evidence` and `notes` fields **must be initialized to `""`**
   — not `null`, not omitted. Downstream evidence appends depend
   on these being strings. Also include:
   - `metadata` with generated `dealId`, account/deal name, today's
     `reviewDate`, all `completionStatus` fields `"not_started"`
   - `scoring.elementScores` with all 8 keys set to `0`
   - `scoring.overallScore: 0` and `scoring.overallRating: "Red"`
   - Empty `stakeholders: []`, `closePlan: {milestones: [],
     criticalActions: []}`, `team: {f5: [], partner: []}`
2. Set the `DEAL_FILE` shell variable to the file path.
3. Collect metadata: deal status, close date, competition, win
   probability, forecast stage, revenue breakdown, client
   interactions. **Write:** after each answer (or batch of related
   answers), update the metadata field(s) with `jq`.
4. Walk through each MEDDPICC element sequentially using the
   `questions` from the schema — ask one question at a time.
5. After each element: assign a score (0-4) using the
   `scoreDefinition` from the schema, ask for evidence. **Write:**
   immediately update `qualification.<element>.responses`,
   `.score`, `.evidence`, `.notes`, plus
   `metadata.completionStatus.<element>` = `"complete"` and
   `scoring.elementScores.<element>` with a single `jq` call.
6. After all 8 elements: collect Three Whys, stakeholders, sales
   strategy, close plan, and team. **Write:** after each section,
   update the section data and its `completionStatus` with `jq`.
7. **Write:** calculate and write `scoring.overallScore` and
   `scoring.overallRating` with the overall score `jq` pattern.

The file is always up to date — there is no final "save" step. The
user can pause at any time without data loss because every answer
is persisted immediately.

### Mode 2: Import and Complete

User provides `--import` flag, a Salesforce opportunity ID, or there
is an existing JSON file for this deal.

**If existing JSON file found:**

1. Read the file and set the `DEAL_FILE` shell variable
2. Check `completionStatus` for incomplete sections
3. Present a summary of what's complete and what's missing
4. Ask targeted questions only for incomplete/partial sections
5. **Write:** use `jq` to update each completed section
   immediately (same protocol as Mode 1)

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

1. Read the existing JSON file and set the `DEAL_FILE` shell variable
2. Present current scores and gaps
3. Allow the user to update any section — **Write:** use `jq` to
   persist each change immediately
4. **Write:** recalculate `scoring.overallScore` and
   `scoring.overallRating` with the overall score `jq` pattern

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

The deal JSON file is written incrementally throughout the session
via `jq` (see Data Persistence Protocol). By the time the
interview completes, the file is already up to date and conforms
to the schema. This file is the source of truth.

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
