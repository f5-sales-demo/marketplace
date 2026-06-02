---
name: deal-update
description: >-
  Ingest unstructured intelligence into a MEDDPICC deal file. Accepts
  any source — meeting notes, email threads, call transcripts, OSINT
  reports, Salesforce updates, competitive intel briefs, presentation
  feedback, or any text containing deal-relevant information. Extracts
  MEDDPICC elements, proposes updates with a structured diff, and writes
  confirmed changes to the deal JSON. Use when the user says "here are
  my meeting notes", "update the deal with this", "I got an email from",
  "paste these transcript notes", "ran an OSINT scan", "got competitive
  intel", or provides any raw text to add to a deal.
user-invocable: true
---

# MEDDPICC Deal Update

Ingest unstructured intelligence from any source and update a live
MEDDPICC deal file. This is the **primary ongoing interaction** for
keeping a deal's qualification data current as new information
arrives throughout the deal cycle.

## Supported Input Types

- Meeting notes and call summaries
- Email threads (forwarded or pasted)
- Online meeting transcripts (Zoom, Teams, Google Meet)
- OSINT research reports
- Competitive intelligence briefs
- Salesforce opportunity exports or field summaries
- Presentation or demo feedback
- Internal Slack/Teams conversations
- Customer-facing documents (RFPs, SOWs, evaluation matrices)
- Prospect site or public filings analysis
- News articles about the account or competitors

## Element Key Reference

The JSON schema uses these exact keys. Always use these paths in
`jq` — never use display names or abbreviations:

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

The corresponding `completionStatus` and `elementScores` keys use
the same names: `.metadata.completionStatus.implicateThePain`,
`.scoring.elementScores.implicateThePain`, etc.

## Data Persistence Protocol

All writes use `jq` with tmp-and-mv (`sponge` is not available).
Verify `jq` is installed before starting: if `jq --version` fails,
ask the user to install it (`apt install jq` or `brew install jq`).

Set `DEAL_FILE` at the start and reuse it for every write:

```bash
DEAL_FILE="/path/to/account-deal.json"
jq '<expression>' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

Use `--arg name value` for strings, `--argjson name value` for
numbers/booleans. Never use `!=` — use `| not` instead.

### Evidence append pattern

Append new evidence to existing; never replace. Prefix with
`[YYYY-MM-DD source-type]` for traceability. Handle both `null`
and `""` as empty — use `// ""` to coalesce null to empty string:

```bash
jq --arg new "[2026-05-06 meeting-notes] VP Ops confirmed 99.99% uptime target" \
  '.qualification.metrics.evidence = (
    ((.qualification.metrics.evidence // "") | if . == "" then $new else . + "\n" + $new end)
  )' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Notes append pattern

Same null-safe append pattern, on the `.notes` field:

```bash
jq --arg new "[2026-05-06 meeting-notes] Board-level visibility on these metrics" \
  '.qualification.metrics.notes = (
    ((.qualification.metrics.notes // "") | if . == "" then $new else . + "\n" + $new end)
  )' "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Score update pattern

After updating an element, write the score and recalculate overall.
Replace `metrics` with the correct key from the Element Key
Reference table above:

```bash
jq --argjson score 3 \
  '.qualification.metrics.score = $score |
   .scoring.elementScores.metrics = $score' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"

jq '(.scoring.elementScores | to_entries | map(.value) | add) as $sum |
  .scoring.overallScore = ($sum / 32 * 100) |
  .scoring.overallRating = (
    if $sum <= 13 then "Red"
    elif $sum <= 25 then "Yellow"
    else "Green" end)' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Stakeholder add pattern

Stakeholders require `name`, `title`, and `roleInDeal` (schema
required fields). Initialize the array if absent:

```bash
jq --argjson s '{"name":"Jane Doe","title":"CISO","roleInDeal":"Influencer","mustSayYes":false,"canSayNo":true,"whatTheyNeedToBelieve":"Meets compliance","viewOfF5":"Neutral","f5Owner":"John Smith"}' \
  'if .stakeholders then .stakeholders += [$s] else .stakeholders = [$s] end' \
  "$DEAL_FILE" > "$DEAL_FILE.tmp" && mv "$DEAL_FILE.tmp" "$DEAL_FILE"
```

### Scorecard display

`scoring.overallScore` stores a percentage (0–100). To display
`X/32`, sum `scoring.elementScores` values directly — do not
back-compute from the percentage.

## Ingestion Protocol

### Step 1 — Locate deal file

1. If the user specifies an account or deal name, search for
   `{accountName}-{dealName}.json` in the current working directory
   or configured path
2. If the user provides a file path directly, use it
3. If ambiguous (multiple matching files), list them and ask which
   deal this intel belongs to
4. Set the `DEAL_FILE` shell variable
5. If no deal file exists, inform the user to run
   `/meddpicc:qualify-deal` first to create one

### Step 2 — Classify the input

Identify the source type (meeting notes, email, transcript, etc.)
and extract the date if available. This becomes the source prefix
for all evidence entries: `[YYYY-MM-DD source-type]`.

If no date is explicit, use today's date.

### Step 3 — Extract MEDDPICC intelligence

Read the input and systematically scan for signals relevant to
each MEDDPICC element. Use the **Element Key Reference** table
above for the correct JSON key when writing updates.

If no signal is found for an element in the input, **leave it
unchanged** — do not propose setting it to score 1 or adding
empty evidence. Only propose updates for elements where the
input contains relevant information.

For each element, use these extraction patterns:

#### Metrics (M)

Look for: numbers, percentages, targets, baselines, KPIs,
measurement systems, financial impacts, improvement claims.

Signals: "we're at X today", "target of Y", "tracked via Z",
"1% improvement = $N", "success looks like", "OKR", "KPI",
"SLA", "uptime", "MTTR", "cost per", "revenue impact".

Score signals: Unquantified goal = 1, KPI confirmed = 2,
baseline + target documented = 3, committed in writing = 4.

#### Economic Buyer (E)

Look for: budget ownership statements, approval authority,
funding source, executive names + titles + decisions.

Signals: "owns the budget", "needs to approve", "VP of",
"SVP of", "CFO", "CTO", "CIO", "has authority", "sign-off",
"reallocate budget", "funded from".

Score signals: Role known but name unknown = 1, named but
not engaged = 2, met directly + priorities known = 3,
actively sponsoring procurement = 4.

#### Decision Criteria (D1)

Look for: requirement lists, evaluation matrices, must haves,
disqualifiers, weighting statements, vendor scoring.

Signals: "top requirements", "must have", "non-negotiable",
"disqualify", "evaluation criteria", "scored on", "ranked
by", "RFP requirement", "we need it to".

Score signals: General requirements = 1, partially documented
= 2, written + ranked + competitive position mapped = 3,
criteria influenced toward our strengths = 4.

#### Decision Process (D2)

Look for: workflow steps, gate mentions, committee names,
named approvers, timelines, event-driven milestones.

Signals: "from yes to signed", "approval process", "review
board", "steering committee", "architecture review", "next
step is", "then it goes to", "before we can".

Score signals: High-level only = 1, major steps known = 2,
step-by-step with names + dates = 3, all gates mapped
including legal/security = 4.

#### Paper Process (P)

Look for: procurement steps, security artifact requirements,
legal review mentions, vendor portal, PO process, contract
terms, insurance, compliance requirements.

Signals: "procurement", "legal review", "security
questionnaire", "SOC2", "pen test", "DPIA", "vendor portal",
"purchase order", "master agreement", "DPA", "standard
contract terms".

Score signals: Aware it exists = 1, some steps known = 2,
documented with owners + artifacts submitted = 3, all steps
done + PO format confirmed = 4.

#### Identify Pain (I)

Look for: problem statements, urgency markers, consequences
of inaction, triggering events, quantified business impact,
stakeholder pain confirmation.

Signals: "if this doesn't change", "cost us", "SLA penalty",
"incident", "downtime", "audit", "regulatory", "board
mandate", "compliance deadline", "what triggered this".

Score signals: Pain implied = 1, acknowledged by customer
= 2, quantified with business impact = 3, multiple
stakeholders confirm + triggering event + deadline = 4.

#### Champion (C1)

Look for: internal advocate actions — introductions made,
intel shared, presentations given, internal advocacy,
personal stake language.

Signals: "introduced us to", "shared the pricing",
"presented our case", "went to bat for", "told me internally",
"my career depends on", "I'll make this happen", "they came
back to me with".

Score signals: Named friendly contact = 1, willing to help
but passive = 2, influence + personal win documented = 3,
actively coaching + taking concrete actions weekly = 4.

#### Competition (C2)

Look for: competitor names, comparison statements, customer
perception language, build-vs-buy signals, do-nothing risk.

Signals: competitor vendor names (Vendor A, Vendor B, CDN providers, etc.),
"also evaluating", "we like them because", "concerned about",
"they're cheaper", "we could build this", "why not just use
[existing vendor]".

Score signals: Named only = 1, intelligence gathered but
perception unclear = 2, customer perception documented +
differentiation strategy = 3, competitive proof delivered
and do-nothing assessed = 4.

#### Also extract

- **Stakeholder mentions:** new names, titles, roles, sentiments
  toward F5
- **Timeline/milestone changes:** dates, deadlines, events
- **Action items:** next steps mentioned by customer or rep
- **Three Whys signals:** urgency, differentiation, timing
  statements

### Step 4 — Load current deal state

Read the deal JSON and load current scores and evidence for all
8 elements. This is the baseline for the diff.

### Step 5 — Present proposed updates

Before writing anything, display a structured summary of all
proposed changes:

```
## Proposed Updates: [Account Name]
### Source: [source-type] — [date]

| # | Element | Update Type | Current Value (truncated) | Proposed Change |
|---|---------|-------------|--------------------------|-----------------|
| 1 | Pain | evidence append | "" | "[2026-05-06 meeting] 3 incidents in Q1..." |
| 2 | Champion | evidence append | "Barney..." | "[2026-05-06 meeting] Barney presented to steering..." |
| 3 | Economic Buyer | response update | "Fred Flinstone" | "Fred confirmed $500K budget in today's meeting" |

### Score Recommendations

| Element | Current | Proposed | Reasoning |
|---------|---------|----------|-----------|
| Pain | 2/4 | 3/4 | Multiple stakeholders confirmed pain; financial impact documented |
| Champion | 2/4 | 3/4 | Champion took concrete verifiable action (presentation) |

### Score Impact
Current overall: X/32 (Y%) [Rating] → Proposed: X/32 (Y%) [Rating]

### Flags
- [CONFLICT] Competition: Input says Vendor A is "not in the running" — contradicts existing note that customer is actively evaluating Vendor A. Clarify before updating.
- [NEW STAKEHOLDER] Lisa Wang (CISO) mentioned — add to stakeholder list?
```

**Rules:**

- Always **append** to `evidence` and `notes` — never replace
  (history is valuable)
- **Replace** `responses[]` only when new information is
  materially more specific or accurate than existing
- **Recommend** score changes with reasoning — require user
  confirmation before writing score changes
- **Flag conflicts** when new info contradicts existing data
  and ask user to reconcile
- **Flag new stakeholders** and ask whether to add to the
  stakeholder array

### Step 6 — User confirmation

Ask the user:

- **"Apply all"** — write every proposed update
- **"Apply selected [numbers]"** — write only listed items,
  e.g. "apply 1, 2 but not 3"
- **"Apply without score changes"** — write evidence/notes
  but hold on score updates
- **"Reject all"** — discard everything

### Step 7 — Write confirmed updates with jq

For each confirmed update, run the appropriate `jq` write
immediately. Do not batch — write each item as it is confirmed.

Write types:

- **Evidence append:** Use the evidence append pattern above
- **Notes append:** Same pattern but on `.notes` field
- **Response replace:** Use `--arg` for string values
- **Score update:** Update element score + recalculate overall
- **Stakeholder add:** Use array append pattern
- **Action item add:** Append to `closePlan.criticalActions`
- **Milestone add:** Append to `closePlan.milestones`

After all writes, run the overall score recalculation jq.

### Step 8 — Updated scorecard

Display the full MEDDPICC scorecard in the deal-qualification
output format, highlighting which elements changed and by how
much since this ingestion session.

```
## MEDDPICC Scorecard: [Account Name] (Updated)
### Source ingested: [source-type] — [date]
### Elements updated: [list]
### Overall: X/32 (Y%) — [Rating] (was Z/32 before this update)
```

## Coaching Notes

After the scorecard, briefly flag:

- The single highest-priority gap to close next
- Any antipatterns detected in the new intelligence
- Whether the ingest suggests the deal has advanced, stalled,
  or has new risks
