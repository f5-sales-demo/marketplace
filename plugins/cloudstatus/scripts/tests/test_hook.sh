#!/usr/bin/env bash
# Phase 2: SessionStart hook behavior.

set -euo pipefail

_get_hook_command() {
  jq -r '.hooks.SessionStart[0].hooks[0].command' "$PLUGIN_ROOT/hooks/hooks.json"
}

# T2.10 — hook succeeds when curl is available and can reach the API
test_hook_succeeds_when_curl_available() {
  command -v curl >/dev/null 2>&1 || {
    echo "SKIP: curl not installed"
    return 0
  }

  local cmd
  cmd=$(_get_hook_command)
  # The hook should either produce no output (API reachable) or a WARNING
  # Either way it should not exit non-zero
  local out
  out=$(bash -c "$cmd" 2>&1) || true
  # If we got output, it should be a WARNING, not a crash
  if [ -n "$out" ]; then
    echo "$out" | grep -q 'WARNING' || {
      echo "expected WARNING or empty output, got: $out"
      return 1
    }
  fi
}

# T2.11 — hook outputs WARNING when curl can't reach the API
test_hook_warns_when_api_unreachable() {
  local cmd
  cmd=$(_get_hook_command)
  # Replace the URL with an unreachable one to simulate failure
  local modified_cmd
  modified_cmd=$(echo "$cmd" | sed 's|https://[^ ]*|https://localhost:1/unreachable|')
  local out
  out=$(bash -c "$modified_cmd" 2>&1) || true
  echo "$out" | grep -q 'WARNING' || {
    echo "expected WARNING in output, got: $out"
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
