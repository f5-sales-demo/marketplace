#!/usr/bin/env bash
# Security and command-safety contracts.

set -euo pipefail

test_no_hardcoded_api_keys() {
  local patterns='api_key[[:space:]]*=[[:space:]]*["\x27][A-Za-z0-9]{10,}|apikey[[:space:]]*=[[:space:]]*["\x27][A-Za-z0-9]{10,}|Bearer [A-Za-z0-9]{20,}'
  local matches
  matches=$(grep -rIin -E "$patterns" "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/skills" \
    --include='*.md' --include='*.py' || true)
  [ -z "$matches" ] || {
    echo "$matches"
    return 1
  }
}

test_no_eval_or_shell_true() {
  local matches
  matches=$(grep -rIEn '\beval\b|shell[[:space:]]*=[[:space:]]*True' \
    "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/commands" "$PLUGIN_ROOT/skills" \
    --exclude-dir=tests --include='*.md' --include='*.py' || true)
  [ -z "$matches" ] || {
    echo "$matches"
    return 1
  }
}

test_no_scanning_guidance() {
  if grep -rIEn 'nmap|port scan|service enumeration' "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/skills" \
    --include='*.md' | grep -Eiv 'no port scanning|never.*port scan|do not.*service enumeration'; then
    echo "scanning guidance found"
    return 1
  fi
}
