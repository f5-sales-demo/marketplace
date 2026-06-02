#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — pipeline-operator agent has frontmatter with tools and disallowedTools
test_pipeline_operator_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/pipeline-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools:' || {
    echo "pipeline-operator missing tools in frontmatter"
    return 1
  }

  for tool in Read Bash Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "pipeline-operator missing allowed tool: $tool"
      return 1
    }
  done

  echo "$fm" | grep -q 'disallowedTools:' || {
    echo "pipeline-operator missing disallowedTools in frontmatter"
    return 1
  }

  for tool in Write Edit Agent; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "pipeline-operator missing disallowed tool: $tool"
      return 1
    }
  done
}
