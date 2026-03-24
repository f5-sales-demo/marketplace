# Polling Protocol

Replace all `--watch` patterns with single-shot checks
in a sleep loop.

## PR Checks

Pass/fail/pending in one call:

```
gh pr checks <NUMBER> --json bucket \
  --jq 'map(.bucket) | unique | if . == ["pass"] then "pass"
  elif any(. == "fail") then "fail" else "pending" end'
```

## Workflow Run Status

One call per run:

```
gh run view <RUN-ID> --json status,conclusion \
  --jq '"\(.status) \(.conclusion)"'
```

## Loop Rules

- Sleep for the interval defined by the current
  consumption zone (30s GREEN, 60s YELLOW)
- Maximum 20 iterations per polling loop — if still
  pending, report status to user and ask whether to
  continue
- Poll all triggered workflows in one iteration before
  sleeping (batch, not sequential)
- Re-check rate limit every 5 iterations
