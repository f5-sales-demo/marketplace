#!/usr/bin/env bash
# Phase 1: Structural validation — no sf CLI or org required.

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
  local pj="$PLUGIN_ROOT/.claude-plugin/plugin.json"
  jq -e '.name' "$pj" >/dev/null
  jq -e '.description' "$pj" >/dev/null
  jq -e '.version' "$pj" >/dev/null
  jq -e '.author.name' "$pj" >/dev/null

  local name
  name=$(jq -r '.name' "$pj")
  [ "$name" = "salesforce" ] || {
    echo "name=$name, expected salesforce"
    return 1
  }

  local ver
  ver=$(jq -r '.version' "$pj")
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "bad version: $ver"
    return 1
  }
}

# T1.2 — marketplace.json has a matching salesforce entry
test_marketplace_entry() {
  local mj="$MARKETPLACE_ROOT/.claude-plugin/marketplace.json"
  local pj="$PLUGIN_ROOT/.claude-plugin/plugin.json"

  local mp_name
  mp_name=$(jq -r '.plugins[] | select(.name == "salesforce") | .name' "$mj")
  [ "$mp_name" = "salesforce" ] || {
    echo "salesforce entry missing from marketplace.json"
    return 1
  }

  local mp_ver
  mp_ver=$(jq -r '.plugins[] | select(.name == "salesforce") | .version' "$mj")
  local pj_ver
  pj_ver=$(jq -r '.version' "$pj")
  [ "$mp_ver" = "$pj_ver" ] || {
    echo "version mismatch: marketplace=$mp_ver plugin=$pj_ver"
    return 1
  }

  local src
  src=$(jq -r '.plugins[] | select(.name == "salesforce") | .source' "$mj")
  [ "$src" = "./plugins/salesforce" ] || {
    echo "source=$src, expected ./plugins/salesforce"
    return 1
  }
}

# T1.3 — all expected files exist
test_expected_files_exist() {
  local files=(
    ".claude-plugin/plugin.json"
    "hooks/hooks.json"
    "skills/salesforce-index/SKILL.md"
    "skills/salesforce-auth/SKILL.md"
    "agents/cli-operator.md"
    "commands/sf-login.md"
    "commands/sf-status.md"
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
  for skill_dir in salesforce-index salesforce-auth; do
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

# T1.5 — salesforce-index is not user-invocable
test_index_not_user_invocable() {
  local skill="$PLUGIN_ROOT/skills/salesforce-index/SKILL.md"
  grep -q 'user-invocable: false' "$skill" || {
    echo "salesforce-index should be user-invocable: false"
    return 1
  }
}

# T1.6 — salesforce-auth is not user-invocable
test_auth_not_user_invocable() {
  local skill="$PLUGIN_ROOT/skills/salesforce-auth/SKILL.md"
  grep -q 'user-invocable: false' "$skill" || {
    echo "salesforce-auth should be user-invocable: false"
    return 1
  }
}

# T1.7 — cli-operator.md frontmatter has correct tools and disallowedTools
test_agent_tools() {
  local agent="$PLUGIN_ROOT/agents/cli-operator.md"
  local fm
  fm=$(extract_frontmatter "$agent")

  for tool in Read Bash Glob Grep; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "cli-operator missing allowed tool: $tool"
      return 1
    }
  done

  echo "$fm" | grep -q 'disallowedTools:' || {
    echo "cli-operator missing disallowedTools"
    return 1
  }
  for tool in Write Edit Agent; do
    echo "$fm" | grep -qF "  - $tool" || {
      echo "cli-operator missing disallowed tool: $tool"
      return 1
    }
  done
}

# T1.8 — command files have description in frontmatter
test_command_frontmatter() {
  for cmd in sf-login sf-status; do
    local file="$PLUGIN_ROOT/commands/${cmd}.md"
    local desc
    desc=$(frontmatter_value "$file" "description")
    [ -n "$desc" ] || {
      echo "$cmd: missing description"
      return 1
    }
  done

  local hint
  hint=$(frontmatter_value "$PLUGIN_ROOT/commands/sf-login.md" "argument-hint")
  [ -n "$hint" ] || {
    echo "sf-login: missing argument-hint"
    return 1
  }
}

# T1.9 — hooks.json is valid JSON with correct structure
test_hooks_json_structure() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"
  jq -e '.' "$hj" >/dev/null || {
    echo "hooks.json is not valid JSON"
    return 1
  }

  local hook_type
  hook_type=$(jq -r '.hooks.SessionStart[0].hooks[0].type' "$hj")
  [ "$hook_type" = "command" ] || {
    echo "hook type=$hook_type, expected command"
    return 1
  }

  local timeout
  timeout=$(jq -r '.hooks.SessionStart[0].hooks[0].timeout' "$hj")
  [[ "$timeout" =~ ^[0-9]+$ ]] || {
    echo "timeout is not a number: $timeout"
    return 1
  }
}

# T1.10 — hook command is syntactically valid shell
test_hook_command_syntax() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"
  local cmd
  cmd=$(jq -r '.hooks.SessionStart[0].hooks[0].command' "$hj")
  bash -n <<<"$cmd" || {
    echo "hook command has syntax error"
    return 1
  }
}
