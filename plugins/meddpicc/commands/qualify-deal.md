---
description: Score and qualify a deal using the MEDDPICC framework with structured JSON output
argument-hint: "[deal name or account] [--import] [--sfdc <opportunity-id>]"
---

Invoke the `meddpicc:deal-qualification` skill to produce a
MEDDPICC scorecard for the deal "$ARGUMENTS".

**Modes:**

- Default: guided interview — walks through each MEDDPICC element,
  collects answers into a JSON file
- `--import`: resume an existing partial deal JSON or import from
  an existing file
- `--sfdc <id>`: import deal data from a Salesforce opportunity ID
  before starting the guided interview

**Output:** JSON deal file (source of truth) + Markdown scorecard.
Add "render" or "export" to also generate an XLS spreadsheet.
