#!/usr/bin/env bash
# Phase 1: Structural validation — no external tools required.

set -euo pipefail

# --- helpers ---
extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

frontmatter_value() {
  extract_frontmatter "$1" | grep "^${2}:" | head -1
}

# T1.1 — plugin.json is valid JSON with required fields
test_plugin_json_valid() {
  local pj="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"
  jq -e '.name' "$pj" >/dev/null
  jq -e '.description' "$pj" >/dev/null
  jq -e '.version' "$pj" >/dev/null
  jq -e '.author.name' "$pj" >/dev/null

  local name
  name=$(jq -r '.name' "$pj")
  [ "$name" = "osint-framework" ] || {
    echo "name=$name, expected osint-framework"
    return 1
  }

  local ver
  ver=$(jq -r '.version' "$pj")
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "bad version: $ver"
    return 1
  }
}

# T1.2 — marketplace.json has a matching osint-framework entry
test_marketplace_entry() {
  local mj="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  local pj="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"

  local mp_name
  mp_name=$(jq -r '.plugins[] | select(.name == "osint-framework") | .name' "$mj")
  [ "$mp_name" = "osint-framework" ] || {
    echo "osint-framework entry missing from marketplace.json"
    return 1
  }

  local mp_ver
  mp_ver=$(jq -r '.plugins[] | select(.name == "osint-framework") | .version' "$mj")
  local pj_ver
  pj_ver=$(jq -r '.version' "$pj")
  [ "$mp_ver" = "$pj_ver" ] || {
    echo "version mismatch: marketplace=$mp_ver plugin=$pj_ver"
    return 1
  }

  local src
  src=$(jq -r '.plugins[] | select(.name == "osint-framework") | .source' "$mj")
  [ "$src" = "./plugins/osint-framework" ] || {
    echo "source=$src, expected ./plugins/osint-framework"
    return 1
  }
}

# T1.3 — expected directories exist
test_expected_directories() {
  local dirs=(
    "skills"
    "agents"
    "commands"
    "hooks"
  )
  for d in "${dirs[@]}"; do
    [ -d "$PLUGIN_ROOT/$d" ] || {
      echo "missing directory: $d"
      return 1
    }
  done
}

# T1.4 — SKILL.md frontmatter in at least 5 sampled skill dirs has name+description
test_skill_frontmatter() {
  local count=0
  local checked=0
  for skill_dir in "$PLUGIN_ROOT"/skills/*/; do
    [ -d "$skill_dir" ] || continue
    local skill="$skill_dir/SKILL.md"
    [ -f "$skill" ] || continue
    checked=$((checked + 1))
    [ "$checked" -gt 5 ] && break

    local name_line
    name_line=$(frontmatter_value "$skill" "name")
    [ -n "$name_line" ] || {
      echo "$(basename "$skill_dir"): missing name in frontmatter"
      return 1
    }

    local desc_line
    desc_line=$(frontmatter_value "$skill" "description")
    [ -n "$desc_line" ] || {
      echo "$(basename "$skill_dir"): missing description in frontmatter"
      return 1
    }
    count=$((count + 1))
  done

  [ "$count" -ge 5 ] || {
    echo "expected at least 5 skills with valid frontmatter, found $count"
    return 1
  }
}

# T1.5 — hooks.json is valid JSON with correct structure
test_hooks_json_structure() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"
  jq -e '.' "$hj" >/dev/null || {
    echo "hooks.json is not valid JSON"
    return 1
  }

  jq -e '.hooks.PreToolUse' "$hj" >/dev/null || {
    echo "hooks.json missing PreToolUse section"
    return 1
  }

  local hook_type
  hook_type=$(jq -r '.hooks.PreToolUse[0].hooks[0].type' "$hj")
  [ "$hook_type" = "command" ] || {
    echo "hook type=$hook_type, expected command"
    return 1
  }

  local timeout
  timeout=$(jq -r '.hooks.PreToolUse[0].hooks[0].timeout' "$hj")
  [[ "$timeout" =~ ^[0-9]+$ ]] || {
    echo "timeout is not a number: $timeout"
    return 1
  }
}

# T1.6 — at least 35 skill directories exist
test_skill_count() {
  local count
  count=$(find "$PLUGIN_ROOT/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  [ "$count" -ge 35 ] || {
    echo "expected at least 35 skill dirs, found $count"
    return 1
  }
}

# T1.7 — 3 agent files exist
test_agent_count() {
  local count
  count=$(find "$PLUGIN_ROOT/agents" -name '*.md' -type f | wc -l | tr -d ' ')
  [ "$count" -ge 3 ] || {
    echo "expected at least 3 agent files, found $count"
    return 1
  }
}

# T1.8 — 3 command files exist
test_command_count() {
  local count
  count=$(find "$PLUGIN_ROOT/commands" -name '*.md' -type f | wc -l | tr -d ' ')
  [ "$count" -ge 3 ] || {
    echo "expected at least 3 command files, found $count"
    return 1
  }
}
