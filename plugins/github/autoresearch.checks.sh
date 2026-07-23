#!/usr/bin/env bash
# Post-experiment validation gate for the GitHub plugin autoresearch.
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
BIOME_OUTPUT="$(cd "$REPO_ROOT" && npx biome check plugins/github/src/ 2>&1 || true)"
BIOME_ERRORS="$(echo "$BIOME_OUTPUT" | grep -c 'error:' || true)"
if [ "$BIOME_ERRORS" -eq 0 ]; then
  echo "PASS: biome check clean"
else
  echo "FAIL: biome check found $BIOME_ERRORS error(s)"
  ERRORS=$((ERRORS + 1))
fi

# ── Check 3: All 11 tool classes in index.ts ──────────────────────────────
echo ""
echo "=== Check 3: tool registrations ==="
TOOL_CLASSES=(
  "GhRepoViewTool"
  "GhIssueViewTool"
  "GhPrViewTool"
  "GhPrDiffTool"
  "GhPrCheckoutTool"
  "GhPrPushTool"
  "GhRunWatchTool"
  "GhSearchIssuesTool"
  "GhSearchPrsTool"
  "GhHelpTool"
  "GhExecTool"
)
ALL_TOOLS_OK=true
for tool in "${TOOL_CLASSES[@]}"; do
  if ! grep -q "$tool" src/index.ts; then
    echo "FAIL: $tool not found in src/index.ts"
    ERRORS=$((ERRORS + 1))
    ALL_TOOLS_OK=false
  fi
done
if [ "$ALL_TOOLS_OK" = true ]; then
  echo "PASS: all 11 tool classes registered"
fi

# ── Check 4: Security invariants intact ────────────────────────────────────
echo ""
echo "=== Check 4: security invariants ==="
ALL_PATTERNS_OK=true
# gh_exec guardrail: argv hygiene (control-char reject) + read-only allowlist.
# The argv boundary is the injection control; do NOT reintroduce per-character
# shell-metacharacter filtering (it breaks valid --jq expressions).
if ! grep -q "hasControlChars" src/tools/gh-exec-guard.ts; then
  echo "FAIL: argv hygiene guard (hasControlChars) missing from src/tools/gh-exec-guard.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
if ! grep -q "findMutation" src/tools/gh-exec-guard.ts; then
  echo "FAIL: read-only guardrail (findMutation) missing from src/tools/gh-exec-guard.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
# Mutation-safety gate for gh_pr_checkout/gh_pr_push.
if ! grep -q "resolveApprovalMode" src/tools/mutation-safety.ts; then
  echo "FAIL: mutation-safety gate (resolveApprovalMode) missing from src/tools/mutation-safety.ts"
  ERRORS=$((ERRORS + 1))
  ALL_PATTERNS_OK=false
fi
if ! grep -q "HEADLESS_BLOCKED_MESSAGE" src/tools/mutation-safety.ts; then
  echo "FAIL: headless block message (HEADLESS_BLOCKED_MESSAGE) missing from src/tools/mutation-safety.ts"
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
