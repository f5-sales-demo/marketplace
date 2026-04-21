#!/usr/bin/env bash

# shellcheck disable=SC1091
_load_budget() { source "$PLUGIN_ROOT/scripts/libs/budget.sh"; }

test_next_interval_green_zone_is_20() {
  _load_budget
  [ "$(next_interval 2000 $(($(date +%s) + 3600)))" = "20" ] || return 1
}

test_next_interval_yellow_zone_is_60() {
  _load_budget
  [ "$(next_interval 800 $(($(date +%s) + 3600)))" = "60" ] || return 1
}

test_next_interval_orange_zone_is_180() {
  _load_budget
  [ "$(next_interval 300 $(($(date +%s) + 3600)))" = "180" ] || return 1
}

test_jitter_within_expected_range() {
  _load_budget
  for _ in $(seq 1 50); do
    v=$(apply_jitter 100)
    [ "$v" -ge 100 ] || return 1
    [ "$v" -le 125 ] || return 1
  done
}

test_check_budget_floor_ok_when_above_200() {
  _load_budget
  check_budget_floor 250 $(($(date +%s) + 100))
}

test_check_budget_floor_exits_42_when_below_200() {
  _load_budget
  out=$(check_budget_floor 199 $(($(date +%s) + 100)) || echo "rc=$?")
  echo "$out" | grep -q 'BUDGET_EXHAUSTED' || return 1
  echo "$out" | grep -q 'rc=42' || return 1
}

test_check_budget_floor_reports_reset_fields() {
  _load_budget
  reset=$(($(date +%s) + 600))
  out=$(check_budget_floor 199 "$reset" || true)
  echo "$out" | grep -q "reset_at=$reset" || return 1
  echo "$out" | grep -q "minutes_until_reset=" || return 1
}

test_gap_wait_mutation_enforces_1s() {
  _load_budget
  rm -f "$GITHUB_OPS_HOME/state/last_mutation"
  start=$(date +%s%3N)
  budget_gap_wait_mutation
  budget_gap_wait_mutation
  end=$(date +%s%3N)
  [ $((end - start)) -ge 1000 ] || return 1
}

test_gap_wait_mutation_cli_ok() {
  bash "$PLUGIN_ROOT/scripts/libs/budget.sh" gap-wait mutation || return 1
}
