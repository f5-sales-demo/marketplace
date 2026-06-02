#!/usr/bin/env bash
# Test runner for the Salesforce plugin.
# Runs every test_*.sh in this directory; each file contains
# bash functions named test_* that exit non-zero on failure.
#
# Usage: ./run-tests.sh [filter-substring]

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PLUGIN_ROOT="$(cd -- "$HERE/../.." && pwd -P)"
MARKETPLACE_ROOT="$(cd -- "$PLUGIN_ROOT/../.." && pwd -P)"

export PLUGIN_ROOT
export MARKETPLACE_ROOT

filter="${1:-}"

fail=0
pass=0
skip=0

for file in "$HERE"/test_*.sh; do
  [ -f "$file" ] || continue
  before=$(declare -F | awk '{print $3}' | sort)
  # shellcheck disable=SC1090
  source "$file"
  after=$(declare -F | awk '{print $3}' | sort)
  new_fns=$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | grep '^test_' || true)
  for fn in $new_fns; do
    [ -n "$filter" ] && [[ "$fn" != *"$filter"* ]] && continue
    tmp="$(mktemp -d)"
    if out=$("$fn" 2>&1); then
      if echo "$out" | grep -q '^SKIP:'; then
        skip=$((skip + 1))
        printf '  SKIP  %s  %s\n' "$fn" "$(echo "$out" | grep '^SKIP:' | head -1)"
      else
        pass=$((pass + 1))
        printf '  PASS  %s\n' "$fn"
      fi
    else
      fail=$((fail + 1))
      printf '  FAIL  %s\n' "$fn"
      printf '%s\n' "$out" | while IFS= read -r line; do printf '    %s\n' "$line"; done
    fi
    rm -rf "$tmp"
  done
done

printf '\n%d passed, %d skipped, %d failed\n' "$pass" "$skip" "$fail"
[ "$fail" -eq 0 ]
