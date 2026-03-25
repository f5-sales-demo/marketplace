---
name: deal-qualification
description: >-
  Score and qualify a deal using the MEDDPICC framework. Use when the
  user says "qualify this deal", "score the deal", "how healthy is
  this deal", "deal health check", "MEDDPICC score", or "assess this
  opportunity". Produces a structured scorecard with gap analysis and
  recommended next actions.
user-invocable: true
---

# MEDDPICC Deal Qualification

Produce an evidence-based MEDDPICC scorecard for a deal. Walk through
each element, score it, identify gaps, and recommend next actions.

## Initialization

Ask the user to provide deal context. If they provide partial
information, work with what's available and flag the gaps.

## Scoring Protocol

For each MEDDPICC element, assess the evidence and assign a score:

| Score | Label | Meaning |
| ----- | ----- | ------- |
| 3 | **Strong** | Verified evidence from customer; multiple data points |
| 2 | **Developing** | Partial evidence; some assumptions remain |
| 1 | **Weak** | Minimal evidence; mostly assumptions |
| 0 | **Unknown** | No evidence or not yet explored |

## Scoring Rubric

Refer to [scoring-rubric.md](references/scoring-rubric.md) for
detailed scoring criteria for each element.

## Output Format

Produce the scorecard in this exact structure:

```
## MEDDPICC Deal Scorecard

### Deal: [deal name or account]
### Date: [today's date]
### Stage: [current deal stage]
### Overall Score: [X/24]

---

| Element | Score | Evidence Summary | Key Gap |
| ------- | ----- | ---------------- | ------- |
| Metrics | X/3 | [brief] | [gap or "None"] |
| Economic Buyer | X/3 | [brief] | [gap or "None"] |
| Decision Criteria | X/3 | [brief] | [gap or "None"] |
| Decision Process | X/3 | [brief] | [gap or "None"] |
| Paper Process | X/3 | [brief] | [gap or "None"] |
| Identify Pain | X/3 | [brief] | [gap or "None"] |
| Champion | X/3 | [brief] | [gap or "None"] |
| Competition | X/3 | [brief] | [gap or "None"] |

### Risk Assessment

[Overall deal risk level: Low / Medium / High / Critical]
[Key risk factors and their potential impact]

### Top 3 Gaps to Close

1. **[Element]** — [specific gap and why it matters]
   - **Next action:** [specific action]
   - **Owner:** [role]
   - **By when:** [timeframe]

2. **[Element]** — [gap]
   - **Next action:** [action]
   - **Owner:** [role]
   - **By when:** [timeframe]

3. **[Element]** — [gap]
   - **Next action:** [action]
   - **Owner:** [role]
   - **By when:** [timeframe]

### Forecast Recommendation

[Commit / Best Case / Pipeline / At Risk]
[Justification based on evidence]
```

## Scoring Guidelines

- **18–24:** Strong deal — forecast as Commit if Decision Process
  and Paper Process are both 3
- **12–17:** Developing deal — forecast as Best Case with clear
  gap-closing plan
- **6–11:** Early deal — forecast as Pipeline; significant work
  needed
- **0–5:** At risk — qualify out or fundamentally re-approach

## Coaching Behavior

After presenting the scorecard:

1. Highlight the single most critical gap
2. Suggest specific discovery questions to close the top gaps
3. Recommend which team member should own each action
4. Flag any antipatterns you observe
