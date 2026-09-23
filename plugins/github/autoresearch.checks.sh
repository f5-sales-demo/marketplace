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
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  if BIOME_OUTPUT="$(cd "$REPO_ROOT" && npx biome check plugins/github/src/ plugins/github/test/ plugins/github/benchmarks/scenarios.ts 2>&1)"; then
    echo "PASS: biome check clean"
  else
    echo "$BIOME_OUTPUT" | tail -20
    echo "FAIL: biome check failed"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "SKIP: installed cache has no repository lint configuration"
fi

# ── Check 3: Legacy and typed lifecycle tool registrations ────────────────
echo ""
echo "=== Check 3: tool registrations ==="
LEGACY_TOOL_CLASSES=(
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
for tool in "${LEGACY_TOOL_CLASSES[@]}"; do
  if ! grep -q "$tool" src/index.ts; then
    echo "FAIL: $tool not found in src/index.ts"
    ERRORS=$((ERRORS + 1))
    ALL_TOOLS_OK=false
  fi
done
LIFECYCLE_TOOLS=(
  "github_workflow"
  "github_issue_create"
  "github_pr_create"
  "github_pr_auto_merge"
  "github_pr_update_branch"
  "github_worktree_prepare"
  "github_worktree_cleanup"
)
for tool in "${LIFECYCLE_TOOLS[@]}"; do
  if ! grep -q "'$tool'" src/tools/github-workflow.ts; then
    echo "FAIL: $tool not found in src/tools/github-workflow.ts"
    ERRORS=$((ERRORS + 1))
    ALL_TOOLS_OK=false
  fi
done
if [ "$ALL_TOOLS_OK" = true ]; then
  echo "PASS: legacy and typed lifecycle tools registered"
fi

# ── Check 4: Advisory and argv execution contracts ────────────────────────
echo ""
echo "=== Check 4: advisory and argv contracts ==="
CONTRACT_TESTS=(
  "test/tools/gh-exec.test.ts"
  "test/tools/gh-headless-mutations.test.ts"
  "test/tools/github-workflow.test.ts"
  "test/integration-profile.test.ts"
  "test/installed-cache-load.test.ts"
)
if CONTRACT_OUTPUT="$(bun test "${CONTRACT_TESTS[@]}" 2>&1)"; then
  echo "$CONTRACT_OUTPUT" | tail -3
  echo "PASS: advisory, headless mutation, argv, profile, and installed-cache contracts"
else
  echo "$CONTRACT_OUTPUT" | tail -20
  echo "FAIL: advisory and argv contract tests failed"
  ERRORS=$((ERRORS + 1))
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "CHECKS FAILED: $ERRORS error(s)"
  exit 1
fi
echo "ALL CHECKS PASSED"
exit 0
