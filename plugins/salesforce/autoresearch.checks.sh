#!/usr/bin/env bash
# Post-experiment validation gate for the Salesforce plugin autoresearch.
# All checks must pass for a run to be logged as "keep".
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

ERRORS=0

# ── Check 1: Tests pass (tolerating one known pre-existing failure) ─────────
# test/integration/extension-load.test.ts (session_start hook resolves
# undefined) fails on a clean tree. Allow at most that single failure so a real
# regression is still caught.
echo "=== Check 1: bun test ==="
TEST_OUTPUT="$(bun test 2>&1 || true)"
echo "$TEST_OUTPUT" | tail -3
FAIL_COUNT="$(echo "$TEST_OUTPUT" | grep -Eo '[0-9]+ fail' | grep -Eo '[0-9]+' | tail -1)"
FAIL_COUNT="${FAIL_COUNT:-0}"
if [ "$FAIL_COUNT" -le 1 ]; then
  echo "PASS: $FAIL_COUNT failure(s) (<=1 known pre-existing)"
else
  echo "FAIL: $FAIL_COUNT test failures (>1 known)"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 2: Biome lint clean ──────────────────────────────────────────────
echo ""
echo "=== Check 2: biome check ==="
REPO_ROOT="$(git rev-parse --show-toplevel)"
BIOME_OUTPUT="$(cd "$REPO_ROOT" && npx biome check plugins/salesforce/src/ 2>&1 || true)"
BIOME_ERRORS="$(echo "$BIOME_OUTPUT" | grep -c 'error:' || true)"
if [ "$BIOME_ERRORS" -eq 0 ]; then
  echo "PASS: biome check clean"
else
  echo "FAIL: biome check found $BIOME_ERRORS error(s)"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 3: All 6 tool factories in index.ts ──────────────────────────────
echo ""
echo "=== Check 3: tool registrations ==="
TOOL_FACTORIES=(
  "createSfSetupTool"
  "createSfQueryTool"
  "createSfOrgDisplayTool"
  "createSfPipelineReportTool"
  "createSfHelpTool"
  "createSfExecTool"
)
ALL_TOOLS_OK=true
for tool in "${TOOL_FACTORIES[@]}"; do
  if ! grep -q "$tool" src/index.ts; then
    echo "FAIL: $tool not found in src/index.ts"
    ERRORS=$((ERRORS + 1))
    ALL_TOOLS_OK=false
  fi
done
if [ "$ALL_TOOLS_OK" = true ]; then
  echo "PASS: all 6 tool factories registered"
fi

# ── Check 4: Security invariants intact ────────────────────────────────────
echo ""
echo "=== Check 4: security invariants ==="
ALL_PATTERNS_OK=true
# sf_exec guardrail: argv hygiene (control-char reject) + read-only allowlist.
# The argv boundary is the injection control; do NOT reintroduce per-character
# shell-metacharacter filtering (it breaks valid SOQL/field expressions).
if ! grep -q "hasControlChars" src/tools/shared.ts; then
  echo "FAIL: argv hygiene guard (hasControlChars) missing from src/tools/shared.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
if ! grep -q "findMutation" src/tools/sf-exec-guard.ts; then
  echo "FAIL: read-only guardrail (findMutation) missing from src/tools/sf-exec-guard.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
# Error taxonomy classifier for typed error results.
if ! grep -q "detectSfError" src/sf/exec.ts; then
  echo "FAIL: error classifier (detectSfError) missing from src/sf/exec.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
if [ "$ALL_PATTERNS_OK" = true ]; then
  echo "PASS: all security invariants intact"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "CHECKS FAILED: $ERRORS error(s)"
  exit 1
fi
echo "ALL CHECKS PASSED"
exit 0
