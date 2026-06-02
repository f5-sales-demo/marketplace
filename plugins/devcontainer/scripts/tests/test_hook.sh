#!/usr/bin/env bash
# Phase 2: SessionStart hook behavior.

set -euo pipefail

_get_hook_command() {
  jq -r '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_ROOT/hooks/hooks.json"
}

# T2.1 — hook command has valid syntax
test_hook_command_valid_syntax() {
  local cmd
  cmd=$(_get_hook_command)
  bash -n <<<"$cmd" || {
    echo "hook command has syntax error"
    return 1
  }
}

# T2.2 — hook outputs WARNING when not in a container
test_hook_warns_when_not_in_container() {
  local cmd
  cmd=$(_get_hook_command)
  # On macOS (not in a container), /.dockerenv and /run/.containerenv don't exist
  if [ -f /.dockerenv ] || [ -f /run/.containerenv ]; then
    echo "SKIP: running inside a container"
    return 0
  fi
  local out
  out=$(bash -c "$cmd" 2>&1) || true
  echo "$out" | grep -q 'WARNING' || {
    echo "expected WARNING in output, got: $out"
    return 1
  }
}
