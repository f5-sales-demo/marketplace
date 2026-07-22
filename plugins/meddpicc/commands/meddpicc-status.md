---
description: >-
  Check MEDDPICC framework readiness and deal data availability
---

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
2. Find deal data files in the current workspace (`*.json` files
   conforming to the schema).
3. **If no deal file is found**, report schema status and the
   available commands, then suggest starting with
   `/meddpicc:qualify-deal`. Stop here.
4. **For each deal file found**, run the engine (it is the source
   of truth for status and scores):

   ```bash
   bun xcsh://plugin/meddpicc/file/engine/cli.ts next  <deal.json>
   bun xcsh://plugin/meddpicc/file/engine/cli.ts score <deal.json>
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

For deeper, evidence-cited qualitative analysis of a deal, delegate
to the read-only `deal-analyst` agent — but note that agent cannot
run the engine, so the deterministic status above must come from
this command's engine calls.
