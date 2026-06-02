#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — demo-housekeeping agent has frontmatter with tools
test_demo_housekeeping_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/demo-housekeeping.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "demo-housekeeping missing tools in frontmatter"
    return 1
  }

  for tool in Read Bash Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "demo-housekeeping missing allowed tool: $tool"
      return 1
    }
  done
}

# T2.2 — demo-researcher agent has frontmatter with tools
test_demo_researcher_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/demo-researcher.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "demo-researcher missing tools in frontmatter"
    return 1
  }

  for tool in Read Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "demo-researcher missing allowed tool: $tool"
      return 1
    }
  done
}
