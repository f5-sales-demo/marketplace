#!/usr/bin/env bash
# Phase 2: SessionStart hook behavior — requires sf CLI.

set -euo pipefail

_get_hook_command() {
  jq -r '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_ROOT/hooks/hooks.json"
}

# T2.1 — hook succeeds with no output when sf is installed
test_hook_succeeds_when_sf_installed() {
  command -v sf >/dev/null 2>&1 || {
    echo "SKIP: sf CLI not installed"
    return 0
  }

  local cmd
  cmd=$(_get_hook_command)
  local out
  out=$(bash -c "$cmd" 2>&1)
  [ -z "$out" ] || {
    echo "expected empty output, got: $out"
    return 1
  }
}

# T2.2 — hook warns when sf is not on PATH
test_hook_warns_when_sf_missing() {
  local cmd
  cmd=$(_get_hook_command)
  local tmp
  tmp=$(mktemp -d)
  ln -s /usr/bin/bash "$tmp/bash"
  ln -s "$(command -v command)" "$tmp/command" 2>/dev/null || true
  local out
  out=$(PATH="$tmp" bash -c "$cmd" 2>&1) || true
  rm -rf "$tmp"
  echo "$out" | grep -q 'WARNING' || {
    echo "expected WARNING in output, got: $out"
    return 1
  }
}
