---
description: Ingest authorized deal intelligence into a MEDDPICC deal file
argument-hint: "[account or deal] — then provide a source"
---

# Update Deal

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
