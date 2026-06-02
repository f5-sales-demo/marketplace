#!/usr/bin/env bash
# Phase 2: Agent contract validation.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

# T2.1 — each agent file has frontmatter with disallowedTools or explicit tools list
test_agent_has_disallowed_tools() {
  for agent_file in "$PLUGIN_ROOT"/agents/*.md; do
    [ -f "$agent_file" ] || continue
    local name
    name=$(basename "$agent_file")
    local fm
    fm=$(extract_frontmatter "$agent_file")

    # Either disallowedTools OR a tools list is acceptable
    # (researcher agents with Agent tool don't need disallowedTools)
    echo "$fm" | grep -qE 'disallowedTools:|tools:' || {
      echo "$name: missing disallowedTools or tools in frontmatter"
      return 1
    }
  done
}

# T2.2 — each agent file has name and description in frontmatter
test_agent_has_name_description() {
  for agent_file in "$PLUGIN_ROOT"/agents/*.md; do
    [ -f "$agent_file" ] || continue
    local name
    name=$(basename "$agent_file")
    local fm
    fm=$(extract_frontmatter "$agent_file")

    echo "$fm" | grep -q '^name:' || {
      echo "$name: missing name in frontmatter"
      return 1
    }

    echo "$fm" | grep -q 'description:' || {
      echo "$name: missing description in frontmatter"
      return 1
    }
  done
}

# T2.3 — agent files contain response format instructions
test_agent_response_format() {
  for agent_file in "$PLUGIN_ROOT"/agents/*.md; do
    [ -f "$agent_file" ] || continue
    local name
    name=$(basename "$agent_file")

    grep -qi 'result\|report\|output\|response\|protocol\|format' "$agent_file" || {
      echo "$name: missing response format instructions"
      return 1
    }
  done
}
