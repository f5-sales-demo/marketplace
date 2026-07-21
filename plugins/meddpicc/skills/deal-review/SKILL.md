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

## Data Persistence Protocol

Update the deal JSON **incrementally** using `jq` as each piece of
the review is collected — never batch writes at the end. This
ensures data is preserved if the user pauses or the session ends.

### File variable

Set a shell variable when the deal file is loaded:

```bash
DEAL_FILE="/path/to/account-deal.json"
```

### Write pattern

Use `jq` with tmp-and-mv (`sponge` is not available):

```bash
jq '<expression>' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Escaping rules

- Use `--arg name value` for user-provided strings
- Use `--argjson name value` for numbers and booleans
- Never use `!=` in jq — use `| not` instead
- Never use `!` in Bash — use `cmd || { handle; }` instead

## Engine (deterministic source of truth)

Ordering and scoring are computed by the plugin engine — never by
hand. After element updates, recompute scores with
`bun xcsh://plugin/meddpicc/file/engine/cli.ts score <deal.json>`
and relay `sum` / `overallScore` / `overallRating`. (Local/dev
equivalent: `bun "$PLUGIN_ROOT/engine/cli.ts" score <deal.json>`.)
Build the weekly delta table by comparing the engine's per-element
`elementScores` against the `previousElementScores` snapshot taken
at Step 1 (load).

Element display names map to `qualification.<key>` where `<key>` is
one of: metrics, economicBuyer, decisionCriteria, decisionProcess,
paperProcess, implicateThePain, champion, competition (canonical
order defined by the engine; do not re-derive by hand). Use these
exact keys in all `jq` paths — display name ≠ key.

### Key jq patterns for reviews

**Evidence append** — append new evidence; never replace history.
Handle both `null` and `""` as empty with `// ""`:

```bash
jq --arg new "[2026-05-20 weekly-review] Fred confirmed ARB slot June 2" \
  '.qualification.metrics.evidence = (
    ((.qualification.metrics.evidence // "") | if . == "" then $new else . + "\n" + $new end)
  )' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Score + completionStatus update** — update element score after
evidence review. Replace `metrics` with the correct key (see the
Engine section):

```bash
jq --argjson score 3 \
  '.qualification.metrics.score = $score |
   .metadata.completionStatus.metrics = "complete" |
   .scoring.elementScores.metrics = $score' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Responses update** — replace responses only when new information
is materially more specific than existing:

```bash
jq --arg r0 "Updated response to Q1" --arg r1 "Updated response to Q2" \
  '.qualification.metrics.responses = [$r0, $r1]' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Append to critical actions**:

```bash
jq --argjson action '{"action":"Next step","owner":"AE","dueDate":"2026-05-15","status":"pending"}' \
  'if .closePlan then .closePlan.criticalActions += [$action] else .closePlan = {milestones:[], criticalActions:[$action]} end' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Snapshot previous scores** — take this snapshot at Step 1 (load),
before any element scores are changed, so the delta table is accurate:

```bash
jq '.scoring.previousElementScores = .scoring.elementScores' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

**Overall score** — do **not** recompute this by hand. After all
element updates, read `sum` / `overallScore` / `overallRating` from
the engine's `score` command (see the Engine section). `jq` is used
only for the element writes and the `previousElementScores`
snapshot above.

**Scorecard display:** take `sum` (the `X` in `X/32`),
`overallScore` (percentage), and `overallRating` from the engine's
`score` output — do not back-compute them from stored fields.

## Review Protocol

### Step 1 — Load deal data

Check for an existing deal JSON file:

- Look for `{accountName}-{dealName}.json` at the configured path
  or current working directory
- If found: load it, set the `DEAL_FILE` shell variable, and
  **immediately snapshot** `previousElementScores` using the
  snapshot jq pattern above — this must happen before any element
  scores are changed in Steps 3–4
- If not found: inform the user to create a deal first with
  `/meddpicc:qualify-deal` — a review requires an existing
  deal file with baseline scores to produce meaningful deltas

### Step 2 — Establish context

Present the current deal state, taking scores from the engine's
`score` output (see the Engine section) rather than reading them by
hand:

- Deal name, account, stage, close date
- Current MEDDPICC scores (element-by-element, from `elementScores`)
- Overall score and rating (`overallScore` / `overallRating`)
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

**Write:** after each element discussion, immediately update
`responses`, `score`, `evidence`, and `notes` in the JSON with
`jq` (see Data Persistence Protocol). Also update
`completionStatus` and `scoring.elementScores` for the element.

### Step 5 — Action items

For each gap identified, produce:

- **Action:** Specific next step
- **Owner:** Named role (AE, SE, CSM, etc.)
- **Due date:** Concrete date, not "ASAP"
- **Success criteria:** How we'll know this is done

**Write:** append each action to `closePlan.criticalActions` with
`jq` using the array append pattern (see Data Persistence Protocol).

### Step 6 — Forecast assessment

Based on the review, recommend one of:

- **Commit** — EB, MAP dates, Paper Process all verified (score ≥3
  on each)
- **Best Case** — Most elements strong, 1-2 gaps with closing plan
- **Pipeline** — Significant gaps remain; not ready for forecast
- **At Risk** — Deal has stalled or has fundamental gaps
- **Qualify Out** — Evidence suggests this deal should not be pursued

### Step 7 — Finalize and report

The file has been updated incrementally throughout the review.
The `previousElementScores` snapshot was taken at Step 1 (load).
For the final writes:

1. **Write:** update `metadata.reviewDate` to today's date, update
   `metadata.reviewer` to the person conducting the review, and
   update `metadata.lastClientInteraction` with the most recent
   interaction discussed:

   ```bash
   jq --arg date "2026-05-20" --arg reviewer "John Smith" \
      --arg lastDate "2026-05-20" --arg lastOutcome "Weekly review" \
     '.metadata.reviewDate = $date |
      .metadata.reviewer = $reviewer |
      .metadata.lastClientInteraction = {date: $lastDate, outcome: $lastOutcome}' \
     "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
   ```

2. Recompute scores with the engine's `score` command (see the
   Engine section) and use `sum` / `overallScore` / `overallRating`
   in the report — do not recalculate by hand
3. Present the review output

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

In the Evidence Delta table, **Previous Score** is read from the
`previousElementScores` snapshot (taken at Step 1) and **Current
Score** from the engine's `score` `elementScores`; **Change** is
their difference. Do not compute these from the raw JSON by hand.

If the user requests XLS output, render using the same process as
deal-qualification (template + cell mapping).
