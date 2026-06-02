#!/usr/bin/env bash
# Phase 2: SessionStart hook behavior.

set -euo pipefail

_get_hook_command() {
  jq -r '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_ROOT/hooks/hooks.json"
}

# T2.10 — hooks.json is valid JSON
test_hooks_json_valid() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"
  jq -e '.' "$hj" >/dev/null || {
    echo "hooks.json is not valid JSON"
    return 1
  }
}

# T2.11 — SessionStart hook has correct structure
test_hook_structure() {
  local hj="$PLUGIN_ROOT/hooks/hooks.json"

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

# T2.12 — hook command is syntactically valid shell
test_hook_command_syntax() {
  local cmd
  cmd=$(_get_hook_command)
  bash -n <<<"$cmd" || {
    echo "hook command has syntax error"
    return 1
  }
}

# T2.13 — hook command references localhost:3002
test_hook_references_firecrawl_endpoint() {
  local cmd
  cmd=$(_get_hook_command)
  echo "$cmd" | grep -q 'localhost:3002' || {
    echo "hook command should reference localhost:3002"
    return 1
  }
}
