#!/usr/bin/env bash
# Benchmark harness for azure-status plugin autoresearch.
# Outputs METRIC and ASI lines consumed by the xcsh /autoresearch command.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Gate: existing tests ==="
if ! bun test 2>&1 | tail -3; then
  echo "ERROR: Tests failed. Aborting benchmark." >&2
  exit 1
fi
echo ""

echo "=== Running benchmark scenarios ==="
bun run benchmarks/scenarios.ts
