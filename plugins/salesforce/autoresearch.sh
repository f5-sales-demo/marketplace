#!/usr/bin/env bash
# Benchmark harness for the Salesforce plugin autoresearch.
# Outputs METRIC and ASI lines consumed by the xcsh /autoresearch command.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Gate: existing tests ==="
# Every test must pass before benchmarks run.
TEST_OUTPUT="$(bun test 2>&1 || true)"
echo "$TEST_OUTPUT" | tail -3
FAIL_COUNT="$(echo "$TEST_OUTPUT" | grep -Eo '[0-9]+ fail' | grep -Eo '[0-9]+' | tail -1)"
FAIL_COUNT="${FAIL_COUNT:-0}"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "ERROR: $FAIL_COUNT test failures. Aborting benchmark." >&2
  exit 1
fi
echo ""

echo "=== Running benchmark scenarios ==="
bun run benchmarks/scenarios.ts
