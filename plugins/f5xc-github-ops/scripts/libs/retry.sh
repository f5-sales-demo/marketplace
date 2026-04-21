#!/usr/bin/env bash
# retry.sh — 403/429 handling with host-wide cooldown file.
# Sourceable for testing.

set -euo pipefail

: "${GITHUB_OPS_HOME:=$HOME/.claude/github-ops}"

cooldown_file() { echo "$GITHUB_OPS_HOME/state/cooldown.json"; }

cooldown_get() {
  local f
  f="$(cooldown_file)"
  [ -s "$f" ] || {
    echo 0
    return
  }
  jq -r '.until // 0' "$f" 2>/dev/null || echo 0
}

cooldown_set() {
  local new_until="$1"
  local f
  f="$(cooldown_file)"
  mkdir -p "$(dirname -- "$f")"
  local current
  current="$(cooldown_get)"
  if [ "$new_until" -le "$current" ]; then return 0; fi
  local tmp
  tmp="$(mktemp "${f}.XXXXXX")"
  printf '{"until":%s}\n' "$new_until" >"$tmp"
  mv -f "$tmp" "$f"
}

wait_out_cooldown() {
  local until now sleep_s
  until="$(cooldown_get)"
  now="$(date +%s)"
  sleep_s=$((until - now))
  if [ "$sleep_s" -gt 0 ]; then sleep "$sleep_s"; fi
}

retry_with_backoff() {
  local status="$1" retry_after="$2" url="$3"
  local seconds="${retry_after:-60}"
  local now
  now="$(date +%s)"
  cooldown_set $((now + seconds))
  printf 'Status: RATE_LIMIT_BACKOFF http_status=%s retry_after_seconds=%s url=%s\n' \
    "$status" "$seconds" "$url" >&2
  return 0
}

if [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  echo "retry.sh CLI: not yet implemented" >&2
  exit 2
fi
