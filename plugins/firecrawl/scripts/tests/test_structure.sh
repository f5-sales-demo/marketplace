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
  [ "$name" = "firecrawl" ] || {
    echo "name=$name, expected firecrawl"
    return 1
  }

  local ver
  ver=$(jq -r '.version' "$pj")
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "bad version: $ver"
    return 1
  }
}

# T1.2 — marketplace.json has a matching firecrawl entry
test_marketplace_entry() {
  local mj="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  local pj="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"

  local mp_name
  mp_name=$(jq -r '.plugins[] | select(.name == "firecrawl") | .name' "$mj")
  [ "$mp_name" = "firecrawl" ] || {
    echo "firecrawl entry missing from marketplace.json"
    return 1
  }

  local mp_ver
  mp_ver=$(jq -r '.plugins[] | select(.name == "firecrawl") | .version' "$mj")
  local pj_ver
  pj_ver=$(jq -r '.version' "$pj")
  [ "$mp_ver" = "$pj_ver" ] || {
    echo "version mismatch: marketplace=$mp_ver plugin=$pj_ver"
    return 1
  }

  local src
  src=$(jq -r '.plugins[] | select(.name == "firecrawl") | .source' "$mj")
  [ "$src" = "./plugins/firecrawl" ] || {
    echo "source=$src, expected ./plugins/firecrawl"
    return 1
  }
}

# T1.3 — expected files and directories exist
test_expected_files_exist() {
  local files=(
    ".xcsh-plugin/plugin.json"
    "hooks/hooks.json"
    "skills/web-scraper/SKILL.md"
    "agents/firecrawl-operator.md"
    "agents/firecrawl-researcher.md"
  )
  for f in "${files[@]}"; do
    [ -f "$PLUGIN_ROOT/$f" ] || {
      echo "missing: $f"
      return 1
    }
  done
}

# T1.4 — SKILL.md frontmatter has name and description
test_skill_frontmatter() {
  local skill="$PLUGIN_ROOT/skills/web-scraper/SKILL.md"
  local name_line
  name_line=$(frontmatter_value "$skill" "name")
  [ -n "$name_line" ] || {
    echo "web-scraper: missing name in frontmatter"
    return 1
  }

  local desc_line
  desc_line=$(frontmatter_value "$skill" "description")
  [ -n "$desc_line" ] || {
    echo "web-scraper: missing description in frontmatter"
    return 1
  }
}

# T1.5 — hooks.json exists and is valid JSON
test_hooks_json_exists() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"
  jq -e '.' "$hj" >/dev/null || {
    echo "hooks.json is not valid JSON"
    return 1
  }

  jq -e '.hooks.SessionStart' "$hj" >/dev/null || {
    echo "hooks.json missing SessionStart section"
    return 1
  }
}

# T1.6 — 1 skill directory exists
test_skill_count() {
  local count
  count=$(find "$PLUGIN_ROOT/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  [ "$count" -ge 1 ] || {
    echo "expected at least 1 skill dir, found $count"
    return 1
  }
}

# T1.7 — 2 agent files exist
test_agent_count() {
  local count
  count=$(find "$PLUGIN_ROOT/agents" -name '*.md' -type f | wc -l | tr -d ' ')
  [ "$count" -ge 2 ] || {
    echo "expected at least 2 agent files, found $count"
    return 1
  }
}

# T1.8 — 8 command files exist
test_command_count() {
  local count
  count=$(find "$PLUGIN_ROOT/commands" -name '*.md' -type f | wc -l | tr -d ' ')
  [ "$count" -ge 8 ] || {
    echo "expected at least 8 command files, found $count"
    return 1
  }
}

# T1.9 — command files have description in frontmatter
test_command_frontmatter() {
  for cmd_file in "$PLUGIN_ROOT"/commands/*.md; do
    [ -f "$cmd_file" ] || continue
    local name
    name=$(basename "$cmd_file")
    local desc
    desc=$(frontmatter_value "$cmd_file" "description")
    [ -n "$desc" ] || {
      echo "$name: missing description"
      return 1
    }
  done
}
