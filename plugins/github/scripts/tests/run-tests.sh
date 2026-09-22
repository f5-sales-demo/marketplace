#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PLUGIN_ROOT="$(cd -- "$HERE/../.." && pwd -P)"
MARKETPLACE_ROOT="$(cd -- "$PLUGIN_ROOT/../.." && pwd -P)"
export PLUGIN_ROOT MARKETPLACE_ROOT

filter="${1:-}"
fail=0
pass=0

for file in "$HERE"/test_*.sh; do
  [ -f "$file" ] || continue
  before=$(declare -F | awk '{print $3}' | sort)
  # shellcheck disable=SC1090
  source "$file"
  after=$(declare -F | awk '{print $3}' | sort)
  new_fns=$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | grep '^test_' || true)
  for fn in $new_fns; do
    [ -n "$filter" ] && [[ "$fn" != *"$filter"* ]] && continue
    if out=$("$fn" 2>&1); then
      pass=$((pass + 1))
      printf '  PASS  %s\n' "$fn"
    else
      fail=$((fail + 1))
      printf '  FAIL  %s\n' "$fn"
      printf '%s\n' "$out" | sed 's/^/    /'
    fi
  done
done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
