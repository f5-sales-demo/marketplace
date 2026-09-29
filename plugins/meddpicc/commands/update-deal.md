---
description: Ingest authorized deal intelligence into a MEDDPICC deal file
argument-hint: "[account or deal] — then provide a source"
---

# Update Deal

Invoke the `meddpicc:deal-update` skill to extract MEDDPICC
intelligence from "$ARGUMENTS" and update the matching deal JSON file.

**Accepted sources:**

- Meeting notes or call summaries
- Email excerpts
- Online meeting transcripts
- Company-level competitive intelligence reports
- Salesforce opportunity exports
- Presentation or demo feedback
- Other authorized text containing deal-relevant information

**Output:** Proposed update diff (for your review) → confirmed
changes written to the deal JSON via `jq` → updated MEDDPICC scorecard.
