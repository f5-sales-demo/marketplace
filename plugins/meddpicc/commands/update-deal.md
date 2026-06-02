---
description: Ingest meeting notes, emails, transcripts, OSINT reports, or any intel into a MEDDPICC deal file
argument-hint: "[account or deal name] — then paste or describe the source"
---

Invoke the `meddpicc:deal-update` skill to extract MEDDPICC
intelligence from "$ARGUMENTS" and update the matching deal JSON file.

**Accepted sources:**

- Meeting notes or call summaries
- Email threads (paste directly)
- Online meeting transcripts
- OSINT or competitive intelligence reports
- Salesforce opportunity exports
- Presentation or demo feedback
- Any text containing deal-relevant information

**Output:** Proposed update diff (for your review) → confirmed
changes written to the deal JSON via `jq` → updated MEDDPICC scorecard.
