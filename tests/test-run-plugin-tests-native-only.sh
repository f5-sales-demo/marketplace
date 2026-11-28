#!/usr/bin/env bash
# Offline driver test: a Bun-only plugin must run and its failure must reach CI.
set -euo pipefail

test_repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/scripts/agent-validation-runtime" "$fixture_root/plugins/native-only" "$fixture_root/bin" "$fixture_root/tests"
cp "$test_repo_root/scripts/run-plugin-tests.sh" "$fixture_root/scripts/run-plugin-tests.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/scripts/check-plugin-runtime-dependencies.sh"
cat >"$fixture_root/scripts/run-plugin-minimum-runtime.sh" <<'MINIMUM'
#!/bin/sh
printf '%s\n' "$1" >>"$XCSH_CI_MINIMUM_SUITE_MARKER"
exit "$XCSH_CI_MINIMUM_SUITE_RESULT"
MINIMUM
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/bin/python3"
# The copied driver does not recursively run its own regression harness.
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-run-plugin-tests-native-only.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-hermetic-cli-diagnostic.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-hermetic-python-startup.sh"
printf '// Offline fixture; the test driver stub owns execution.\n' >"$fixture_root/plugins/native-only/native.test.ts"
printf 'offline frozen graph\n' >"$fixture_root/plugins/native-only/bun.lock"
cat >"$fixture_root/bin/bun" <<'BUN'
#!/bin/sh
if [ "$PWD" = "$REPO_ROOT/plugins/native-only" ] && [ "$1" = test ]; then
  printf 'native-only suite ran\n' >>"$XCSH_CI_NATIVE_SUITE_MARKER"
  exit "$XCSH_CI_NATIVE_SUITE_RESULT"
fi
exit 0
BUN
chmod 700 "$fixture_root/bin/bun" "$fixture_root/bin/python3" "$fixture_root/scripts/check-plugin-runtime-dependencies.sh"
export REPO_ROOT="$fixture_root"
export XCSH_CI_NATIVE_SUITE_MARKER="$fixture_root/native-suite-ran"
export XCSH_CI_NATIVE_SUITE_RESULT=0
export XCSH_CI_MINIMUM_SUITE_MARKER="$fixture_root/minimum-suite-ran"
export XCSH_CI_MINIMUM_SUITE_RESULT=0
export PATH="$fixture_root/bin:$PATH"

if ! bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/pass.log" 2>&1; then
  cat "$fixture_root/pass.log" >&2
  exit 1
fi
if [ ! -s "$XCSH_CI_NATIVE_SUITE_MARKER" ]; then
  echo 'FAIL: normal CI skipped the Bun-only plugin suite' >&2
  exit 1
fi
if [ "$(cat "$XCSH_CI_MINIMUM_SUITE_MARKER")" != salesforce ]; then
  echo 'FAIL: normal CI did not execute the exact minimum-runtime lane' >&2
  exit 1
fi
rm "$XCSH_CI_NATIVE_SUITE_MARKER" "$XCSH_CI_MINIMUM_SUITE_MARKER"
export XCSH_CI_NATIVE_SUITE_RESULT=1
if bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/fail.log" 2>&1; then
  echo 'FAIL: normal CI accepted a failing Bun-only plugin suite' >&2
  exit 1
fi
if [ -e "$XCSH_CI_MINIMUM_SUITE_MARKER" ]; then
  echo 'FAIL: minimum-runtime lane ran after a failed Bun-only plugin' >&2
  exit 1
fi
rm "$XCSH_CI_NATIVE_SUITE_MARKER"
export XCSH_CI_NATIVE_SUITE_RESULT=0
export XCSH_CI_MINIMUM_SUITE_RESULT=19
if bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/minimum-fail.log" 2>&1; then
  echo 'FAIL: normal CI accepted a failing minimum-runtime lane' >&2
  exit 1
fi
if [ ! -s "$XCSH_CI_NATIVE_SUITE_MARKER" ] || [ "$(cat "$XCSH_CI_MINIMUM_SUITE_MARKER")" != salesforce ]; then
  echo 'FAIL: minimum-runtime refusal was not attributed to both exact executed lanes' >&2
  exit 1
fi
echo 'PASS: normal CI runs Bun-only and minimum-runtime lanes and propagates their failures'
