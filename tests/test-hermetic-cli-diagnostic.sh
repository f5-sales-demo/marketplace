#!/usr/bin/env bash
# Offline diagnostic test: report actual stub calls separately from suite failures.
set -euo pipefail

test_repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/scripts" "$fixture_root/plugins/native-only" "$fixture_root/bin"
cp "$test_repo_root/scripts/check-tests-are-hermetic.sh" "$fixture_root/scripts/check-tests-are-hermetic.sh"
printf '// Offline driver fixture.\n' >"$fixture_root/plugins/native-only/native.test.ts"
cat >"$fixture_root/bin/bun" <<'BUN'
#!/bin/sh
if [ "$XCSH_CI_DIAGNOSTIC_CASE" = with-cli ]; then
  aws
fi
exit 1
BUN
chmod 700 "$fixture_root/bin/bun"
export PATH="$fixture_root/bin:$PATH"
# This fixture tests attribution, not the production eight-second timing gate.
export HERMETIC_SLEEP_SECONDS=0
export XCSH_CI_DIAGNOSTIC_CASE=no-cli
if bash "$fixture_root/scripts/check-tests-are-hermetic.sh" >"$fixture_root/no-cli.log" 2>&1; then
  echo 'FAIL: diagnostic accepted a failing plugin suite' >&2
  exit 1
fi
if ! grep -Fq 'Observed CLI stub calls: none' "$fixture_root/no-cli.log"; then
  cat "$fixture_root/no-cli.log" >&2
  echo 'FAIL: diagnostic did not establish that no CLI stub was called' >&2
  exit 1
fi
if grep -Fq 'A test above spawned a real cloud CLI' "$fixture_root/no-cli.log"; then
  echo 'FAIL: diagnostic attributes an unrelated test failure to a real CLI' >&2
  exit 1
fi
export XCSH_CI_DIAGNOSTIC_CASE=with-cli
if bash "$fixture_root/scripts/check-tests-are-hermetic.sh" >"$fixture_root/with-cli.log" 2>&1; then
  echo 'FAIL: diagnostic accepted a failing plugin suite after a stub call' >&2
  exit 1
fi
if ! grep -Fq 'Observed CLI stub calls: aws' "$fixture_root/with-cli.log"; then
  cat "$fixture_root/with-cli.log" >&2
  echo 'FAIL: diagnostic lost the actual CLI stub attribution' >&2
  exit 1
fi
echo 'PASS: diagnostic reports actual stub calls without assuming a failure cause'
