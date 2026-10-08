#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — pipeline-operator agent has frontmatter with explicit positive permissions
test_pipeline_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/pipeline-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "pipeline-operator missing tools in frontmatter"
    return 1
  }

  for tool in read bash find grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "pipeline-operator missing allowed tool: $tool"
      return 1
    }
  done

  if echo "$fm" | grep -q 'disallowedTools:'; then
    echo "ignored disallowedTools remains"
    return 1
  fi
  for tool in write edit task; do
    if echo "$fm" | grep -qF "  - $tool"; then
      echo "unexpected tool permission: $tool"
      return 1
    fi
  done
}
