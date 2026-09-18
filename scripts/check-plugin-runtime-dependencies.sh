#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
REPAIR=false
if [ "${1:-}" = "--repair" ]; then
  REPAIR=true
  shift
fi
if [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--repair]" >&2
  exit 2
fi

EXPECTED_XCSH="20.2.7"
EXPECTED_SALESFORCE_XCSH="21.31.0"
EXPECTED_ANTHROPIC="0.115.0"
EXPECTED_SALESFORCE_ANTHROPIC="0.123.0"
EXPECTED_ACP="1.3.0"
EXPECTED_SALESFORCE_ACP="1.4.0"
EXPECTED_GOOGLE_GENAI="2.15.0"
EXPECTED_SALESFORCE_GOOGLE_GENAI="2.21.0"
EXPECTED_TYPEBOX_RANGE="^0.34.52"
EXPECTED_BUN_TYPES_RANGE="^1.4.2"
EXPECTED_TYPEBOX="0.34.52"
EXPECTED_BUN_TYPES="1.4.2"
RUNTIME_PLUGINS=(aws azure gcloud github gitlab salesforce)
STATIC_FAILURES=0
INSTALLED_FAILURES=0

fail_static() {
  echo "FAIL: $1" >&2
  STATIC_FAILURES=$((STATIC_FAILURES + 1))
}

fail_installed() {
  echo "FAIL: $1" >&2
  INSTALLED_FAILURES=$((INSTALLED_FAILURES + 1))
}

require_json_value() {
  local file="$1"
  local filter="$2"
  local expected="$3"
  local label="$4"
  local actual

  if ! actual=$(jq -er "$filter" "$file" 2>/dev/null); then
    fail_static "$label is missing from ${file#"$REPO_ROOT"/}"
    return
  fi
  if [ "$actual" != "$expected" ]; then
    fail_static "$label is $actual, expected $expected"
  fi
}

require_installed_json_value() {
  local file="$1"
  local filter="$2"
  local expected="$3"
  local label="$4"
  local actual

  if ! actual=$(jq -er "$filter" "$file" 2>/dev/null); then
    fail_installed "$label is missing from ${file#"$REPO_ROOT"/}"
    return
  fi
  if [ "$actual" != "$expected" ]; then
    fail_installed "$label is $actual, expected $expected"
  fi
}

require_lock_version() {
  local lock="$1"
  local package="$2"
  local expected="$3"
  local actual
  local expected_token="\"${package}@${expected}\""

  if ! actual=$(grep -o '"'"${package}"'@[^"]*"' "$lock" | LC_ALL=C sort -u); then
    fail_static "${lock#"$REPO_ROOT"/} does not resolve $package"
    return
  fi
  if [ "$actual" != "$expected_token" ]; then
    fail_static "${lock#"$REPO_ROOT"/} resolves unexpected $package version(s): $actual"
  fi
}

for plugin in "${RUNTIME_PLUGINS[@]}"; do
  package_json="$REPO_ROOT/plugins/$plugin/package.json"
  lock="$REPO_ROOT/plugins/$plugin/bun.lock"
  if [ ! -f "$package_json" ]; then
    fail_static "$plugin package.json is missing"
    continue
  fi
  if [ ! -f "$lock" ]; then
    fail_static "$plugin bun.lock is missing"
    continue
  fi

  expected_xcsh="$EXPECTED_XCSH"
  expected_pi_utils="$EXPECTED_XCSH"
  expected_anthropic="$EXPECTED_ANTHROPIC"
  expected_acp="$EXPECTED_ACP"
  expected_google_genai="$EXPECTED_GOOGLE_GENAI"
  if [ "$plugin" = "salesforce" ]; then
    expected_xcsh="$EXPECTED_SALESFORCE_XCSH"
    expected_pi_utils="$EXPECTED_SALESFORCE_XCSH"
    expected_anthropic="$EXPECTED_SALESFORCE_ANTHROPIC"
    expected_acp="$EXPECTED_SALESFORCE_ACP"
    expected_google_genai="$EXPECTED_SALESFORCE_GOOGLE_GENAI"
  fi
  require_json_value "$package_json" '.peerDependencies["@f5-sales-demo/xcsh"]' \
    "^$expected_xcsh" "$plugin xcsh peer range"
  require_json_value "$package_json" '.devDependencies["@sinclair/typebox"]' \
    "$EXPECTED_TYPEBOX_RANGE" "$plugin TypeBox development range"
  require_json_value "$package_json" '.devDependencies["bun-types"]' \
    "$EXPECTED_BUN_TYPES_RANGE" "$plugin Bun types development range"
  if jq -e '.peerDependencies["@f5-sales-demo/pi-utils"]' "$package_json" >/dev/null 2>&1; then
    require_json_value "$package_json" '.peerDependencies["@f5-sales-demo/pi-utils"]' \
      "^$expected_pi_utils" "$plugin pi-utils peer range"
  fi

  require_lock_version "$lock" '@f5-sales-demo/xcsh' "$expected_xcsh"
  require_lock_version "$lock" '@f5-sales-demo/pi-utils' "$expected_pi_utils"
  require_lock_version "$lock" '@anthropic-ai/sdk' "$expected_anthropic"
  require_lock_version "$lock" '@agentclientprotocol/sdk' "$expected_acp"
  require_lock_version "$lock" '@google/genai' "$expected_google_genai"

  node_modules="$REPO_ROOT/plugins/$plugin/node_modules"
  if [ -d "$node_modules" ]; then
    require_installed_json_value "$node_modules/@f5-sales-demo/xcsh/package.json" '.version' \
      "$expected_xcsh" "$plugin installed xcsh version"
    require_installed_json_value "$node_modules/@f5-sales-demo/pi-utils/package.json" '.version' \
      "$expected_pi_utils" "$plugin installed pi-utils version"
    require_installed_json_value "$node_modules/@anthropic-ai/sdk/package.json" '.version' \
      "$expected_anthropic" "$plugin installed Anthropic SDK version"
    require_installed_json_value "$node_modules/@agentclientprotocol/sdk/package.json" '.version' \
      "$expected_acp" "$plugin installed ACP SDK version"
    require_installed_json_value "$node_modules/@google/genai/package.json" '.version' \
      "$expected_google_genai" "$plugin installed Google GenAI version"
    require_installed_json_value "$node_modules/@sinclair/typebox/package.json" '.version' \
      "$EXPECTED_TYPEBOX" "$plugin installed TypeBox version"
    require_installed_json_value "$node_modules/bun-types/package.json" '.version' \
      "$EXPECTED_BUN_TYPES" "$plugin installed Bun types version"
  elif $REPAIR; then
    # A fresh checkout has no physical graph yet. The test runner calls this checker with
    # --repair as its precondition, so that mode must materialize every runtime plugin graph.
    fail_installed "$plugin node_modules is missing"
  fi
done

if [ "$STATIC_FAILURES" -ne 0 ]; then
  echo "Plugin runtime dependency check failed with $STATIC_FAILURES manifest or lock error(s)." >&2
  exit 1
fi

if [ "$INSTALLED_FAILURES" -ne 0 ] && $REPAIR; then
  command -v bun >/dev/null 2>&1 || {
    echo "FATAL: bun is required to repair plugin runtime dependencies" >&2
    exit 2
  }
  echo "Repairing installed plugin dependencies from frozen lockfiles..." >&2
  for plugin in "${RUNTIME_PLUGINS[@]}"; do
    (
      cd "$REPO_ROOT/plugins/$plugin"
      PUPPETEER_SKIP_DOWNLOAD=1 bun install --force --frozen-lockfile
    ) || exit 1
  done
  exec bash "$0"
fi

if [ "$INSTALLED_FAILURES" -ne 0 ]; then
  echo "Plugin runtime dependency check failed with $INSTALLED_FAILURES installed-package error(s)." >&2
  echo "Run: bash scripts/check-plugin-runtime-dependencies.sh --repair" >&2
  exit 1
fi

echo "Plugin runtime dependency manifests, locks, and installed packages are current."
