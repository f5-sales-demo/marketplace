#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — api-operator.md has frontmatter with explicit positive permissions
test_api_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/api-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q '^tools:' || {
    echo "api-operator missing explicit tools"
    return 1
  }
}

# T2.2 — config-analyzer.md has frontmatter with explicit positive permissions
test_config_analyzer_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/config-analyzer.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q '^tools:' || {
    echo "config-analyzer missing explicit tools"
    return 1
  }
}

# T2.3 — console-operator.md has frontmatter with explicit positive permissions
test_console_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/console-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q '^tools:' || {
    echo "console-operator missing explicit tools"
    return 1
  }
}
