# GitHub API Rate Limit Management

The GitHub REST API allows 5,000 calls per hour.
Unthrottled polling (`--watch` flags) can consume
hundreds to thousands of calls per task cycle,
triggering HTTP 403 errors that block all further
operations until the hourly window resets.

## Rate Limit Check

Run this before any polling loop or when budget is
uncertain (costs 1 API call):

```
gh api rate_limit --jq '{
  remaining: .rate.remaining,
  limit: .rate.limit,
  reset_minutes: ((.rate.reset - now) / 60 | ceil)
}'
```

## When to Check

Check rate limits at exactly these 4 points:

1. **Before starting any new task**
2. **Before entering a polling loop** (merging,
   post-merge monitoring)
3. **Before the downstream verification loop**
4. **After any HTTP 403 or 429 response**

## Consumption Zones

| Zone | Remaining | Poll Interval | Behavior |
| ---- | --------- | ------------- | -------- |
| GREEN | >1,000 | 30s | Normal operation |
| YELLOW | 200-1,000 | 60s | Spot-check 3 downstream repos (first, middle, last); skip redundant verification |
| RED | <200 | No polling | Stop and report to user; wait for reset if <15 min away |

## Banned Commands

Never use these — they poll every 3-10 seconds and
consume API calls rapidly:

- `gh pr checks <NUMBER> --watch`
- `gh run watch <RUN-ID>`
- `gh run watch <RUN-ID> --exit-status`

## Budget Estimates

Approximate API calls per operation:

| Operation | Calls |
| --------- | ----- |
| Rate limit check | 1 |
| PR checks (single-shot) | 1 |
| Workflow run status | 1 |
| PR merge | 1 |
| Run list (discover workflows) | 1 |
| Run view (logs) | 1 |
| Issue view | 1 |
| Branch protection check | 1 |
| Downstream repo check (per repo) | 1 |
| Full polling loop (20 iter, 3 runs) | ~65 |
| Full task cycle (standard) | ~100 |
| Full task cycle (governance, 18 repos) | ~150 |

## 403 Recovery Protocol

When an HTTP 403 or 429 response is encountered:

1. Run the rate limit check to extract reset time
2. Calculate minutes until reset
3. Report to user: remaining calls, reset time, and
   what operation was blocked
4. If reset is <15 minutes away, recommend waiting
5. If reset is >15 minutes away, stop all `gh`
   operations and ask user how to proceed
