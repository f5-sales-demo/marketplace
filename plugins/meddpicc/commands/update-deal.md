---
description: Ingest sanitized deal intelligence into a MEDDPICC deal file
argument-hint: "[account or deal alias] — then provide a sanitized source"
---

# Update Deal

Invoke the `meddpicc:deal-update` skill to extract MEDDPICC
intelligence from "$ARGUMENTS" and update the matching deal JSON file.

**Accepted sources:**

- Meeting notes or call summaries
- Sanitized email excerpts
- Sanitized online meeting transcripts
- Company-level competitive intelligence reports
- Sanitized Salesforce opportunity exports
- Presentation or demo feedback
- Sanitized text containing deal-relevant information

**Output:** Proposed update diff (for your review) → confirmed
changes written to the deal JSON via `jq` → updated MEDDPICC scorecard.
