#!/usr/bin/env bash
# Post-experiment validation gate for azure-status autoresearch.
# All checks must pass for a run to be logged as "keep".
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

ERRORS=0

# ── Check 1: All tests pass ────────────────────────────────────────────────
echo "=== Check 1: bun test ==="
if bun test 2>&1 | tail -3; then
  echo "PASS: all tests passed"
else
  echo "FAIL: bun test failed"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 2: Biome lint clean ──────────────────────────────────────────────
echo ""
echo "=== Check 2: biome check ==="
REPO_ROOT="$(git rev-parse --show-toplevel)"
BIOME_OUTPUT="$(cd "$REPO_ROOT" && npx biome check plugins/azure-status/src/ 2>&1 || true)"
BIOME_ERRORS="$(echo "$BIOME_OUTPUT" | grep -c 'error:' || true)"
if [ "$BIOME_ERRORS" -eq 0 ]; then
  echo "PASS: biome check clean"
else
  echo "FAIL: biome check found $BIOME_ERRORS error(s)"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 3: All 6 tool factory names in index.ts ─────────────────────────
echo ""
echo "=== Check 3: tool registrations ==="
FACTORIES=("createAzAccountTool" "createAzGroupTool" "createAzResourceTool" "createAzVmTool" "createAzExecTool" "createAzHelpTool")
ALL_TOOLS_OK=true
for factory in "${FACTORIES[@]}"; do
  if ! grep -q "$factory" src/index.ts; then
    echo "FAIL: $factory not found in src/index.ts"
    ERRORS=$((ERRORS + 1))
    ALL_TOOLS_OK=false
  fi
done
if [ "$ALL_TOOLS_OK" = true ]; then
  echo "PASS: all 6 tool factories registered"
fi

# ── Check 4: Security patterns intact ─────────────────────────────────────
echo ""
echo "=== Check 4: security patterns ==="
PATTERNS=("SAFE_ARG_PATTERN" "SUBSCRIPTION_ID_PATTERN" "RESOURCE_GROUP_PATTERN" "SUBSCRIPTION_NAME_PATTERN" "HELP_PATH_PATTERN" "RESOURCE_TYPE_PATTERN" "TAG_PATTERN")
ALL_PATTERNS_OK=true
for pattern in "${PATTERNS[@]}"; do
  if ! grep -q "export const $pattern" src/az/types.ts; then
    echo "FAIL: $pattern not exported from src/az/types.ts"
    ERRORS=$((ERRORS + 1))
    ALL_PATTERNS_OK=false
  fi
done
if ! grep -q "SAFE_ARG_PATTERN" src/tools/az-exec.ts; then
  echo "FAIL: SAFE_ARG_PATTERN not used in src/tools/az-exec.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
if [ "$ALL_PATTERNS_OK" = true ]; then
  echo "PASS: all security patterns intact"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "CHECKS FAILED: $ERRORS error(s)"
  exit 1
fi
echo "ALL CHECKS PASSED"
exit 0
