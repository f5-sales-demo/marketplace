#!/usr/bin/env bash
# Phase 1: Structural validation — no external dependencies required.

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
  [ "$name" = "meddpicc" ] || {
    echo "name=$name, expected meddpicc"
    return 1
  }

  local ver
  ver=$(jq -r '.version' "$pj")
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "bad version: $ver"
    return 1
  }
}

# T1.2 — marketplace.json has a matching meddpicc entry
test_marketplace_entry() {
  local mj="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  local pj="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"

  local mp_name
  mp_name=$(jq -r '.plugins[] | select(.name == "meddpicc") | .name' "$mj")
  [ "$mp_name" = "meddpicc" ] || {
    echo "meddpicc entry missing from marketplace.json"
    return 1
  }

  local mp_ver
  mp_ver=$(jq -r '.plugins[] | select(.name == "meddpicc") | .version' "$mj")
  local pj_ver
  pj_ver=$(jq -r '.version' "$pj")
  [ "$mp_ver" = "$pj_ver" ] || {
    echo "version mismatch: marketplace=$mp_ver plugin=$pj_ver"
    return 1
  }

  local src
  src=$(jq -r '.plugins[] | select(.name == "meddpicc") | .source' "$mj")
  [ "$src" = "./plugins/meddpicc" ] || {
    echo "source=$src, expected ./plugins/meddpicc"
    return 1
  }
}

# T1.3 — all expected files exist
test_expected_files_exist() {
  local files=(
    ".xcsh-plugin/plugin.json"
    "skills/champion-test/SKILL.md"
    "skills/coach/SKILL.md"
    "skills/deal-qualification/SKILL.md"
    "skills/deal-review/SKILL.md"
    "skills/deal-update/SKILL.md"
    "skills/mutual-action-plan/SKILL.md"
    "agents/deal-analyst.md"
    "commands/build-map.md"
    "commands/champion-test.md"
    "commands/deal-review.md"
    "commands/meddpicc-status.md"
    "commands/qualify-deal.md"
    "commands/update-deal.md"
  )
  for f in "${files[@]}"; do
    [ -f "$PLUGIN_ROOT/$f" ] || {
      echo "missing: $f"
      return 1
    }
  done
}

# T1.4 — schema directory exists
test_schema_directory_exists() {
  [ -d "$PLUGIN_ROOT/schema" ] || {
    echo "missing: schema/ directory"
    return 1
  }
  [ -f "$PLUGIN_ROOT/schema/meddpicc-schema.json" ] || {
    echo "missing: schema/meddpicc-schema.json"
    return 1
  }
}

# T1.5 — SKILL.md frontmatter has name and description
test_skill_frontmatter() {
  for skill_dir in champion-test coach deal-qualification deal-review deal-update mutual-action-plan; do
    local skill="$PLUGIN_ROOT/skills/$skill_dir/SKILL.md"
    local name_line
    name_line=$(frontmatter_value "$skill" "name")
    [ -n "$name_line" ] || {
      echo "$skill_dir: missing name in frontmatter"
      return 1
    }

    local desc_line
    desc_line=$(frontmatter_value "$skill" "description")
    [ -n "$desc_line" ] || {
      echo "$skill_dir: missing description in frontmatter"
      return 1
    }
  done
}

# T1.6 — command files have description in frontmatter
test_command_frontmatter() {
  for cmd in build-map champion-test deal-review meddpicc-status qualify-deal update-deal; do
    local file="$PLUGIN_ROOT/commands/${cmd}.md"
    local desc
    desc=$(frontmatter_value "$file" "description")
    [ -n "$desc" ] || {
      echo "$cmd: missing description"
      return 1
    }
  done
}
