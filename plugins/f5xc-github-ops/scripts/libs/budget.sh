#!/usr/bin/env bash
# budget.sh — adaptive poll-interval calculator and mutation gate.
# Sourceable for testing; CLI entry point for mutation gap-wait.

set -euo pipefail

: "${GITHUB_OPS_HOME:=$HOME/.claude/github-ops}"

# Returns an integer number of seconds to sleep before the next poll
# given observed X-RateLimit-Remaining and X-RateLimit-Reset headers.
next_interval() {
  local remaining="${1:-}" reset="${2:-}"
  remaining="${remaining:-5000}"
  if [ "$remaining" -gt 1000 ]; then
    echo 20
  elif [ "$remaining" -gt 500 ]; then
    echo 60
  elif [ "$remaining" -ge 200 ]; then
    echo 180
  # <200 zone: caller is responsible for invoking check_budget_floor first.
  else echo 180; fi
}

# Adds 0–25% jitter to an integer interval.
apply_jitter() {
  local base="$1"
  local pct=$((RANDOM % 26))
  echo $((base + base * pct / 100))
}

check_budget_floor() {
  local remaining="$1" reset="$2"
  if [ "$remaining" -ge 200 ]; then return 0; fi
  local now mins
  now=$(date +%s)
  mins=$(((reset - now + 59) / 60))
  [ "$mins" -lt 0 ] && mins=0
  printf 'Status: BUDGET_EXHAUSTED remaining=%s reset_at=%s minutes_until_reset=%s\n' \
    "$remaining" "$reset" "$mins"
  return 42
}

budget_gap_wait_mutation() {
  local stamp="$GITHUB_OPS_HOME/state/last_mutation"
  mkdir -p "$(dirname -- "$stamp")"
  local now last_ms wait_ms
  now=$(date +%s%3N)
  last_ms=$(cat "$stamp" 2>/dev/null || echo 0)
  wait_ms=$((1000 - (now - last_ms)))
  if [ "$wait_ms" -gt 0 ]; then sleep "$(awk -v ms="$wait_ms" 'BEGIN{print ms/1000}')"; fi
  date +%s%3N >"$stamp"
}

if [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  case "${1:-}" in
  gap-wait)
    case "${2:-}" in
    mutation) budget_gap_wait_mutation ;;
    *)
      echo "unknown gap-wait kind" >&2
      exit 2
      ;;
    esac
    ;;
  *)
    echo "usage: budget.sh gap-wait mutation" >&2
    exit 2
    ;;
  esac
fi
