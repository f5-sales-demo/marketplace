#!/usr/bin/env bash
# Phase 1: Security validation — no container runtime required.

set -euo pipefail

# T1.11 — no hardcoded credentials in agent or skill files
test_no_hardcoded_credentials() {
  local patterns='password[[:space:]]*=|secret[[:space:]]*=|token=[A-Za-z0-9]|Bearer [A-Za-z0-9]{20,}|api_key=[A-Za-z0-9]'
  local matches
  matches=$(grep -rIin -E "$patterns" "$PLUGIN_ROOT" \
    --include='*.md' --include='*.json' |
    grep -v 'README.md' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded credentials found:"
    echo "$matches"
    return 1
  fi
}
