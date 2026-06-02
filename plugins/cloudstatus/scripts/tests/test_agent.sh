#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

AGENT_FILE="$PLUGIN_ROOT/agents/status-operator.md"

# T2.1 — agent has frontmatter with tools list
test_agent_has_tools() {
  local fm
  fm=$(extract_frontmatter "$AGENT_FILE")

  echo "$fm" | grep -q 'tools:' || {
    echo "status-operator: missing tools in frontmatter"
    return 1
  }
}

# T2.2 — agent has disallowedTools
test_agent_has_disallowed_tools() {
  local fm
  fm=$(extract_frontmatter "$AGENT_FILE")

  echo "$fm" | grep -q 'disallowedTools:' || {
    echo "status-operator: missing disallowedTools in frontmatter"
    return 1
  }
}

# T2.3 — agent has name and description in frontmatter
test_agent_has_name_description() {
  local fm
  fm=$(extract_frontmatter "$AGENT_FILE")

  echo "$fm" | grep -q '^name:' || {
    echo "status-operator: missing name in frontmatter"
    return 1
  }

  echo "$fm" | grep -q 'description:' || {
    echo "status-operator: missing description in frontmatter"
    return 1
  }
}

# T2.4 — agent contains response format instructions
test_agent_response_format() {
  grep -qi 'report\|template\|format' "$AGENT_FILE" || {
    echo "status-operator: missing response format instructions"
    return 1
  }
}
