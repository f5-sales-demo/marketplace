#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — deal-analyst.md has frontmatter with tools
test_deal_analyst_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/deal-analyst.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools' || {
    echo "deal-analyst missing tools in frontmatter"
    return 1
  }
}
