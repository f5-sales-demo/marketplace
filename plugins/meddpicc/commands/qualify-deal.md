---
description: Score and qualify a deal using the MEDDPICC framework with structured JSON output
argument-hint: "[deal name or account] [--import] [--sfdc <opportunity-id>]"
---

Invoke the `meddpicc:deal-qualification` skill to produce a
MEDDPICC scorecard for the deal "$ARGUMENTS".

Start by inventorying the current workspace: list the files, read
any `*.json` conforming to the MEDDPICC schema, and treat call
notes, briefings and transcripts alongside them as evidence. If a
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
Add "render" or "export" for a spreadsheet too — in an Excel task
pane that means a deal sheet built in the open workbook from the
engine's `render` plan; in the terminal, a populated copy of the
shipped template.
