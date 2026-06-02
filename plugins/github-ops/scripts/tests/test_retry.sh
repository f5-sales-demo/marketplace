#!/usr/bin/env bash

# shellcheck disable=SC1091
_load_retry() { source "$PLUGIN_ROOT/scripts/libs/retry.sh"; }

test_cooldown_set_writes_later_until() {
  _load_retry
  later=$(($(date +%s) + 60))
  cooldown_set "$later"
  jq -e ".until == $later" "$GITHUB_OPS_HOME/state/cooldown.json" >/dev/null
}

test_cooldown_set_later_wins_over_earlier() {
  _load_retry
  first=$(($(date +%s) + 100))
  second=$(($(date +%s) + 60))
  cooldown_set "$first"
  cooldown_set "$second"
  stored=$(jq -r .until "$GITHUB_OPS_HOME/state/cooldown.json")
  [ "$stored" = "$first" ] || return 1
}

test_cooldown_get_returns_0_when_missing() {
  _load_retry
  [ "$(cooldown_get)" = "0" ] || return 1
}

test_cooldown_get_returns_0_on_malformed_json() {
  _load_retry
  mkdir -p "$GITHUB_OPS_HOME/state"
  printf '{truncated' >"$GITHUB_OPS_HOME/state/cooldown.json"
  [ "$(cooldown_get)" = "0" ] || return 1
}

test_retry_with_backoff_message_includes_status() {
  _load_retry
  msg=$(retry_with_backoff 429 30 /z 2>&1 >/dev/null || true)
  echo "$msg" | grep -q 'http_status=429' || return 1
}

test_wait_out_cooldown_noop_when_unset() {
  _load_retry
  start=$(date +%s)
  wait_out_cooldown
  end=$(date +%s)
  [ $((end - start)) -lt 2 ] || return 1
}

test_wait_out_cooldown_sleeps_until_reset() {
  _load_retry
  later=$(($(date +%s) + 2))
  cooldown_set "$later"
  start=$(date +%s)
  wait_out_cooldown
  end=$(date +%s)
  [ "$end" -ge "$later" ] || return 1
}

test_retry_with_backoff_writes_cooldown() {
  _load_retry
  retry_with_backoff 429 30 /x >/dev/null 2>&1 || true
  stored=$(jq -r .until "$GITHUB_OPS_HOME/state/cooldown.json")
  now=$(date +%s)
  [ "$stored" -ge "$now" ] || return 1
  [ "$stored" -le $((now + 35)) ] || return 1
}

test_retry_with_backoff_missing_retry_after_defaults_60() {
  _load_retry
  retry_with_backoff 429 "" /x >/dev/null 2>&1 || true
  stored=$(jq -r .until "$GITHUB_OPS_HOME/state/cooldown.json")
  now=$(date +%s)
  [ "$stored" -ge $((now + 55)) ] || return 1
}
