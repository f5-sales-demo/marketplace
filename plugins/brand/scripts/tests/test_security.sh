#!/usr/bin/env bash
# Phase 1: Security validation — no external dependencies required.

set -euo pipefail

# T1.11 — no hardcoded credentials in plugin files
test_no_hardcoded_credentials() {
  local patterns='password[[:space:]]*=|secret[[:space:]]*=|token=[A-Za-z0-9]|Bearer [A-Za-z0-9]{20,}'
  local scan_dirs=("$PLUGIN_ROOT")

  local matches
  matches=$(grep -rIin -E "$patterns" "${scan_dirs[@]}" \
    --include='*.md' --include='*.json' --include='*.mdx' |
    grep -v 'README.md' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded credentials found:"
    echo "$matches"
    return 1
  fi
}
