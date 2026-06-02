#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — brand-operator agent has frontmatter with tools and disallowedTools
test_brand_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/brand-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "brand-operator missing tools in frontmatter"
    return 1
  }

  for tool in Read Bash Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "brand-operator missing allowed tool: $tool"
      return 1
    }
  done

  echo "$fm" | grep -q 'disallowedTools:' || {
    echo "brand-operator missing disallowedTools in frontmatter"
    return 1
  }

  for tool in Write Edit Agent; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "brand-operator missing disallowed tool: $tool"
      return 1
    }
  done
}
