#!/usr/bin/env bash
# Phase 2: SessionStart hook behavior.

set -euo pipefail

_get_hook_command() {
  jq -r '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_ROOT/hooks/hooks.json"
}

# T2.1 — hook succeeds silently when F5XC_API_TOKEN is set
test_hook_succeeds_when_token_set() {
  local cmd
  cmd=$(_get_hook_command)
  local out
  out=$(F5XC_API_TOKEN="test-token" bash -c "$cmd" 2>&1)
  [ -z "$out" ] || {
    echo "expected empty output when token set, got: $out"
    return 1
  }
}

# T2.2 — hook outputs WARNING when F5XC_API_TOKEN is not set
test_hook_warns_when_token_unset() {
  local cmd
  cmd=$(_get_hook_command)
  local out
  out=$(
    unset F5XC_API_TOKEN
    bash -c "$cmd" 2>&1
  ) || true
  echo "$out" | grep -q 'WARNING' || {
    echo "expected WARNING in output, got: $out"
    return 1
  }
}
