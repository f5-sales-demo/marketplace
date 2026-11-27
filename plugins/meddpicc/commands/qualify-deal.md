---
description: Score and qualify a deal using the MEDDPICC framework with structured JSON output
argument-hint: "[deal name or account] [--import] [--sfdc <opportunity-id>]"
---

# Qualify Deal

## Timing

Honor explicit user or customer dates, deadlines, and agreed milestones. When
none are supplied, keep timing unknown or unagreed. Suggest a schedule, deadline,
meeting duration, or review cadence only when explicitly requested; label it a
proposal until the customer agrees. Use the supplied review period for evidence
and champion assessment; if it is absent, assess the available evidence and state
that the period is unknown. Missing timing alone does not establish urgency.
Keep missing date properties absent and workbook date cells blank. Human reports
may say "Unknown" or "Unagreed"; never write those words into date cells. Preserve
actual supplied dates and report overdue dates against their stated source.
Record the date of an assessment or evidence ingestion as provenance; it does
not create a customer commitment, interaction date, or business deadline.

Invoke the `meddpicc:deal-qualification` skill to produce a
MEDDPICC scorecard for the deal "$ARGUMENTS".

Start from only the files the user explicitly supplies or identifies for
the authorized account workflow. Read any supplied `*.json` conforming to
the MEDDPICC schema, and treat call notes, briefings, transcripts, and CRM
data alongside them as evidence. If a
deal file for "$ARGUMENTS" already exists, resume from it rather
than re-interviewing.

**Modes:**

- Default: guided interview — walks through each MEDDPICC element,
  collects answers into a JSON file
- `--import`: resume an existing partial deal JSON or import from
  an existing file
- `--sfdc <id>`: import deal data from a Salesforce opportunity ID
  before starting the guided interview

**Output:** JSON deal file (source of truth) + Markdown scorecard.
Add "render" or "export" for the spreadsheet too. That is generated
from `engine/workbook-spec.json` — formulas, a Scorecard, colour
coding and dropdowns — and it reads back, so edits made in Excel can
return to the JSON. The engine's `generate` command owns every
coordinate; never lay a sheet out by hand.
