#!/usr/bin/env bash
# Phase 1: Structural validation — no aws CLI or session required.

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
  [ "$name" = "aws-status" ] || {
    echo "name=$name, expected aws-status"
    return 1
  }

  local ver
  ver=$(jq -r '.version' "$pj")
  [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "bad version: $ver"
    return 1
  }
}

# T1.2 — marketplace.json has a matching aws-status entry
test_marketplace_entry() {
  local mj="$MARKETPLACE_ROOT/.xcsh-plugin/marketplace.json"
  local pj="$PLUGIN_ROOT/.xcsh-plugin/plugin.json"

  local mp_name
  mp_name=$(jq -r '.plugins[] | select(.name == "aws-status") | .name' "$mj")
  [ "$mp_name" = "aws-status" ] || {
    echo "aws-status entry missing from marketplace.json"
    return 1
  }

  local mp_ver
  mp_ver=$(jq -r '.plugins[] | select(.name == "aws-status") | .version' "$mj")
  local pj_ver
  pj_ver=$(jq -r '.version' "$pj")
  [ "$mp_ver" = "$pj_ver" ] || {
    echo "version mismatch: marketplace=$mp_ver plugin=$pj_ver"
    return 1
  }

  local src
  src=$(jq -r '.plugins[] | select(.name == "aws-status") | .source' "$mj")
  [ "$src" = "./plugins/aws-status" ] || {
    echo "source=$src, expected ./plugins/aws-status"
    return 1
  }
}

# T1.3 — all expected files exist
test_expected_files_exist() {
  local files=(
    ".xcsh-plugin/plugin.json"
    "hooks/hooks.json"
    "skills/aws-index/SKILL.md"
    "skills/aws-auth/SKILL.md"
    "agents/cli-operator.md"
    "commands/aws-login.md"
    "commands/aws-status.md"
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
  for skill_dir in aws-index aws-auth; do
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

# T1.5 — aws-index is not user-invocable
test_index_not_user_invocable() {
  local skill="$PLUGIN_ROOT/skills/aws-index/SKILL.md"
  grep -q 'user-invocable: false' "$skill" || {
    echo "aws-index should be user-invocable: false"
    return 1
  }
}

# T1.6 — aws-auth is not user-invocable
test_auth_not_user_invocable() {
  local skill="$PLUGIN_ROOT/skills/aws-auth/SKILL.md"
  grep -q 'user-invocable: false' "$skill" || {
    echo "aws-auth should be user-invocable: false"
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
  for cmd in aws-login aws-status; do
    local file="$PLUGIN_ROOT/commands/${cmd}.md"
    local desc
    desc=$(frontmatter_value "$file" "description")
    [ -n "$desc" ] || {
      echo "$cmd: missing description"
      return 1
    }
  done
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

# T1.11 — package.json declares xcsh extensions entry point
test_T1_11_package_json_has_xcsh_extensions() {
  local pkg="$PLUGIN_ROOT/package.json"
  if [[ ! -f "$pkg" ]]; then
    echo "SKIP: no package.json"
    return 0
  fi
  local ext
  ext=$(jq -r '.xcsh.extensions[0] // empty' "$pkg")
  if [[ -z "$ext" ]]; then
    echo "FAIL: xcsh.extensions not defined in package.json"
    return 1
  fi
  if [[ ! -f "$PLUGIN_ROOT/$ext" ]]; then
    echo "FAIL: extension entry point $ext does not exist"
    return 1
  fi
}

# T1.12 — src/index.ts exports a default factory
test_T1_12_src_index_exports_default_factory() {
  local entry="$PLUGIN_ROOT/src/index.ts"
  if [[ ! -f "$entry" ]]; then
    echo "SKIP: no src/index.ts"
    return 0
  fi
  if ! grep -q "export default" "$entry"; then
    echo "FAIL: src/index.ts must export default factory"
    return 1
  fi
}

# T1.13 — extension tool count (skipped: aws-status registers 0 tools)
test_T1_13_extension_registers_tools() {
  echo "SKIP: aws-status does not register tools"
  return 0
}

# T1.14 — tool factory files (skipped: no tools directory)
test_T1_14_tool_factories_exist() {
  local tools_dir="$PLUGIN_ROOT/src/tools"
  if [[ ! -d "$tools_dir" ]]; then
    echo "SKIP: no src/tools directory"
    return 0
  fi
}

# T1.15 — hooks.json references /aws-status:setup, not brew
test_T1_15_hook_references_setup_command() {
  local hook="$PLUGIN_ROOT/hooks/hooks.json"
  if [[ ! -f "$hook" ]]; then
    echo "FAIL: hooks.json missing"
    return 1
  fi
  if ! grep -q "aws-status:setup" "$hook"; then
    echo "FAIL: hooks.json should reference /aws-status:setup"
    return 1
  fi
  if grep -q "brew install" "$hook"; then
    echo "FAIL: hooks.json should not hardcode brew (cross-platform)"
    return 1
  fi
}
