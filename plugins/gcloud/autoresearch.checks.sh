#!/usr/bin/env bash
# Post-experiment validation gate for the gcloud plugin autoresearch.
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
BIOME_OUTPUT="$(cd "$REPO_ROOT" && npx biome check plugins/gcloud/src/ 2>&1 || true)"
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
  "createGcloudConfigListTool"
  "createGcloudProjectsListTool"
  "createGcloudComputeInstancesListTool"
  "createGcloudStorageBucketsListTool"
  "createGcloudExecTool"
  "createGcloudHelpTool"
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
# gcloud_exec guardrail: read-only allowlist (checkGcloud) built from the
# all-positionals scan (getPositionals) plus the mutating/dangerous finders,
# and argv hygiene (control-char reject). The argv boundary is the injection
# control; do NOT reintroduce per-character shell-metacharacter filtering (it
# breaks valid gcloud --filter/--format expressions).
for ident in checkGcloud getPositionals findMutating findDangerous; do
  if ! grep -q "$ident" src/tools/gcloud-exec-guard.ts; then
    echo "FAIL: guardrail helper ($ident) missing from src/tools/gcloud-exec-guard.ts"
    ERRORS=$((ERRORS + 1))
    ALL_PATTERNS_OK=false
  fi
done
if ! grep -q "hasControlChars" src/tools/shared.ts; then
  echo "FAIL: argv hygiene guard (hasControlChars) missing from src/tools/shared.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
# Error taxonomy classifier for typed error results.
if ! grep -q "detectGcloudError" src/gcloud/exec.ts; then
  echo "FAIL: error classifier (detectGcloudError) missing from src/gcloud/exec.ts"
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
