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

EXPECTED_XCSH="23.5.1"
LATEST_DEVELOPMENT_XCSH="23.9.5"
EXPECTED_ANTHROPIC="0.124.0"
EXPECTED_ACP="1.4.0"
EXPECTED_GOOGLE_GENAI="2.21.0"
EXPECTED_TYPEBOX_RANGE="^0.34.52"
EXPECTED_BUN_TYPES_RANGE="^1.4.2"
EXPECTED_TYPEBOX="0.34.52"
EXPECTED_BUN_TYPES="1.4.2"
RUNTIME_PLUGINS=(aws azure gcloud platform github gitlab salesforce)
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

  runtime_source="$REPO_ROOT/plugins/$plugin/src"
  if [ -d "$runtime_source" ]; then
    runtime_typebox_imports=$(LC_ALL=C grep -R -n -E --include='*.ts' \
      "from ['\"]@sinclair/typebox['\"]|^import ['\"]@sinclair/typebox['\"]|await import\\(['\"]@sinclair/typebox['\"]\\)" \
      "$runtime_source" || true)
    if [ -n "$runtime_typebox_imports" ]; then
      fail_static "$plugin runtime source imports development-only @sinclair/typebox; use the xcsh host-provided pi.typebox API"
    fi
  fi

  manifest="$REPO_ROOT/plugins/$plugin/.xcsh-plugin/plugin.json"
  if ! expected_xcsh=$(jq -er --arg baseline "$EXPECTED_XCSH" '
    (.minimumRuntimeVersion // $baseline) as $minimum
    | if ($minimum | type) != "string" or
         ($minimum | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) == false
      then error("minimumRuntimeVersion must be an exact stable version")
      else [$baseline, $minimum] | max_by(split(".") | map(tonumber)) end
  ' "$manifest" 2>/dev/null); then
    fail_static "$plugin minimumRuntimeVersion is missing or invalid"
    continue
  fi
  minimum_xcsh="$expected_xcsh"
  development_xcsh=$(jq -er '.devDependencies["@f5-sales-demo/xcsh"]' "$package_json") || {
    fail_static "$plugin development runtime is missing"
    continue
  }
  # Migrate plugins individually; preserve the qualified Salesforce/discovery graph.
  # The exact minimum stays in peerDependencies and gets its own execution lane.
  if [ "$development_xcsh" != "23.5.1" ] && [ "$development_xcsh" != "23.8.0" ] && [ "$development_xcsh" != "23.9.3" ] && [ "$development_xcsh" != "$LATEST_DEVELOPMENT_XCSH" ]; then
    fail_static "$plugin development runtime must be its retained minimum or latest stable $LATEST_DEVELOPMENT_XCSH"
  fi
  if ! jq -en --arg minimum "$minimum_xcsh" --arg development "$development_xcsh" \
    '($development | test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) and
     (($development | split(".") | map(tonumber)) >= ($minimum | split(".") | map(tonumber)))' >/dev/null; then
    fail_static "$plugin development runtime is invalid or below its minimum"
  fi
  expected_pi_utils="$development_xcsh"
  expected_anthropic="$EXPECTED_ANTHROPIC"
  expected_acp="$EXPECTED_ACP"
  expected_google_genai="$EXPECTED_GOOGLE_GENAI"
  expected_xcsh_range=">=$expected_xcsh"
  require_json_value "$package_json" '.peerDependencies["@f5-sales-demo/xcsh"]' \
    "$expected_xcsh_range" "$plugin xcsh peer range"
  require_json_value "$package_json" '.devDependencies["@sinclair/typebox"]' \
    "$EXPECTED_TYPEBOX_RANGE" "$plugin TypeBox development range"
  require_json_value "$package_json" '.devDependencies["bun-types"]' \
    "$EXPECTED_BUN_TYPES_RANGE" "$plugin Bun types development range"
  if jq -e '.peerDependencies["@f5-sales-demo/pi-utils"]' "$package_json" >/dev/null 2>&1; then
    require_json_value "$package_json" '.peerDependencies["@f5-sales-demo/pi-utils"]' \
      ">=$minimum_xcsh" "$plugin pi-utils peer range"
  fi

  expected_xcsh="$development_xcsh"

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
    # Bun's forced frozen install may retain stale package links from a restored
    # node_modules cache. Rebuild the generated graph so repair is deterministic.
    rm -rf "$REPO_ROOT/plugins/$plugin/node_modules"
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
