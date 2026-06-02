#!/usr/bin/env bash
# Test runner for f5xc-github-ops shell libs.
# Runs every test_*.sh in this directory; each file contains
# bash functions named test_* that exit non-zero on failure.
#
# Usage: ./run-tests.sh [filter-substring]
#
# Test authoring note: each test function runs under `set -euo pipefail`.
# When exercising stubbed non-2xx paths, capture output with explicit
# failure suppression to avoid premature exits:
#   out=$(gh api -i /endpoint 2>&1) || true

set -euo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
STUBS="$HERE/stubs"
PLUGIN_ROOT="$(cd -- "$HERE/../.." && pwd -P)"
LIB="$PLUGIN_ROOT/scripts/libs"

export PATH="$STUBS:$PATH"
export GITHUB_OPS_LIB="$LIB"
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
    tmp="$(mktemp -d)"
    export GITHUB_OPS_HOME="$tmp"
    mkdir -p "$tmp/cache" "$tmp/state" "$tmp/lib"
    if ("$fn") >"$tmp/out" 2>&1; then
      pass=$((pass + 1))
      printf '  PASS  %s\n' "$fn"
    else
      fail=$((fail + 1))
      printf '  FAIL  %s\n' "$fn"
      sed 's/^/    /' "$tmp/out"
    fi
    rm -rf "$tmp"
  done
done

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
