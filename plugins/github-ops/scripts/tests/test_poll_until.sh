#!/usr/bin/env bash

# shellcheck disable=SC1091
_load_all() {
  source "$PLUGIN_ROOT/scripts/libs/budget.sh"
  source "$PLUGIN_ROOT/scripts/libs/retry.sh"
  source "$PLUGIN_ROOT/scripts/libs/gh-poll.sh"
}

# Predicate: body must equal `{"state":"done"}`
_pred_done() { grep -q '"state":"done"' "$1"; }

test_poll_until_returns_done_when_predicate_true_first_call() {
  _load_all
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"state":"done"}'
  export GH_STUB_REMAINING=4000
  out=$(MAX_POLL_WALLCLOCK=5 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done)
  echo "$out" | grep -q 'Status: COMPLETE' || return 1
  echo "$out" | grep -q 'paid_polls=1' || return 1
}

test_poll_until_aborts_when_budget_exhausted() {
  _load_all
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"state":"pending"}'
  export GH_STUB_REMAINING=100
  export GH_STUB_RESET=$(($(date +%s) + 600))
  out=$(MAX_POLL_WALLCLOCK=10 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done || true)
  echo "$out" | grep -q 'Status: BUDGET_EXHAUSTED' || return 1
}

test_poll_until_handles_429_via_retry_with_backoff() {
  _load_all
  export GH_STUB_STATUS=429
  export GH_STUB_RETRY_AFTER=1
  export GH_STUB_BODY='secondary rate limit'
  out=$(MAX_POLL_WALLCLOCK=3 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done 2>&1 || true)
  echo "$out" | grep -q 'RATE_LIMIT_BACKOFF' || return 1
}

test_poll_until_counts_304_as_free_poll() {
  _load_all
  k=$(cache_key GET /x)
  printf 'W/"v"' >"$GITHUB_OPS_HOME/cache/$k.etag"
  printf '{"state":"pending"}' >"$GITHUB_OPS_HOME/cache/$k.body"
  export GH_STUB_STATUS=304
  export GH_STUB_REMAINING=4000
  out=$(MAX_POLL_WALLCLOCK=2 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done || true)
  echo "$out" | grep -q 'free_polls=' || return 1
}

test_predicate_pr_checks_done_pass() {
  _load_all
  f=$(mktemp)
  cat >"$f" <<'EOF'
{"check_runs":[{"status":"completed","conclusion":"success"}]}
EOF
  predicate_pr_checks_done "$f"
}

test_predicate_pr_checks_done_pending() {
  _load_all
  f=$(mktemp)
  cat >"$f" <<'EOF'
{"check_runs":[{"status":"in_progress","conclusion":null}]}
EOF
  ! predicate_pr_checks_done "$f"
}

test_predicate_pr_checks_done_failure_terminal() {
  _load_all
  f=$(mktemp)
  cat >"$f" <<'EOF'
{"check_runs":[{"status":"completed","conclusion":"failure"}]}
EOF
  predicate_pr_checks_done "$f"
}

test_predicate_runs_complete_all_done() {
  _load_all
  f=$(mktemp)
  cat >"$f" <<'EOF'
{"workflow_runs":[{"status":"completed","conclusion":"success"}]}
EOF
  predicate_runs_complete "$f"
}

test_predicate_runs_complete_some_pending() {
  _load_all
  f=$(mktemp)
  cat >"$f" <<'EOF'
{"workflow_runs":[{"status":"completed"},{"status":"queued"}]}
EOF
  ! predicate_runs_complete "$f"
}

test_gh_poll_tsv_includes_retry_after_as_6th_field() {
  _load_all
  export GH_STUB_STATUS=429
  export GH_STUB_RETRY_AFTER=42
  export GH_STUB_BODY='secondary rate limit'
  line=$(gh_poll /x)
  ra=$(echo "$line" | awk -F'\t' '{print $6}')
  [ "$ra" = "42" ] || return 1
}

test_poll_until_uses_actual_retry_after_on_second_failure() {
  _load_all
  export GH_STUB_STATUS=429
  export GH_STUB_RETRY_AFTER=1
  export GH_STUB_BODY='secondary rate limit'
  out=$(MAX_POLL_WALLCLOCK=4 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done 2>&1 || true)
  echo "$out" | grep -q 'RATE_LIMIT_BACKOFF retry_after_seconds=1 ' || return 1
}

test_poll_until_budget_exhausted_is_single_line() {
  _load_all
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"state":"pending"}'
  export GH_STUB_REMAINING=100
  export GH_STUB_RESET=$(($(date +%s) + 600))
  out=$(MAX_POLL_WALLCLOCK=10 POLL_INTERVAL_OVERRIDE=0 poll_until /x _pred_done || true)
  line_count=$(echo "$out" | grep -c 'Status:')
  [ "$line_count" = "1" ] || return 1
  echo "$out" | grep -q 'BUDGET_EXHAUSTED remaining=100' || return 1
  echo "$out" | grep -q 'free_polls=' || return 1
  echo "$out" | grep -q 'paid_polls=' || return 1
  status_token=$(echo "$out" | awk '{print $2}' | head -n1)
  [ "$status_token" = "BUDGET_EXHAUSTED" ] || return 1
}

test_gh_poll_writes_per_pid_log_file() {
  _load_all
  export GH_STUB_STATUS=200
  export GH_STUB_BODY='{"x":1}'
  gh_poll /x >/dev/null
  log="$GITHUB_OPS_HOME/state/poll.$$.log"
  [ -s "$log" ] || return 1
  grep -q '/x' "$log" || return 1
}
