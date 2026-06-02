#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — api-operator.md has frontmatter with tools and disallowedTools
test_api_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/api-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'disallowedTools' || {
    echo "api-operator missing disallowedTools"
    return 1
  }
}

# T2.2 — config-analyzer.md has frontmatter with tools and disallowedTools
test_config_analyzer_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/config-analyzer.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'disallowedTools' || {
    echo "config-analyzer missing disallowedTools"
    return 1
  }
}

# T2.3 — console-operator.md has frontmatter with tools and disallowedTools
test_console_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/console-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'disallowedTools' || {
    echo "console-operator missing disallowedTools"
    return 1
  }
}
