#!/usr/bin/env bash
# Offline driver test: a Bun-only plugin must run and its failure must reach CI.
set -euo pipefail

test_repo_root=$(cd "$(dirname "$0")/.." && pwd)
fixture_root=$(mktemp -d)
trap 'rm -rf "$fixture_root"' EXIT
mkdir -p "$fixture_root/scripts/agent-validation-runtime" "$fixture_root/plugins/native-only" "$fixture_root/bin" "$fixture_root/tests"
cp "$test_repo_root/scripts/run-plugin-tests.sh" "$fixture_root/scripts/run-plugin-tests.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/scripts/check-plugin-runtime-dependencies.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/bin/python3"
# The copied driver does not recursively run its own regression harness.
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-run-plugin-tests-native-only.sh"
printf '#!/bin/sh\nexit 0\n' >"$fixture_root/tests/test-hermetic-cli-diagnostic.sh"
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
export PATH="$fixture_root/bin:$PATH"

if ! bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/pass.log" 2>&1; then
  cat "$fixture_root/pass.log" >&2
  exit 1
fi
if [ ! -s "$XCSH_CI_NATIVE_SUITE_MARKER" ]; then
  echo 'FAIL: normal CI skipped the Bun-only plugin suite' >&2
  exit 1
fi
export XCSH_CI_NATIVE_SUITE_RESULT=1
if bash "$fixture_root/scripts/run-plugin-tests.sh" >"$fixture_root/fail.log" 2>&1; then
  echo 'FAIL: normal CI accepted a failing Bun-only plugin suite' >&2
  exit 1
fi
echo 'PASS: normal CI runs Bun-only plugins and propagates their failures'
