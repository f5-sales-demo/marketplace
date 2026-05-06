# f5xc-meddpicc

MEDDPICC sales qualification and deal-execution framework plugin for Claude Code.

## Overview

This plugin turns MEDDPICC from a checkbox exercise into a **living deal intelligence system**. Qualification data accumulates over weeks and months as you feed in meeting notes, emails, call transcripts, OSINT scans, competitive intel, and Salesforce updates. Every piece of evidence is extracted, mapped to the correct MEDDPICC element, and persisted incrementally to a structured JSON deal file.

The system supports the full deal lifecycle: initial qualification, ongoing intelligence ingestion, weekly structured reviews, champion assessment, and mutual action plan creation.

## What is MEDDPICC?

MEDDPICC is a qualification and deal-execution framework for complex B2B sales:

| Letter | Element | Purpose | Evidence Required |
| ------ | ------- | ------- | ----------------- |
| **M** | Metrics | Quantified business outcomes the customer expects | Baselines, targets, KPIs, measurement systems |
| **E** | Economic Buyer | Individual with final budget authority | Name, title, direct access, priorities |
| **D** | Decision Criteria | Requirements used to evaluate options | Written criteria, priority ranking, competitive position |
| **D** | Decision Process | Step-by-step path from evaluation to agreement | Named owners, dates, gates, approvals |
| **P** | Paper Process | Procurement mechanics (legal, security, signature) | Steps, owners, timelines, artifacts |
| **I** | Identify Pain | Compelling business pain that creates urgency | Quantified impact, triggering events, stakeholder confirmation |
| **C** | Champion | Powerful internal advocate | Concrete actions taken, personal win, organizational influence |
| **C** | Competition | All alternatives (vendors, build, do-nothing) | Customer perception, differentiation strategy, proof points |

Each element is scored 0-4 based on evidence strength, not assumptions. Scores progress as verified evidence accumulates from multiple sources.

## Deal Lifecycle

```text
Day 0               Ongoing                    Weekly
/qualify-deal  -->  /update-deal (repeat)  -->  /deal-review
   |                    |                          |
   v                    v                          v
Create JSON        Ingest intel from          Structured inspection
with guided        meetings, emails,          with score deltas,
interview          transcripts, OSINT         forecast assessment,
                                              and action items
```

Supporting tools at any stage:

- `/champion-test` — assess whether your internal contact is a true champion
- `/build-map` — create a buyer-approved Mutual Action Plan
- `meddpicc-coach` — auto-activated MEDDPICC methodology coaching

## Skills

### Background coaching (auto-activated)

**`meddpicc-coach`** activates automatically when you ask about MEDDPICC methodology, deal qualification, pipeline health, forecast accuracy, or any MEDDPICC element. It provides evidence-based coaching grounded in the plugin's reference library: framework definitions, discovery questions, role responsibilities, deal stage gates, and antipattern remediation.

### Deal qualification (`/f5xc-meddpicc:qualify-deal`)

Creates a new MEDDPICC deal file through a guided interview. Walks through each of the 8 elements sequentially, assigns 0-4 scores using the schema's rubric, and writes a structured JSON file incrementally via `jq`. Supports three modes:

- **Fresh interview** — guided Q&A for a new deal
- **Import** — resume a partial deal file, or import from Salesforce via `--sfdc <opportunity-id>`
- **Review and update** — update an existing complete deal

Output: JSON deal file (source of truth) + Markdown scorecard. Add `render` or `export` to generate an XLS spreadsheet from the deal data.

### Deal update (`/f5xc-meddpicc:update-deal`)

The **primary ongoing interaction**. Accepts any unstructured text, extracts MEDDPICC-relevant intelligence, and proposes updates to the deal JSON. Supported sources include meeting notes, email threads, call transcripts, OSINT reports, competitive intel, Salesforce exports, presentation feedback, and news articles.

The extraction protocol scans for signals mapped to each MEDDPICC element (KPIs, budget statements, procurement steps, pain language, champion actions, competitor mentions, etc.) and presents a structured diff before writing:

- Evidence is **appended** with `[YYYY-MM-DD source-type]` prefixes — history is never overwritten
- Score changes are **recommended with reasoning** and require user confirmation
- Conflicts with existing data are **flagged** for reconciliation
- New stakeholders are **detected** and offered for addition

### Deal review (`/f5xc-meddpicc:deal-review`)

Weekly deal inspection with delta tracking. Loads the existing deal JSON, snapshots current scores for comparison, walks through evidence changes since the last review, and produces:

- **Evidence delta table** showing score changes per element
- **Forecast assessment** — Commit, Best Case, Pipeline, At Risk, or Qualify Out
- **Action items** with named owners, due dates, and success criteria
- Updated `previousElementScores` for next week's delta

### Champion test (`/f5xc-meddpicc:champion-test`)

Standalone assessment of whether an internal contact meets the bar for a true MEDDPICC champion. Scores 5 criteria (Power, Personal Win, Access, Intel, Action) on a 0-3 scale and classifies the contact:

| Score | Classification | Meaning |
| ----- | -------------- | ------- |
| 13-15 | True Champion | Actively selling for you; invest heavily |
| 9-12 | Emerging Champion | Promising but needs a test; give a bigger ask |
| 5-8 | Coach | Helpful insider; find a champion above them |
| 0-4 | Friendly Contact | Do not rely on for deal advancement |

Includes a champion development plan with specific actions for non-True Champions.

### Mutual Action Plan (`/f5xc-meddpicc:build-map`)

Builds a buyer-approved Mutual Action Plan tied to MEDDPICC elements. Works backward from the target close date to create a customer-facing document with:

- Business context (Pain + Metrics)
- Evaluation milestones (Decision Criteria + Decision Process)
- Business case (Metrics + Economic Buyer)
- Procurement timeline (Paper Process + Decision Process)
- Implementation readiness (value realization)

Every task has a named owner, specific date, exit criteria, and dependencies.

## Agents

**`deal-analyst`** — Read-only research agent that analyzes deal health from local files (meeting notes, CRM exports, account plans, proposals). Produces a structured MEDDPICC assessment report with evidence citations, gap analysis, and prioritized actions. Uses WebSearch for competitive intelligence. Does not modify files.

Use the deal-analyst when you want an independent assessment of deal health without changing the deal file, or when you want to analyze multiple deal artifacts in bulk.

## Data Model

Deals are stored as JSON files conforming to the [MEDDPICC schema](schema/meddpicc-schema.json). Each file contains:

- **Metadata** — deal identification, stage, financials, client interactions, Salesforce integration, completion tracking
- **Qualification** — all 8 MEDDPICC elements with definitions, questions, responses, scores, score definitions, evidence, and notes
- **Three Whys** — Why Anything, Why F5, Why Now (for both F5 and partner)
- **Stakeholders** — name, title, role in deal, veto power, beliefs needed, sentiment, F5 owner
- **Sales Strategy** — differentiated value proposition and win strategy
- **Close Plan** — milestones and critical actions with dates and owners
- **Team** — F5 and partner team members assigned to the deal
- **Scoring** — element scores, previous scores (for deltas), overall score, and rating

### File naming

`{accountName}-{dealName}.json` — slugified (lowercase, spaces to hyphens). Stored in the current working directory or a configured path.

### Persistence

All writes use `jq` with atomic tmp-and-mv. Evidence and notes are appended with date-stamped source prefixes for traceability. Scores require user confirmation before changes are written. The file is always current — there is no final "save" step.

### Scoring

- Each element scored 0-4 based on evidence strength
- Overall score: `(sum of 8 scores / 32) x 100`
- Rating: Red (0-13/32), Yellow (14-25/32), Green (26-32/32)

## Reference Library

The plugin includes reference material loaded automatically by skills:

| Reference | Used by | Content |
| --------- | ------- | ------- |
| MEDDPICC Framework | `meddpicc-coach` | Complete definitions and evidence requirements per element |
| Discovery Questions | `meddpicc-coach`, `deal-update` | Field-tested questions mapped to extraction patterns |
| Roles & Responsibilities | `meddpicc-coach` | RACI ownership by team role (AE, SE, CSM, PS, Product, Channel, Legal) |
| Deal Stage Gates | `meddpicc-coach` | What must be true before advancing to the next stage |
| Antipatterns | `meddpicc-coach`, `deal-qualification` | Common failure modes with evidence-based remediation |
| Scoring Rubric | `deal-qualification`, `deal-review` | Objective 0-4 scoring criteria per element |
| Review Template | `deal-review` | Weekly inspection question sets adapted by deal stage |
| MAP Template | `mutual-action-plan` | Customer-facing action plan structure |
| Cell Mapping | `deal-qualification` | JSON-to-Excel cell coordinate mapping for XLS export |
| SFDC Field Mapping | `deal-qualification` | Salesforce opportunity field mapping with transforms |

## Installation

```bash
claude /plugin install --dir ./plugins/f5xc-meddpicc
```

Or add to your marketplace configuration for automatic installation.

### Requirements

- `jq` must be installed for deal file persistence (`apt install jq` or `brew install jq`)
- Salesforce CLI (`sf`) optional — only needed for `--sfdc` imports

## Usage Examples

### Create a new deal (day 0)

```text
/f5xc-meddpicc:qualify-deal Acme Corp
```

Walks through a guided interview: metadata first, then each MEDDPICC element with scoring and evidence collection.

### Import from Salesforce

```text
/f5xc-meddpicc:qualify-deal Acme Corp --sfdc 006Hs00000AbCdEfG
```

Pre-populates the deal JSON from Salesforce fields, then asks targeted questions for missing sections.

### Ingest meeting notes

```text
/f5xc-meddpicc:update-deal Acme Corp
Here are my notes from today's call with the CTO:
- Confirmed $500K budget for API security modernization
- Board mandate to fix API incidents by Q3
- Currently evaluating us and Cloudflare
- Architecture review board meets May 26
```

The AI extracts MEDDPICC signals, presents a proposed update diff with score recommendations, and asks for confirmation before writing.

### Ingest an email from your champion

```text
/f5xc-meddpicc:update-deal Acme Corp
FW: RE: API Gateway eval - internal update
Hey John, wanted to give you a heads up. The architecture review
board approved F5 for the shortlist. Cloudflare pricing came in at
$85K/yr vs your $120K. Legal confirmed their standard review takes
3 weeks. Talk soon, Barney
```

### Run a weekly deal review

```text
/f5xc-meddpicc:deal-review Acme Corp
```

Loads the deal file, snapshots scores for delta tracking, inspects evidence changes, and produces a forecast assessment with action items.

### Test your champion

```text
/f5xc-meddpicc:champion-test Barney Rubble Director of Platform Engineering
```

Scores Power, Personal Win, Access, Intel, and Action (0-3 each) to classify the contact and produce a development plan.

### Build a Mutual Action Plan

```text
/f5xc-meddpicc:build-map Acme Corp
```

Creates a customer-facing document working backward from the target close date, tied to MEDDPICC elements.

### Export to spreadsheet

```text
/f5xc-meddpicc:qualify-deal Acme Corp render
```

Generates an XLS spreadsheet from the deal JSON using the built-in template.

### Get coaching (auto-activates)

```text
How should I approach the Economic Buyer in this deal?
What discovery questions should I ask about Decision Process?
What are the common antipatterns for Champion development?
```

## License

Apache-2.0
