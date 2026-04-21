#!/usr/bin/env bash
# gh-poll.sh — ETag-cached GET wrapper and POLL_UNTIL orchestrator.
# Sourceable for testing; exports functions when sourced.
# When executed with subcommand args, acts as a CLI.

set -euo pipefail

: "${GITHUB_OPS_HOME:=$HOME/.claude/github-ops}"
: "${GITHUB_OPS_LIB:=$GITHUB_OPS_HOME/lib}"

atomic_write() {
  local dst="$1"
  local content="$2"
  local dir
  dir="$(dirname -- "$dst")"
  mkdir -p "$dir"
  local tmp
  tmp="$(mktemp "${dst}.XXXXXX")"
  printf '%s' "$content" >"$tmp"
  mv -f "$tmp" "$dst"
}

cache_key() {
  local method="$1" url="$2"
  printf '%s %s' "$method" "$url" | sha256sum | awk '{print $1}'
}

parse_status() {
  # First line of raw response, e.g. "HTTP/2.0 304\r" or "HTTP/2.0 304"
  local raw="$1"
  printf '%s' "$raw" | awk 'NR==1 { gsub(/\r/, "", $2); print $2; exit }'
}

parse_rate_header() {
  local raw="$1" name="$2"
  printf '%s' "$raw" | awk -v n="$name" '
    /^\r?$/ { exit }
    tolower($0) ~ tolower("^" n ":") {
      sub(/^[^:]*:[[:space:]]*/, "")
      sub(/\r$/, "")
      print
      exit
    }
  '
}

parse_body() {
  local raw="$1"
  printf '%s' "$raw" | awk '
    found { sub(/\r$/, ""); print; next }
    /^\r?$/ { found = 1 }
  ' ORS=
}

gh_poll() {
  cache_trim
  local url="$1"
  local method="GET"
  local key
  key="$(cache_key "$method" "$url")"
  local cache_dir="$GITHUB_OPS_HOME/cache"
  local etag_file="$cache_dir/$key.etag"
  mkdir -p "$cache_dir"

  local -a args=(api -i "$url")
  local etag_hit="etag-miss"
  if [ -s "$etag_file" ]; then
    args+=(--header "If-None-Match: $(cat "$etag_file")")
    etag_hit="etag-sent"
  fi

  local raw
  raw="$(gh "${args[@]}" 2>&1 || true)"
  # `http_status` — not `status` — because zsh aliases $status to $? (readonly).
  local http_status remaining reset etag retry_after
  http_status="$(parse_status "$raw")"
  remaining="$(parse_rate_header "$raw" "X-RateLimit-Remaining")"
  reset="$(parse_rate_header "$raw" "X-RateLimit-Reset")"
  etag="$(parse_rate_header "$raw" "ETag")"
  retry_after="$(parse_rate_header "$raw" "Retry-After")"

  local body_path
  body_path="$(mktemp "$cache_dir/$key.out.XXXXXX")"

  case "$http_status" in
  200)
    local body
    body="$(parse_body "$raw")"
    printf '%s' "$body" >"$body_path"
    atomic_write "$cache_dir/$key.body" "$body"
    [ -n "$etag" ] && atomic_write "$etag_file" "$etag"
    etag_hit="etag-miss"
    ;;
  304)
    cp "$cache_dir/$key.body" "$body_path"
    etag_hit="etag-hit"
    ;;
  403 | 429 | *) : ;;
  esac

  # Per-invocation observability log (append-only, per PID).
  local log_file="$GITHUB_OPS_HOME/state/poll.$$.log"
  mkdir -p "$(dirname -- "$log_file")"
  printf '%s %s %s %s %s %s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$$" "$url" \
    "${http_status:-0}" "${remaining:-}" "$etag_hit" >>"$log_file" 2>/dev/null || true

  # TSV output: http_status, remaining, reset, etag_hit, body_path, retry_after
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${http_status:-0}" "${remaining:-}" "${reset:-}" "$etag_hit" "$body_path" "${retry_after:-}"
}

poll_until() {
  local url="$1" predicate="$2"
  local deadline=$(($(date +%s) + ${MAX_POLL_WALLCLOCK:-1800}))
  local free=0 paid=0 retried=0

  # Cross-module deps — source siblings if present.
  if [ -f "$GITHUB_OPS_LIB/budget.sh" ]; then
    # shellcheck disable=SC1091
    source "$GITHUB_OPS_LIB/budget.sh"
  fi
  if [ -f "$GITHUB_OPS_LIB/retry.sh" ]; then
    # shellcheck disable=SC1091
    source "$GITHUB_OPS_LIB/retry.sh"
  fi

  while [ "$(date +%s)" -lt "$deadline" ]; do
    command -v wait_out_cooldown >/dev/null && wait_out_cooldown

    local line
    line="$(gh_poll "$url")"
    # `http_status` — not `status` — because zsh aliases $status to $? (readonly).
    local http_status remaining reset body_path retry_after_s
    http_status="$(echo "$line" | awk -F'\t' '{print $1}')"
    remaining="$(echo "$line" | awk -F'\t' '{print $2}')"
    reset="$(echo "$line" | awk -F'\t' '{print $3}')"
    body_path="$(echo "$line" | awk -F'\t' '{print $5}')"
    retry_after_s="$(echo "$line" | awk -F'\t' '{print $6}')"

    case "$http_status" in
    200) paid=$((paid + 1)) ;;
    304) free=$((free + 1)) ;;
    403 | 429)
      local ra="${retry_after_s:-60}"
      [ -z "$ra" ] && ra=60
      if [ "$retried" -eq 0 ]; then
        retried=1
        retry_with_backoff "$http_status" "$ra" "$url"
        sleep "$ra"
        rm -f "$body_path"
        continue
      else
        printf 'Status: RATE_LIMIT_BACKOFF retry_after_seconds=%s free_polls=%s paid_polls=%s\n' "$ra" "$free" "$paid"
        rm -f "$body_path"
        return 1
      fi
      ;;
    *)
      printf 'Status: FAILED http_status=%s free_polls=%s paid_polls=%s\n' "$http_status" "$free" "$paid"
      rm -f "$body_path"
      return 1
      ;;
    esac

    if "$predicate" "$body_path"; then
      printf 'Status: COMPLETE free_polls=%s paid_polls=%s body=%s\n' "$free" "$paid" "$body_path"
      return 0
    fi

    if [ -n "$remaining" ] && [ "$remaining" -lt 200 ]; then
      local now mins
      now=$(date +%s)
      mins=$(((${reset:-0} - now + 59) / 60))
      [ "$mins" -lt 0 ] && mins=0
      printf 'Status: BUDGET_EXHAUSTED remaining=%s reset_at=%s minutes_until_reset=%s free_polls=%s paid_polls=%s\n' \
        "$remaining" "${reset:-0}" "$mins" "$free" "$paid"
      rm -f "$body_path"
      return 42
    fi

    local base interval
    base="$(next_interval "${remaining:-5000}" "${reset:-0}")"
    interval="${POLL_INTERVAL_OVERRIDE:-$(apply_jitter "$base")}"
    rm -f "$body_path"
    sleep "$interval"
  done

  printf 'Status: PENDING_TIMEOUT free_polls=%s paid_polls=%s\n' "$free" "$paid"
  return 2
}

predicate_pr_checks_done() {
  local body="$1"
  local pending
  pending="$(jq '[.check_runs[] | select(.status != "completed")] | length' "$body" 2>/dev/null || echo 1)"
  [ "$pending" = "0" ]
}

predicate_runs_complete() {
  local body="$1"
  local pending
  pending="$(jq '[.workflow_runs[] | select(.status != "completed")] | length' "$body" 2>/dev/null || echo 1)"
  [ "$pending" = "0" ]
}

cache_trim() {
  local dir="$GITHUB_OPS_HOME/cache"
  [ -d "$dir" ] || return 0
  find "$dir" -maxdepth 1 -type f -mtime +1 -delete 2>/dev/null || true
  local count
  count=$(find "$dir" -maxdepth 1 -type f | wc -l)
  if [ "$count" -gt 1000 ]; then
    find "$dir" -maxdepth 1 -type f -printf '%T@ %p\n' 2>/dev/null |
      sort -n |
      head -n $((count - 1000)) |
      cut -d' ' -f2- |
      xargs -r rm -f 2>/dev/null || true
  fi
}

# CLI entry point (implemented in later tasks).
if [ "${BASH_SOURCE[0]:-}" = "$0" ]; then
  echo "gh-poll.sh CLI: not yet implemented" >&2
  exit 2
fi
