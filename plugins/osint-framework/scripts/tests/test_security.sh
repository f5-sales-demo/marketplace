#!/usr/bin/env bash
# Phase 1: Security validation — no external tools required.

set -euo pipefail

# T1.20 — no hardcoded API keys in agent or skill files
test_no_hardcoded_api_keys() {
  local patterns='api_key[[:space:]]*=[[:space:]]*["\x27][A-Za-z0-9]{10,}|apikey[[:space:]]*=[[:space:]]*["\x27][A-Za-z0-9]{10,}|Bearer [A-Za-z0-9]{20,}'
  local matches
  matches=$(grep -rIin -E "$patterns" \
    "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/skills" \
    --include='*.md' --include='*.json' |
    grep -v 'OPENCORPORATES_API_KEY' |
    grep -v 'SHODAN_API_KEY' |
    grep -v '\$\{.*API_KEY' |
    grep -v 'YOUR_API_KEY' |
    grep -v 'set .*API_KEY' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded API keys found:"
    echo "$matches"
    return 1
  fi
}

# T1.21 — no credential echo in agent files
test_no_credential_echo() {
  local matches
  matches=$(grep -rIin -E 'echo.*\$(.*password|.*secret|.*token|.*api.key)' \
    "$PLUGIN_ROOT/agents" \
    --include='*.md' ||
    true)

  if [ -n "$matches" ]; then
    echo "Credential echo found in agent files:"
    echo "$matches"
    return 1
  fi
}

# T1.22 — no eval of user input in agent or skill files
test_no_eval_user_input() {
  local matches
  matches=$(grep -rIin -E 'eval\s+.*\$\{?[a-zA-Z]' \
    "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/skills" \
    --include='*.md' --include='*.sh' |
    grep -v '#.*eval' ||
    true)

  if [ -n "$matches" ]; then
    echo "eval of user input found:"
    echo "$matches"
    return 1
  fi
}

# T1.23 — no hardcoded passwords or secrets in skill reference files
test_no_hardcoded_secrets_in_skills() {
  local patterns='password[[:space:]]*=[[:space:]]*["\x27][^$][A-Za-z0-9]{5,}|secret[[:space:]]*=[[:space:]]*["\x27][^$][A-Za-z0-9]{5,}'
  local matches
  matches=$(grep -rIin -E "$patterns" \
    "$PLUGIN_ROOT/skills" \
    --include='*.md' --include='*.json' ||
    true)

  if [ -n "$matches" ]; then
    echo "Possible hardcoded secrets found in skills:"
    echo "$matches"
    return 1
  fi
}
