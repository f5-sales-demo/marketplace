#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — container-introspector.md has frontmatter with tools
test_container_introspector_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/container-introspector.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools' || {
    echo "container-introspector missing tools in frontmatter"
    return 1
  }
}

# T2.2 — container-maintainer.md has frontmatter with tools
test_container_maintainer_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/container-maintainer.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools' || {
    echo "container-maintainer missing tools in frontmatter"
    return 1
  }
}

# T2.3 — tool-advisor.md has frontmatter with tools
test_tool_advisor_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/tool-advisor.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools' || {
    echo "tool-advisor missing tools in frontmatter"
    return 1
  }
}

# T2.4 — tool-auditor.md has frontmatter with tools
test_tool_auditor_frontmatter() {
  local agent="$PLUGIN_ROOT/agents/tool-auditor.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  echo "$fm" | grep -q 'tools' || {
    echo "tool-auditor missing tools in frontmatter"
    return 1
  }
}
