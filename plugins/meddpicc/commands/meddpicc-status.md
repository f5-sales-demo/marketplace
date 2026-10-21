---
description: >-
  Check MEDDPICC framework readiness and deal data availability
---

# MEDDPICC status

Report MEDDPICC framework readiness and per-deal status. The
deterministic status (ordering, completion, scores) comes from the
plugin engine — never count files or compute scores by hand.

## Protocol

1. Verify the MEDDPICC schema exists: check for
   `schema/meddpicc-schema.json`. Report it as loaded or missing.
   For an at-a-glance framework overview (the 8 elements +
   definitions + workflow), run the engine's L2 hint:

   ```bash
   bun xcsh://plugin/meddpicc/file/engine/cli.ts hint
   ```

   (Add an element key — `… hint <element>` — for that element's
   questions + 0-4 rubric. Local/dev equivalent:
   `bun "$PLUGIN_ROOT/engine/cli.ts" hint …`.)
2. Use only deal JSON files explicitly supplied or identified by the user
   for this workflow. Do not search arbitrary workspace JSON, credentials,
   CRM exports, or account directories. If no files were identified, report
   that deal scope is unavailable; this is not evidence of an empty pipeline.
   For each identified file set `DEAL_FILE` to its exact path and validate it:

   ```bash
   bun xcsh://plugin/meddpicc/file/engine/cli.ts validate "$DEAL_FILE"
   ```

   Report missing, unreadable, malformed, invalid, and legacy files separately.
   Keep the engine's literal corrective guidance. Do not run status/scoring
   on a file that failed validation; continue with other identified files.
3. **If no identified deal file is valid**, report schema status and the
   available commands, then suggest starting with
   `/meddpicc:qualify-deal`. Stop here.
4. **For each valid identified deal file**, run the engine (it is the source
   of truth for status and scores):

   ```bash
   bun xcsh://plugin/meddpicc/file/engine/cli.ts next "$DEAL_FILE"
   bun xcsh://plugin/meddpicc/file/engine/cli.ts score "$DEAL_FILE"
   ```

   (Local/dev equivalent: `bun "$PLUGIN_ROOT/engine/cli.ts" …`.)

   Report from their output:
   - Completion: the `completionStatus` map and the
     `nextIncompleteSection` (the resume point), in the engine's
     canonical `order` — do not tally sections by hand.
   - Scores: `sum` (`X/32`), `overallScore` (percentage), and
     `overallRating` (Red/Yellow/Green) from `score`.
5. Report the available commands: `/meddpicc:qualify-deal`,
   `/meddpicc:deal-review`, `/meddpicc:update-deal`,
   `/meddpicc:build-map`, `/meddpicc:champion-test`.

## Evidence and reporting

Start with schema state, exact identified deal scope, attempted/validated/failed
counts, and collection completion. Framework readiness does not establish deal
health. Show a table with file, validation state, engine resume section, score
(out of 32), percentage, and rating; keep counts and percentages distinct.
Preview the first 12 rows, state the remaining count, and provide all remaining
safe rows once on expansion. Preserve zero, false, empty strings, unknown
values, and literal corrective guidance; unavailable scores remain unknown.
Include the engine completion map in canonical order. Report failures and
warnings alongside successful deals, with each finding's source path.

This command is read-only. Do not invoke deal-update, qualification writes,
workbook generation, migration with `--apply`, Salesforce APIs, or external
communications. For local execution use the resolved installed engine path;
quote each path as one argument, including spaces and apostrophes. Display the
actual executable, subcommand, and effective arguments from the executed call.
Never copy private account values into Git, public receipts, logs, or telemetry.

For deeper, evidence-cited qualitative analysis of a deal, delegate
to the read-only `deal-analyst` agent — but note that agent cannot
run the engine, so the deterministic status above must come from
this command's engine calls.
