#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — mdx-content-reviewer agent has frontmatter with tools
test_mdx_content_reviewer_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/mdx-content-reviewer.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "mdx-content-reviewer missing tools in frontmatter"
    return 1
  }

  for tool in Read Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "mdx-content-reviewer missing allowed tool: $tool"
      return 1
    }
  done
}
